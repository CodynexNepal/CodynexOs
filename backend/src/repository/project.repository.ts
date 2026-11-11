import { AppDataSource } from '../database/database-source';
import { ProjectEntity } from '../entities/project.entity';
import { ProjectStatus } from '../constant/enum.constant';

export class ProjectRepository {
  private get repo() {
    return AppDataSource.getRepository(ProjectEntity);
  }

  findAll() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  save(data: Partial<ProjectEntity>) {
    return this.repo.save(this.repo.create(data));
  }

  updateById(id: string, patch: Partial<ProjectEntity>) {
    return this.repo.update({ id }, patch as Parameters<typeof this.repo.update>[1]);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.status')
      .getRawMany<{ status: string; count: string }>();

    const out: Record<string, number> = {};
    for (const r of rows) {
      out[r.status] = Number(r.count);
    }
    return out;
  }

  countActive() {
    return this.repo.count({ where: { status: ProjectStatus.ACTIVE } });
  }
}
