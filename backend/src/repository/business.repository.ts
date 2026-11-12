import { IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../database/database-source';
import { BusinessEntity } from '../entities/business.entity';
import { EmailAccountEntity } from '../entities/email-account.entity';

export class BusinessRepository {
  private readonly businessRepo: Repository<BusinessEntity>;
  private readonly emailRepo: Repository<EmailAccountEntity>;

  constructor() {
    this.businessRepo = AppDataSource.getRepository(BusinessEntity);
    this.emailRepo = AppDataSource.getRepository(EmailAccountEntity);
  }

  findAllBusinesses() {
    return this.businessRepo.find({ order: { createdAt: 'ASC' } });
  }

  findBusinessById(id: string) {
    return this.businessRepo.findOne({ where: { id } });
  }

  findBusinessBySlug(slug: string) {
    return this.businessRepo.findOne({ where: { slug } });
  }

  saveBusiness(data: Partial<BusinessEntity>) {
    const entity = this.businessRepo.create(data);
    return this.businessRepo.save(entity);
  }

  async deleteBusiness(id: string) {
    const res = await this.businessRepo.delete({ id });
    return (res.affected ?? 0) > 0;
  }

  findEmailAccounts(businessId?: string) {
    if (businessId) {
      return this.emailRepo.find({
        where: { businessId },
        order: { isDefault: 'DESC', createdAt: 'ASC' },
      });
    }
    return this.emailRepo.find({
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  findEmailAccountById(id: string) {
    return this.emailRepo.findOne({ where: { id } });
  }

  async findBestAccountForBusiness(businessId?: string | null) {
    if (businessId) {
      const bizDefault = await this.emailRepo.findOne({
        where: { businessId, isDefault: true, isActive: true },
      });
      if (bizDefault) return bizDefault;

      const bizAny = await this.emailRepo.findOne({
        where: { businessId, isActive: true },
        order: { createdAt: 'ASC' },
      });
      if (bizAny) return bizAny;
    }

    const globalDefault = await this.emailRepo.findOne({
      where: { businessId: IsNull(), isDefault: true, isActive: true },
    });
    if (globalDefault) return globalDefault;

    if (!businessId) {
      const anyDefault = await this.emailRepo.findOne({
        where: { isDefault: true, isActive: true },
        order: { createdAt: 'ASC' },
      });
      if (anyDefault) return anyDefault;
    }

    return null;
  }

  async clearDefaultForBusiness(businessId: string | null) {
    if (businessId) {
      await this.emailRepo.update({ businessId }, { isDefault: false });
    } else {
      await this.emailRepo.update({ businessId: IsNull() }, { isDefault: false });
    }
  }

  saveEmailAccount(data: Partial<EmailAccountEntity>) {
    const entity = this.emailRepo.create(data);
    return this.emailRepo.save(entity);
  }

  async deleteEmailAccount(id: string) {
    const res = await this.emailRepo.delete({ id });
    return (res.affected ?? 0) > 0;
  }
}
