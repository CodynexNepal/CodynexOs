import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BusinessEmailService } from '../../src/services/business-email.service';
import { CrmService } from '../../src/services/crm.service';
import { decryptSecret, encryptSecret } from '../../src/utils/encryption.util';
import * as smtpConfig from '../../src/configs/smtp.config';
import { LeadStage } from '../../src/constant/enum.constant';

describe('Multi-Business & Multi-Gmail Sender Routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('encrypts Gmail App Password at rest and excludes secrets from sanitized output', async () => {
    const savedRows: any[] = [];
    const businessRepo = {
      findBusinessById: vi.fn().mockResolvedValue({ id: 'biz-hg', name: 'Hostel Ghar' }),
      findEmailAccounts: vi.fn().mockResolvedValue([]),
      clearDefaultForBusiness: vi.fn().mockResolvedValue(undefined),
      saveEmailAccount: vi.fn().mockImplementation(async (data) => {
        const row = { id: 'acc-1', createdAt: new Date(), updatedAt: new Date(), ...data };
        savedRows.push(row);
        return row;
      }),
    } as any;
    const auditService = { log: vi.fn().mockResolvedValue(undefined) } as any;

    const service = new BusinessEmailService(businessRepo, auditService);
    const created = await service.createEmailAccount(
      {
        businessId: 'biz-hg',
        label: 'Hostel Ghar Outreach Gmail',
        provider: 'GMAIL',
        fromName: 'Hostel Ghar Team',
        fromEmail: 'outreach@hostelghar.com',
        smtpPass: 'abcd-efgh-ijkl-mnop',
      },
      'ceo-1',
    );

    expect(created.hasPassword).toBe(true);
    expect((created as any).smtpPassEncrypted).toBeUndefined();
    expect(JSON.stringify(created)).not.toContain('abcd-efgh-ijkl-mnop');
    expect(savedRows[0].smtpPassEncrypted).toMatch(/^enc:v1:/);
    expect(decryptSecret(savedRows[0].smtpPassEncrypted)).toBe('abcd-efgh-ijkl-mnop');
    expect(savedRows[0].smtpHost).toBe('smtp.gmail.com');
  });

  it('routes emails using the business-specific sender and blocks cross-business mismatch', async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: '<msg-hg-1>' });
    vi.spyOn(smtpConfig, 'createCustomSmtpTransporter').mockReturnValue({
      sendMail: sendMailMock,
      verify: vi.fn().mockResolvedValue(true),
    } as any);

    const hgAccount = {
      id: 'acc-hg',
      businessId: 'biz-hg',
      label: 'Hostel Ghar Gmail',
      provider: 'GMAIL',
      fromName: 'Hostel Ghar',
      fromEmail: 'sales@hostelghar.com',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'sales@hostelghar.com',
      smtpPassEncrypted: encryptSecret('hg-app-pass'),
      dailySendLimit: 100,
      sentToday: 2,
      lastResetDate: new Date().toISOString().slice(0, 10),
      isDefault: true,
      isActive: true,
    };

    const businessRepo = {
      findBestAccountForBusiness: vi.fn().mockImplementation(async (bizId) => {
        if (bizId === 'biz-hg') return { ...hgAccount };
        return null;
      }),
      findEmailAccountById: vi.fn().mockImplementation(async (id) => {
        if (id === 'acc-codynex') {
          return {
            ...hgAccount,
            id: 'acc-codynex',
            businessId: 'biz-codynex',
            fromEmail: 'hello@codynex.com',
          };
        }
        return null;
      }),
      saveEmailAccount: vi.fn().mockImplementation(async (acc) => acc),
    } as any;

    const service = new BusinessEmailService(businessRepo, { log: vi.fn() } as any);

    const result = await service.sendEmail({
      businessId: 'biz-hg',
      to: 'owner@kathmanduhostel.com',
      subject: 'Partner with Hostel Ghar',
      text: 'Hello from Hostel Ghar!',
    });

    expect(result.fromEmail).toBe('sales@hostelghar.com');
    expect(result.emailAccountId).toBe('acc-hg');
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Hostel Ghar" <sales@hostelghar.com>',
        to: 'owner@kathmanduhostel.com',
      }),
    );

    await expect(
      service.sendEmail({
        businessId: 'biz-hg',
        emailAccountId: 'acc-codynex',
        to: 'owner@kathmanduhostel.com',
        subject: 'Mismatch',
        text: 'Should block',
      }),
    ).rejects.toThrow(/different business/i);
  });

  it('enforces daily send limit on sender accounts and resets on a new UTC day', async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: '<msg-2>' });
    vi.spyOn(smtpConfig, 'createCustomSmtpTransporter').mockReturnValue({
      sendMail: sendMailMock,
    } as any);

    const today = new Date().toISOString().slice(0, 10);
    const cappedAccount = {
      id: 'acc-cap',
      businessId: 'biz-1',
      label: 'Daily Capped Gmail',
      provider: 'GMAIL',
      fromName: 'Biz 1',
      fromEmail: 'biz1@gmail.com',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'biz1@gmail.com',
      smtpPassEncrypted: encryptSecret('secret'),
      dailySendLimit: 5,
      sentToday: 5,
      lastResetDate: today,
      isDefault: true,
      isActive: true,
    };

    const businessRepo = {
      findBestAccountForBusiness: vi.fn().mockResolvedValue(cappedAccount),
      saveEmailAccount: vi.fn().mockImplementation(async (acc) => acc),
    } as any;

    const service = new BusinessEmailService(businessRepo, { log: vi.fn() } as any);

    await expect(
      service.sendEmail({
        businessId: 'biz-1',
        to: 'prospect@example.com',
        subject: 'Hi',
        text: 'Limit reached',
      }),
    ).rejects.toThrow(/Daily send limit/i);

    // Simulate yesterday's counter resetting automatically today
    cappedAccount.lastResetDate = '2020-01-01';
    const res = await service.sendEmail({
      businessId: 'biz-1',
      to: 'prospect@example.com',
      subject: 'Hi',
      text: 'Reset today',
    });
    expect(res.messageId).toBe('<msg-2>');
    expect(cappedAccount.sentToday).toBe(1);
    expect(cappedAccount.lastResetDate).toBe(today);
  });

  it('requires CEO approval and blocks opted-out leads in CrmService.sendApprovedInteraction', async () => {
    const interaction: any = {
      id: 'int-1',
      leadId: 'lead-1',
      businessId: 'biz-hg',
      emailAccountId: 'acc-hg',
      direction: 'OUTBOUND',
      channel: 'EMAIL',
      subject: 'Hostel Ghar Partnership',
      body: 'Join Hostel Ghar today',
      approvalStatus: 'PENDING_APPROVAL',
    };
    const lead: any = {
      id: 'lead-1',
      businessId: 'biz-hg',
      businessName: 'Thamel Hostel',
      email: 'info@thamelhostel.com',
      stage: LeadStage.NEW,
      isOptedOut: false,
    };

    const crmRepo = {
      findInteractionById: vi.fn().mockResolvedValue(interaction),
      findLeadById: vi.fn().mockResolvedValue(lead),
      findCampaignById: vi.fn().mockResolvedValue(null),
      saveInteraction: vi.fn().mockImplementation(async (i) => i),
      saveLead: vi.fn().mockImplementation(async (l) => l),
    } as any;

    const businessEmailService = {
      sendEmail: vi.fn().mockResolvedValue({
        messageId: '<sent-1>',
        fromEmail: 'sales@hostelghar.com',
        fromName: 'Hostel Ghar',
        emailAccountId: 'acc-hg',
        businessId: 'biz-hg',
        provider: 'GMAIL',
      }),
    } as any;

    const crmService = new CrmService(
      crmRepo,
      { saveApproval: vi.fn() } as any,
      { log: vi.fn() } as any,
      businessEmailService,
    );

    // Must block before approval
    await expect(crmService.sendApprovedInteraction('int-1', 'ceo-1')).rejects.toThrow(
      /CEO approval is required/i,
    );

    // Approve and send
    await crmService.approveInteraction('int-1', 'ceo-1');
    const sent = await crmService.sendApprovedInteraction('int-1', 'ceo-1');
    expect(sent.interaction.approvalStatus).toBe('SENT');
    expect(sent.dispatch.fromEmail).toBe('sales@hostelghar.com');
    expect(lead.stage).toBe(LeadStage.CONTACTED);

    // Opt-out blocks subsequent sends
    const optedOutInteraction = { ...interaction, id: 'int-2', approvalStatus: 'APPROVED' };
    crmRepo.findInteractionById.mockResolvedValue(optedOutInteraction);
    lead.isOptedOut = true;
    await expect(crmService.sendApprovedInteraction('int-2', 'ceo-1')).rejects.toThrow(/opted-out/i);
  });
});
