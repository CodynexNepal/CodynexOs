import { AppDataSource } from '../database/database-source';
import { CompanyMemoryEntity } from '../entities/company-memory.entity';
import { KnowledgeDocumentEntity } from '../entities/knowledge-document.entity';
import { MemoryCategory } from '../constant/enum.constant';

export class MemoryRepository {
  private get memRepo() {
    return AppDataSource.getRepository(CompanyMemoryEntity);
  }

  private get kbRepo() {
    return AppDataSource.getRepository(KnowledgeDocumentEntity);
  }

  async searchMemory(query?: string, category?: MemoryCategory) {
    const qb = this.memRepo.createQueryBuilder('m').orderBy('m.createdAt', 'DESC').take(100);
    if (category) {
      qb.andWhere('m.category = :category', { category });
    }
    if (query && query.trim()) {
      qb.andWhere('(m.title ILIKE :q OR m.content ILIKE :q)', { q: `%${query.trim()}%` });
    }
    return qb.getMany();
  }

  saveMemory(data: Partial<CompanyMemoryEntity>) {
    return this.memRepo.save(this.memRepo.create(data));
  }

  findAllKnowledge() {
    return this.kbRepo.find({ order: { updatedAt: 'DESC' } });
  }

  async findTrustedKnowledgeForDepartment(departmentId?: string) {
    const qb = this.kbRepo
      .createQueryBuilder('k')
      .where('k.is_trusted = true')
      .orderBy('k.updated_at', 'DESC')
      .take(6);

    if (departmentId) {
      qb.andWhere('(k.department_id IS NULL OR k.department_id = :departmentId)', {
        departmentId,
      });
    } else {
      qb.andWhere('k.department_id IS NULL');
    }

    return qb.getMany();
  }

  saveKnowledge(data: Partial<KnowledgeDocumentEntity>) {
    return this.kbRepo.save(this.kbRepo.create(data));
  }
}
