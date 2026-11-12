import { BusinessRepository } from '../repository/business.repository';
import { AuditService } from './audit.service';
import { EmailAccountEntity, EmailProviderType } from '../entities/email-account.entity';
import { createCustomSmtpTransporter, createSmtpTransporter } from '../configs/smtp.config';
import { dotEnvConfig } from '../configs/envConfig';
import { decryptSecret, encryptSecret } from '../utils/encryption.util';
import { ApiError } from '../utils/api-error.util';

export interface SanitizedEmailAccount {
  id: string;
  businessId: string | null;
  label: string;
  provider: EmailProviderType;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasPassword: boolean;
  dailySendLimit: number;
  sentToday: number;
  lastResetDate: string | null;
  isDefault: boolean;
  isActive: boolean;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SendBusinessEmailInput {
  businessId?: string | null;
  emailAccountId?: string | null;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export class BusinessEmailService {
  constructor(
    private readonly businessRepo: BusinessRepository,
    private readonly auditService: AuditService,
  ) {}

  private toSlug(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
  }

  sanitizeEmailAccount(account: EmailAccountEntity): SanitizedEmailAccount {
    return {
      id: account.id,
      businessId: account.businessId,
      label: account.label,
      provider: account.provider,
      fromName: account.fromName,
      fromEmail: account.fromEmail,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpSecure: account.smtpSecure,
      smtpUser: account.smtpUser,
      hasPassword: Boolean(account.smtpPassEncrypted),
      dailySendLimit: account.dailySendLimit,
      sentToday: account.sentToday,
      lastResetDate: account.lastResetDate,
      isDefault: account.isDefault,
      isActive: account.isActive,
      lastVerifiedAt: account.lastVerifiedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  listBusinesses() {
    return this.businessRepo.findAllBusinesses();
  }

  async createBusiness(
    input: {
      name: string;
      slug?: string;
      domain?: string;
      industry?: string;
      description?: string;
      defaultGithubOwner?: string;
    },
    actorId: string,
  ) {
    const slug = this.toSlug(input.slug || input.name);
    if (!slug) {
      throw ApiError.badRequest('Business slug could not be derived from name');
    }
    const existing = await this.businessRepo.findBusinessBySlug(slug);
    if (existing) {
      throw ApiError.badRequest(`Business with slug "${slug}" already exists`);
    }

    const saved = await this.businessRepo.saveBusiness({
      name: input.name.trim(),
      slug,
      domain: input.domain?.trim() || null,
      industry: input.industry?.trim() || null,
      description: input.description?.trim() || null,
      defaultGithubOwner: input.defaultGithubOwner?.trim() || null,
      isActive: true,
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'BUSINESS_CREATED',
      resourceType: 'BUSINESS',
      resourceId: saved.id,
      metadata: { name: saved.name, slug: saved.slug },
    });

    return saved;
  }

  async updateBusiness(
    id: string,
    input: {
      name?: string;
      domain?: string | null;
      industry?: string | null;
      description?: string | null;
      defaultGithubOwner?: string | null;
      isActive?: boolean;
    },
    actorId: string,
  ) {
    const existing = await this.businessRepo.findBusinessById(id);
    if (!existing) throw ApiError.notFound('Business not found');

    if (input.name !== undefined) existing.name = input.name.trim();
    if (input.domain !== undefined) existing.domain = input.domain ? input.domain.trim() : null;
    if (input.industry !== undefined) {
      existing.industry = input.industry ? input.industry.trim() : null;
    }
    if (input.description !== undefined) {
      existing.description = input.description ? input.description.trim() : null;
    }
    if (input.defaultGithubOwner !== undefined) {
      existing.defaultGithubOwner = input.defaultGithubOwner
        ? input.defaultGithubOwner.trim()
        : null;
    }
    if (input.isActive !== undefined) existing.isActive = input.isActive;

    const saved = await this.businessRepo.saveBusiness(existing);
    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'BUSINESS_UPDATED',
      resourceType: 'BUSINESS',
      resourceId: saved.id,
      metadata: { name: saved.name, isActive: saved.isActive },
    });
    return saved;
  }

  async listEmailAccounts(businessId?: string): Promise<SanitizedEmailAccount[]> {
    const accounts = await this.businessRepo.findEmailAccounts(businessId);
    return accounts.map((acc) => this.sanitizeEmailAccount(acc));
  }

  async createEmailAccount(
    input: {
      businessId?: string | null;
      label: string;
      provider?: EmailProviderType;
      fromName: string;
      fromEmail: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpSecure?: boolean;
      smtpUser?: string;
      smtpPass: string;
      dailySendLimit?: number;
      isDefault?: boolean;
    },
    actorId: string,
  ): Promise<SanitizedEmailAccount> {
    const businessId = input.businessId || null;
    if (businessId) {
      const biz = await this.businessRepo.findBusinessById(businessId);
      if (!biz) throw ApiError.notFound('Target business not found');
    }

    const provider: EmailProviderType = input.provider ?? 'GMAIL';
    const smtpHost = input.smtpHost?.trim() || (provider === 'GMAIL' ? 'smtp.gmail.com' : '');
    if (!smtpHost) {
      throw ApiError.badRequest('smtpHost is required for custom SMTP accounts');
    }
    const smtpPort = input.smtpPort ?? 587;
    const smtpSecure = input.smtpSecure ?? smtpPort === 465;
    const smtpUser = (input.smtpUser || input.fromEmail).trim();
    const existingForBiz = await this.businessRepo.findEmailAccounts(businessId ?? undefined);
    const shouldBeDefault = input.isDefault ?? existingForBiz.length === 0;

    if (shouldBeDefault) {
      await this.businessRepo.clearDefaultForBusiness(businessId);
    }

    const saved = await this.businessRepo.saveEmailAccount({
      businessId,
      label: input.label.trim(),
      provider,
      fromName: input.fromName.trim(),
      fromEmail: input.fromEmail.trim(),
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPassEncrypted: encryptSecret(input.smtpPass.trim()),
      dailySendLimit: input.dailySendLimit ?? 100,
      sentToday: 0,
      lastResetDate: new Date().toISOString().slice(0, 10),
      isDefault: shouldBeDefault,
      isActive: true,
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'EMAIL_ACCOUNT_CREATED',
      resourceType: 'EMAIL_ACCOUNT',
      resourceId: saved.id,
      metadata: {
        businessId: saved.businessId,
        provider: saved.provider,
        fromEmail: saved.fromEmail,
        isDefault: saved.isDefault,
      },
    });

    return this.sanitizeEmailAccount(saved);
  }

  async updateEmailAccount(
    id: string,
    input: {
      businessId?: string | null;
      label?: string;
      provider?: EmailProviderType;
      fromName?: string;
      fromEmail?: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpSecure?: boolean;
      smtpUser?: string;
      smtpPass?: string;
      dailySendLimit?: number;
      isDefault?: boolean;
      isActive?: boolean;
    },
    actorId: string,
  ): Promise<SanitizedEmailAccount> {
    const existing = await this.businessRepo.findEmailAccountById(id);
    if (!existing) throw ApiError.notFound('Email account not found');

    if (input.businessId !== undefined) {
      if (input.businessId) {
        const biz = await this.businessRepo.findBusinessById(input.businessId);
        if (!biz) throw ApiError.notFound('Target business not found');
      }
      existing.businessId = input.businessId || null;
    }
    if (input.label !== undefined) existing.label = input.label.trim();
    if (input.provider !== undefined) existing.provider = input.provider;
    if (input.fromName !== undefined) existing.fromName = input.fromName.trim();
    if (input.fromEmail !== undefined) existing.fromEmail = input.fromEmail.trim();
    if (input.smtpHost !== undefined) existing.smtpHost = input.smtpHost.trim();
    if (input.smtpPort !== undefined) existing.smtpPort = input.smtpPort;
    if (input.smtpSecure !== undefined) existing.smtpSecure = input.smtpSecure;
    if (input.smtpUser !== undefined) existing.smtpUser = input.smtpUser.trim();
    if (input.smtpPass && input.smtpPass.trim()) {
      existing.smtpPassEncrypted = encryptSecret(input.smtpPass.trim());
    }
    if (input.dailySendLimit !== undefined) existing.dailySendLimit = input.dailySendLimit;
    if (input.isActive !== undefined) existing.isActive = input.isActive;
    if (input.isDefault === true) {
      await this.businessRepo.clearDefaultForBusiness(existing.businessId);
      existing.isDefault = true;
    } else if (input.isDefault === false) {
      existing.isDefault = false;
    }

    const saved = await this.businessRepo.saveEmailAccount(existing);
    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'EMAIL_ACCOUNT_UPDATED',
      resourceType: 'EMAIL_ACCOUNT',
      resourceId: saved.id,
      metadata: {
        businessId: saved.businessId,
        fromEmail: saved.fromEmail,
        isDefault: saved.isDefault,
        isActive: saved.isActive,
      },
    });

    return this.sanitizeEmailAccount(saved);
  }

  async deleteEmailAccount(id: string, actorId: string) {
    const existing = await this.businessRepo.findEmailAccountById(id);
    if (!existing) throw ApiError.notFound('Email account not found');

    const deleted = await this.businessRepo.deleteEmailAccount(id);
    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'EMAIL_ACCOUNT_DELETED',
      resourceType: 'EMAIL_ACCOUNT',
      resourceId: id,
      metadata: { fromEmail: existing.fromEmail, businessId: existing.businessId },
    });
    return { deleted, id };
  }

  private buildTransporterForAccount(account: EmailAccountEntity) {
    const pass = decryptSecret(account.smtpPassEncrypted);
    const transporter = createCustomSmtpTransporter({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      user: account.smtpUser,
      pass,
    });
    if (!transporter) {
      throw ApiError.badRequest('Email account SMTP configuration is incomplete');
    }
    return transporter;
  }

  async verifyEmailAccount(id: string, testRecipientEmail?: string, actorId?: string) {
    const account = await this.businessRepo.findEmailAccountById(id);
    if (!account) throw ApiError.notFound('Email account not found');

    const transporter = this.buildTransporterForAccount(account);
    await transporter.verify();

    let messageId: string | null = null;
    if (testRecipientEmail) {
      const info = await transporter.sendMail({
        from: `"${account.fromName}" <${account.fromEmail}>`,
        to: testRecipientEmail,
        subject: `[CodyNex OS] SMTP Verification — ${account.label}`,
        text: `Sender account "${account.label}" (${account.fromEmail}) is verified and ready for business dispatch.`,
      });
      messageId = info.messageId ?? null;
    }

    account.lastVerifiedAt = new Date();
    await this.businessRepo.saveEmailAccount(account);

    if (actorId) {
      await this.auditService.log({
        actorType: 'USER',
        actorId,
        action: 'EMAIL_ACCOUNT_VERIFIED',
        resourceType: 'EMAIL_ACCOUNT',
        resourceId: account.id,
        metadata: {
          fromEmail: account.fromEmail,
          testRecipientEmail: testRecipientEmail ?? null,
          messageId,
        },
      });
    }

    return {
      verified: true,
      testEmailSent: Boolean(testRecipientEmail),
      messageId,
      account: this.sanitizeEmailAccount(account),
    };
  }

  async resolveSenderAccount(params: {
    businessId?: string | null;
    emailAccountId?: string | null;
  }): Promise<EmailAccountEntity | null> {
    if (params.emailAccountId) {
      const explicit = await this.businessRepo.findEmailAccountById(params.emailAccountId);
      if (!explicit) throw ApiError.notFound('Selected sender email account not found');
      if (!explicit.isActive) {
        throw ApiError.badRequest(`Sender email account "${explicit.label}" is inactive`);
      }
      if (params.businessId && explicit.businessId && explicit.businessId !== params.businessId) {
        throw ApiError.badRequest(
          'Selected email account belongs to a different business than the campaign/lead',
        );
      }
      return explicit;
    }

    return this.businessRepo.findBestAccountForBusiness(params.businessId);
  }

  async sendEmail(input: SendBusinessEmailInput) {
    const account = await this.resolveSenderAccount({
      businessId: input.businessId,
      emailAccountId: input.emailAccountId,
    });

    if (account) {
      const today = new Date().toISOString().slice(0, 10);
      if (account.lastResetDate !== today) {
        account.sentToday = 0;
        account.lastResetDate = today;
      }
      if (account.sentToday >= account.dailySendLimit) {
        throw ApiError.badRequest(
          `Daily send limit (${account.dailySendLimit}) reached for sender "${account.fromEmail}"`,
        );
      }

      const transporter = this.buildTransporterForAccount(account);
      const info = await transporter.sendMail({
        from: `"${account.fromName}" <${account.fromEmail}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        replyTo: input.replyTo ?? account.fromEmail,
      });

      account.sentToday += 1;
      account.lastVerifiedAt = new Date();
      await this.businessRepo.saveEmailAccount(account);

      return {
        messageId: info.messageId ?? null,
        fromEmail: account.fromEmail,
        fromName: account.fromName,
        emailAccountId: account.id,
        businessId: account.businessId,
        provider: account.provider,
      };
    }

    const fallbackTransporter = createSmtpTransporter();
    if (!fallbackTransporter) {
      throw ApiError.badRequest(
        'No active sender Gmail/SMTP account configured for this business (and no global .env SMTP fallback is configured)',
      );
    }

    const info = await fallbackTransporter.sendMail({
      from: dotEnvConfig.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
    });

    return {
      messageId: info.messageId ?? null,
      fromEmail: dotEnvConfig.SMTP_USER || dotEnvConfig.SMTP_FROM,
      fromName: 'CodyNex OS',
      emailAccountId: null,
      businessId: input.businessId ?? null,
      provider: 'ENV_SMTP' as const,
    };
  }
}
