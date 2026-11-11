import { AppDataSource } from '../database/database-source';
import { MarketingCampaignEntity } from '../entities/marketing-campaign.entity';
import { CrmLeadEntity } from '../entities/crm-lead.entity';
import { CrmInteractionEntity } from '../entities/crm-interaction.entity';

export class CrmRepository {
  private get campaignRepo() {
    return AppDataSource.getRepository(MarketingCampaignEntity);
  }

  private get leadRepo() {
    return AppDataSource.getRepository(CrmLeadEntity);
  }

  private get interactionRepo() {
    return AppDataSource.getRepository(CrmInteractionEntity);
  }

  findCampaigns() {
    return this.campaignRepo.find({ order: { createdAt: 'DESC' } });
  }

  findCampaignById(id: string) {
    return this.campaignRepo.findOne({ where: { id } });
  }

  saveCampaign(data: Partial<MarketingCampaignEntity>) {
    return this.campaignRepo.save(this.campaignRepo.create(data));
  }

  findLeads(stage?: string) {
    return this.leadRepo.find({
      ...(stage ? { where: { stage: stage as any } } : {}),
      order: { leadScore: 'DESC', createdAt: 'DESC' },
      take: 250,
    });
  }

  findLeadByDedupHash(dedupHash: string) {
    return this.leadRepo.findOne({ where: { dedupHash } });
  }

  findLeadById(id: string) {
    return this.leadRepo.findOne({ where: { id } });
  }

  saveLead(data: Partial<CrmLeadEntity>) {
    return this.leadRepo.save(this.leadRepo.create(data));
  }

  findInteractions(leadId?: string) {
    return this.interactionRepo.find({
      ...(leadId ? { where: { leadId } } : {}),
      order: { createdAt: 'DESC' },
      take: 150,
    });
  }

  saveInteraction(data: Partial<CrmInteractionEntity>) {
    return this.interactionRepo.save(this.interactionRepo.create(data));
  }
}
