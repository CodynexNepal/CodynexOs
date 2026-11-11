import { CrmRepository } from '../repository/crm.repository';
import { GovernanceRepository } from '../repository/governance.repository';
import { ApprovalStatus, LeadStage } from '../constant/enum.constant';
import { sha256Hex } from '../utils/encryption.util';
import { ApiError } from '../utils/api-error.util';
import { AuditService } from './audit.service';

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
  ) {}

  listCampaigns() {
    return this.crmRepo.findCampaigns();
  }

  async createCampaign(
    data: { name: string; channel: 'EMAIL' | 'SEO' | 'CONTENT' | 'SOCIAL'; targetAudience?: string; projectId?: string },
    actorId: string,
  ) {
    const campaign = await this.crmRepo.saveCampaign({
      name: data.name,
      channel: data.channel,
      targetAudience: data.targetAudience ?? null,
      projectId: data.projectId ?? null,
      status: 'PENDING_APPROVAL',
    });

    await this.governanceRepo.saveApproval({
      projectId: data.projectId ?? null,
      actionType: 'OUTREACH_CAMPAIGN_SEND',
      summary: `Approve marketing campaign: ${campaign.name} (${campaign.channel})`,
      riskAssessment: 'Initial outreach campaigns require CEO approval before sending.',
      payload: { campaignId: campaign.id },
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

  listLeads(stage?: string) {
    return this.crmRepo.findLeads(stage);
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
      stage?: LeadStage;
    },
    actorId: string,
  ) {
    const dedupSource = `${data.businessName.toLowerCase().trim()}|${(data.email || data.phone || data.city || '').toLowerCase().trim()}`;
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
      existing.leadScore = Math.max(existing.leadScore, score);
      if (data.stage) existing.stage = data.stage;
      return this.crmRepo.saveLead(existing);
    }

    const saved = await this.crmRepo.saveLead({
      campaignId: data.campaignId ?? null,
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
    params: { subject: string; body: string; channel: string },
  ) {
    const lead = await this.crmRepo.findLeadById(leadId);
    if (!lead) throw ApiError.notFound('Lead not found.');
    if (lead.isOptedOut) {
      throw ApiError.badRequest('Cannot draft outbound message for an opted-out lead.');
    }

    return this.crmRepo.saveInteraction({
      leadId: lead.id,
      direction: 'OUTBOUND',
      channel: params.channel || 'EMAIL',
      subject: params.subject,
      body: params.body,
      approvalStatus: 'PENDING_APPROVAL',
    });
  }

  listInteractions(leadId?: string) {
    return this.crmRepo.findInteractions(leadId);
  }
}
