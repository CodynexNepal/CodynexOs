import { CrmRepository } from '../repository/crm.repository';
import { GovernanceRepository } from '../repository/governance.repository';
import { ApprovalStatus, LeadStage } from '../constant/enum.constant';
import { sha256Hex } from '../utils/encryption.util';
import { ApiError } from '../utils/api-error.util';
import { AuditService } from './audit.service';
import type { BusinessEmailService } from './business-email.service';

export function computeDeterministicLeadScore(input: {
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
}): number {
  let score = 20;
  if (input.email) score += 30;
  if (input.phone) score += 20;
  if (input.website) score += 15;
  if (input.city) score += 15;
  return Math.min(100, score);
}

export class CrmService {
  constructor(
    private readonly crmRepo: CrmRepository,
    private readonly governanceRepo: GovernanceRepository,
    private readonly auditService: AuditService,
    private readonly businessEmailService?: BusinessEmailService,
  ) {}

  listCampaigns(businessId?: string) {
    return this.crmRepo.findCampaigns().then((rows) =>
      businessId ? rows.filter((c) => c.businessId === businessId) : rows,
    );
  }

  async createCampaign(
    data: {
      name: string;
      channel: 'EMAIL' | 'SEO' | 'CONTENT' | 'SOCIAL';
      targetAudience?: string;
      projectId?: string;
      businessId?: string;
      emailAccountId?: string;
    },
    actorId: string,
  ) {
    const campaign = await this.crmRepo.saveCampaign({
      name: data.name,
      channel: data.channel,
      targetAudience: data.targetAudience ?? null,
      projectId: data.projectId ?? null,
      businessId: data.businessId ?? null,
      emailAccountId: data.emailAccountId ?? null,
      status: 'PENDING_APPROVAL',
    });

    await this.governanceRepo.saveApproval({
      projectId: data.projectId ?? null,
      actionType: 'OUTREACH_CAMPAIGN_SEND',
      summary: `Approve marketing campaign: ${campaign.name} (${campaign.channel})`,
      riskAssessment: 'Initial outreach campaigns require CEO approval before sending.',
      payload: {
        campaignId: campaign.id,
        businessId: campaign.businessId,
        emailAccountId: campaign.emailAccountId,
      },
      status: ApprovalStatus.PENDING,
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'MARKETING_CAMPAIGN_CREATED',
      resourceType: 'marketing_campaign',
      resourceId: campaign.id,
    });

    return campaign;
  }

  listLeads(stage?: string, businessId?: string) {
    return this.crmRepo.findLeads(stage).then((rows) =>
      businessId ? rows.filter((l) => l.businessId === businessId) : rows,
    );
  }

  async upsertLead(
    data: {
      businessName: string;
      contactName?: string;
      email?: string;
      phone?: string;
      website?: string;
      city?: string;
      sourceUrl?: string;
      campaignId?: string;
      businessId?: string;
      stage?: LeadStage;
    },
    actorId: string,
  ) {
    let resolvedBusinessId = data.businessId ?? null;
    if (!resolvedBusinessId && data.campaignId) {
      const campaign = await this.crmRepo.findCampaignById(data.campaignId);
      resolvedBusinessId = campaign?.businessId ?? null;
    }

    const dedupSource = `${resolvedBusinessId ?? 'global'}|${data.businessName.toLowerCase().trim()}|${(data.email || data.phone || data.city || '').toLowerCase().trim()}`;
    const dedupHash = sha256Hex(dedupSource);
    const existing = await this.crmRepo.findLeadByDedupHash(dedupHash);

    const score = computeDeterministicLeadScore(data);
    if (existing) {
      if (existing.isOptedOut) {
        throw ApiError.badRequest('Lead has opted out and cannot be re-enrolled.');
      }
      existing.contactName = data.contactName ?? existing.contactName;
      existing.email = data.email ?? existing.email;
      existing.phone = data.phone ?? existing.phone;
      existing.website = data.website ?? existing.website;
      existing.city = data.city ?? existing.city;
      if (resolvedBusinessId) existing.businessId = resolvedBusinessId;
      existing.leadScore = Math.max(existing.leadScore, score);
      if (data.stage) existing.stage = data.stage;
      return this.crmRepo.saveLead(existing);
    }

    const saved = await this.crmRepo.saveLead({
      campaignId: data.campaignId ?? null,
      businessId: resolvedBusinessId,
      businessName: data.businessName,
      contactName: data.contactName ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      website: data.website ?? null,
      city: data.city ?? null,
      sourceUrl: data.sourceUrl ?? null,
      stage: data.stage ?? LeadStage.NEW,
      leadScore: score,
      dedupHash,
      isOptedOut: false,
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'CRM_LEAD_CREATED',
      resourceType: 'crm_lead',
      resourceId: saved.id,
    });

    return saved;
  }

  async markOptOut(leadId: string, actorId: string) {
    const lead = await this.crmRepo.findLeadById(leadId);
    if (!lead) throw ApiError.notFound('Lead not found.');
    lead.isOptedOut = true;
    lead.stage = LeadStage.OPTED_OUT;
    await this.crmRepo.saveLead(lead);

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'CRM_LEAD_OPT_OUT',
      resourceType: 'crm_lead',
      resourceId: lead.id,
    });
    return lead;
  }

  async draftOutreach(
    leadId: string,
    params: {
      subject: string;
      body: string;
      channel: string;
      businessId?: string;
      emailAccountId?: string;
    },
  ) {
    const lead = await this.crmRepo.findLeadById(leadId);
    if (!lead) throw ApiError.notFound('Lead not found.');
    if (lead.isOptedOut) {
      throw ApiError.badRequest('Cannot draft outbound message for an opted-out lead.');
    }

    const campaign = lead.campaignId ? await this.crmRepo.findCampaignById(lead.campaignId) : null;
    const businessId = params.businessId ?? lead.businessId ?? campaign?.businessId ?? null;
    const emailAccountId = params.emailAccountId ?? campaign?.emailAccountId ?? null;

    const saved = await this.crmRepo.saveInteraction({
      leadId: lead.id,
      businessId,
      emailAccountId,
      direction: 'OUTBOUND',
      channel: params.channel || 'EMAIL',
      subject: params.subject,
      body: params.body,
      approvalStatus: 'PENDING_APPROVAL',
    });

    await this.governanceRepo.saveApproval({
      actionType: 'OUTBOUND_EMAIL_SEND',
      summary: `Approve outbound email to ${lead.businessName} (${lead.email || 'no email'})`,
      riskAssessment: 'Outbound prospect emails require CEO approval before sending.',
      payload: {
        interactionId: saved.id,
        leadId: lead.id,
        businessId,
        emailAccountId,
      },
      status: ApprovalStatus.PENDING,
    });

    return saved;
  }

  async approveInteraction(interactionId: string, actorId: string) {
    const interaction = await this.crmRepo.findInteractionById(interactionId);
    if (!interaction) throw ApiError.notFound('Interaction not found.');
    interaction.approvalStatus = 'APPROVED';
    const saved = await this.crmRepo.saveInteraction(interaction);

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'CRM_OUTREACH_APPROVED',
      resourceType: 'crm_interaction',
      resourceId: interaction.id,
    });
    return saved;
  }

  async sendApprovedInteraction(
    interactionId: string,
    actorId: string,
    emailAccountId?: string,
  ) {
    const interaction = await this.crmRepo.findInteractionById(interactionId);
    if (!interaction) throw ApiError.notFound('Interaction not found.');
    if (interaction.approvalStatus === 'SENT') {
      throw ApiError.badRequest('This outreach email has already been sent.');
    }

    const lead = await this.crmRepo.findLeadById(interaction.leadId);
    if (!lead) throw ApiError.notFound('Lead not found.');
    if (lead.isOptedOut) {
      interaction.approvalStatus = 'BLOCKED';
      await this.crmRepo.saveInteraction(interaction);
      throw ApiError.badRequest('Cannot send email to an opted-out lead.');
    }
    if (!lead.email) {
      throw ApiError.badRequest('Lead does not have an email address.');
    }

    const campaign = lead.campaignId ? await this.crmRepo.findCampaignById(lead.campaignId) : null;
    const isCampaignApproved = campaign?.status === 'APPROVED' || campaign?.status === 'ACTIVE';
    if (interaction.approvalStatus !== 'APPROVED' && !isCampaignApproved) {
      throw ApiError.forbidden(
        'CEO approval is required before sending outbound CRM emails.',
      );
    }

    if (!this.businessEmailService) {
      throw ApiError.badRequest('BusinessEmailService is not configured.');
    }

    const resolvedBusinessId =
      interaction.businessId ?? lead.businessId ?? campaign?.businessId ?? null;
    const resolvedAccountId =
      emailAccountId ?? interaction.emailAccountId ?? campaign?.emailAccountId ?? null;

    const dispatch = await this.businessEmailService.sendEmail({
      businessId: resolvedBusinessId,
      emailAccountId: resolvedAccountId,
      to: lead.email,
      subject: interaction.subject || `Following up — ${lead.businessName}`,
      text: interaction.body,
    });

    interaction.businessId = resolvedBusinessId;
    interaction.emailAccountId = dispatch.emailAccountId ?? resolvedAccountId;
    interaction.approvalStatus = 'SENT';
    interaction.sentAt = new Date();
    const saved = await this.crmRepo.saveInteraction(interaction);

    if (lead.stage === LeadStage.NEW || lead.stage === LeadStage.QUALIFIED) {
      lead.stage = LeadStage.CONTACTED;
      await this.crmRepo.saveLead(lead);
    }

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'CRM_OUTREACH_SENT',
      resourceType: 'crm_interaction',
      resourceId: saved.id,
      metadata: {
        to: lead.email,
        fromEmail: dispatch.fromEmail,
        emailAccountId: dispatch.emailAccountId,
        businessId: resolvedBusinessId,
        messageId: dispatch.messageId,
      },
    });

    return { interaction: saved, dispatch };
  }

  listInteractions(leadId?: string) {
    return this.crmRepo.findInteractions(leadId);
  }

  async updateLeadStage(
    leadId: string,
    stage: LeadStage,
    nextFollowUpAt: string | undefined,
    actorId: string,
  ) {
    const lead = await this.crmRepo.findLeadById(leadId);
    if (!lead) throw ApiError.notFound('Lead not found.');
    if (lead.isOptedOut && stage !== LeadStage.OPTED_OUT) {
      throw ApiError.badRequest('Opted-out leads cannot be moved back into active pipeline.');
    }

    lead.stage = stage;
    if (nextFollowUpAt) {
      lead.nextFollowUpAt = new Date(nextFollowUpAt);
    }
    const saved = await this.crmRepo.saveLead(lead);

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'CRM_LEAD_STAGE_UPDATED',
      resourceType: 'crm_lead',
      resourceId: lead.id,
      metadata: { stage },
    });

    return saved;
  }

  async classifyInteractionReply(
    interactionId: string,
    classification: 'INTERESTED' | 'NOT_INTERESTED' | 'OPT_OUT' | 'QUESTION' | 'DEMO_REQUEST',
    actorId: string,
  ) {
    const interaction = await this.crmRepo.findInteractionById(interactionId);
    if (!interaction) throw ApiError.notFound('Interaction not found.');

    interaction.replyClassification = classification;
    await this.crmRepo.saveInteraction(interaction);

    const lead = await this.crmRepo.findLeadById(interaction.leadId);
    if (lead) {
      if (classification === 'OPT_OUT') {
        lead.isOptedOut = true;
        lead.stage = LeadStage.OPTED_OUT;
      } else if (classification === 'DEMO_REQUEST') {
        lead.stage = LeadStage.DEMO_SCHEDULED;
      } else if (classification === 'INTERESTED' || classification === 'QUESTION') {
        lead.stage = LeadStage.REPLIED;
      } else if (classification === 'NOT_INTERESTED') {
        lead.stage = LeadStage.LOST;
      }
      await this.crmRepo.saveLead(lead);
    }

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'CRM_REPLY_CLASSIFIED',
      resourceType: 'crm_interaction',
      resourceId: interaction.id,
      metadata: { classification },
    });

    return interaction;
  }
}
