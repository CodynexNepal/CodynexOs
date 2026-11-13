import { AppDataSource } from '../database/database-source';
import { MarketingCampaignEntity } from '../entities/marketing-campaign.entity';
import { SocialAccountEntity, SocialPlatform } from '../entities/social-account.entity';

export class SocialMarketingRepository {
  private get campaignRepo() {
    return AppDataSource.getRepository(MarketingCampaignEntity);
  }

  private get socialAccountRepo() {
    return AppDataSource.getRepository(SocialAccountEntity);
  }

  async findCampaigns(businessId?: string): Promise<MarketingCampaignEntity[]> {
    return this.campaignRepo.find({
      where: businessId ? { businessId } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findCampaignById(id: string): Promise<MarketingCampaignEntity | null> {
    return this.campaignRepo.findOne({ where: { id } });
  }

  async saveCampaign(data: Partial<MarketingCampaignEntity>): Promise<MarketingCampaignEntity> {
    return this.campaignRepo.save(this.campaignRepo.create(data));
  }

  async findSocialAccounts(businessId?: string): Promise<SocialAccountEntity[]> {
    return this.socialAccountRepo.find({
      where: businessId ? { businessId } : {},
      order: { createdAt: 'ASC' },
    });
  }

  async findSocialAccountById(id: string): Promise<SocialAccountEntity | null> {
    return this.socialAccountRepo.findOne({ where: { id } });
  }

  async findSocialAccountByPlatform(
    platform: SocialPlatform,
    businessId?: string,
  ): Promise<SocialAccountEntity | null> {
    return this.socialAccountRepo.findOne({
      where: businessId ? { platform, businessId } : { platform },
    });
  }

  async saveSocialAccount(data: Partial<SocialAccountEntity>): Promise<SocialAccountEntity> {
    return this.socialAccountRepo.save(this.socialAccountRepo.create(data));
  }

  async deleteSocialAccount(id: string): Promise<boolean> {
    const res = await this.socialAccountRepo.delete(id);
    return (res.affected ?? 0) > 0;
  }
}
