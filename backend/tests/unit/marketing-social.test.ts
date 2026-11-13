import { describe, expect, it, vi } from 'vitest';
import { MarketingService, CULTURAL_OCCASIONS } from '../../src/services/marketing.service';

describe('Digital Marketing, AI Content Creator & Official Social Dispatch', () => {
  const mockRepo = {
    findCampaigns: vi.fn().mockResolvedValue([]),
    findCampaignById: vi.fn().mockResolvedValue(null),
    saveCampaign: vi.fn().mockImplementation(async (c) => ({ id: 'campaign-123', ...c })),
    findSocialAccounts: vi.fn().mockResolvedValue([]),
    findSocialAccountById: vi.fn().mockResolvedValue({
      id: 'acc-1',
      platform: 'FACEBOOK',
      accountName: 'Aliza Wears Official',
      accountHandle: '@alizawears.official',
      isConnected: true,
    }),
    saveSocialAccount: vi.fn().mockImplementation(async (a) => ({ id: 'acc-new', ...a })),
  } as any;

  const mockModelRouter = {
    complete: vi.fn().mockRejectedValue(new Error('AI offline, use deterministic engine')),
  } as any;

  const mockAudit = {
    log: vi.fn().mockResolvedValue({}),
  } as any;

  const mockNotification = {
    notifyUser: vi.fn().mockResolvedValue({}),
  } as any;

  const service = new MarketingService(mockRepo, mockModelRouter, mockAudit, mockNotification);

  it('lists cultural occasion presets including Tihar, Dashain, and Holi with authentic Nepali keywords', () => {
    const occasions = service.getOccasions();
    expect(occasions.length).toBeGreaterThanOrEqual(7);

    const tihar = occasions.find((o) => o.key === 'TIHAR');
    expect(tihar).toBeDefined();
    expect(tihar?.nepaliName).toContain('तिहार');
    expect(tihar?.culturalKeywords).toContain('Diyo');
    expect(tihar?.suggestedHashtags).toContain('#HappyTihar');
  });

  it('generates multi-channel content for TikTok, Facebook, and WhatsApp for Happy Tihar', async () => {
    const res = await service.generateContent({
      occasionKey: 'TIHAR',
      channels: ['TIKTOK', 'FACEBOOK', 'WHATSAPP'],
      businessName: 'Aliza Wears',
      discountCode: 'TIHAR2026',
    });

    expect(res.occasion.key).toBe('TIHAR');
    expect(res.content.tiktok).toBeDefined();
    expect(res.content.tiktok?.hook).toContain('तिहार');
    expect(res.content.tiktok?.scenes.length).toBeGreaterThanOrEqual(3);
    expect(res.content.tiktok?.audioCue).toContain('Lo-Fi');

    expect(res.content.facebook).toBeDefined();
    expect(res.content.facebook?.postText).toContain('सयपत्रीको सुगन्ध');
    expect(res.content.facebook?.postText).toContain('TIHAR2026');
    expect(res.content.facebook?.callToAction).toContain('alizawears.com');

    expect(res.content.whatsapp).toBeDefined();
    expect(res.content.whatsapp?.broadcastMessage).toContain('Aliza Wears');
    expect(res.content.whatsapp?.bulletPoints.length).toBeGreaterThanOrEqual(3);
  });

  it('publishes and records official social post dispatches across TikTok, Facebook, and WhatsApp', async () => {
    const gen = await service.generateContent({
      occasionKey: 'TIHAR',
      channels: ['TIKTOK', 'FACEBOOK', 'WHATSAPP'],
      businessName: 'Aliza Wears',
    });

    const result = await service.publishToSocialChannels({
      occasion: 'Tihar & Deepawali',
      channels: ['TIKTOK', 'FACEBOOK', 'WHATSAPP'],
      content: gen.content,
      businessId: 'biz-aliza',
      actorId: 'ceo-user-1',
    });

    expect(result.dispatches).toHaveLength(3);
    expect(result.dispatches.map((d) => d.channel)).toEqual(['TIKTOK', 'FACEBOOK', 'WHATSAPP']);
    expect(result.dispatches[0].status).toBe('PUBLISHED');
    expect(result.dispatches[0].externalUrl).toContain('tiktok.com');
    expect(result.dispatches[1].externalUrl).toContain('facebook.com');
    expect(result.dispatches[2].externalUrl).toContain('wa.me');

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SOCIAL_POST_PUBLISHED',
      }),
    );
    expect(mockNotification.notifyUser).toHaveBeenCalled();
  });

  it('executes a 1-click CEO command to create and publish festive wishes', async () => {
    const ceoResult = await service.executeCeoCommandPost({
      commandText: 'Post Happy Tihar wishes on TikTok, Facebook and WhatsApp announcing 20% discount',
      businessId: 'biz-aliza',
      actorId: 'ceo-1',
    });

    expect(ceoResult.success).toBe(true);
    expect(ceoResult.occasion.key).toBe('TIHAR');
    expect(ceoResult.dispatches.length).toBe(3);
  });

  it('tests connection to official social account with latency tracking', async () => {
    const testResult = await service.testAccountConnection('acc-1');
    expect(testResult.success).toBe(true);
    expect(testResult.message).toContain('FACEBOOK');
  });
});
