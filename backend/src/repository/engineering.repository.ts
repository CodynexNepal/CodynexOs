import { AppDataSource } from '../database/database-source';
import { GithubRepositoryEntity } from '../entities/github-repository.entity';
import { GithubPullRequestEntity } from '../entities/github-pull-request.entity';
import { QaReportEntity } from '../entities/qa-report.entity';

export class EngineeringRepository {
  private get repoTable() {
    return AppDataSource.getRepository(GithubRepositoryEntity);
  }

  private get prTable() {
    return AppDataSource.getRepository(GithubPullRequestEntity);
  }

  private get qaTable() {
    return AppDataSource.getRepository(QaReportEntity);
  }

  findAllRepos() {
    return this.repoTable.find({ order: { createdAt: 'DESC' } });
  }

  findRepoById(id: string) {
    return this.repoTable.findOne({ where: { id } });
  }

  findRepoByOwnerName(owner: string, name: string) {
    return this.repoTable.findOne({ where: { owner, name } });
  }

  saveRepo(data: Partial<GithubRepositoryEntity>) {
    return this.repoTable.save(this.repoTable.create(data));
  }

  findAllPullRequests() {
    return this.prTable.find({ order: { createdAt: 'DESC' } });
  }

  savePullRequest(data: Partial<GithubPullRequestEntity>) {
    return this.prTable.save(this.prTable.create(data));
  }

  findAllQaReports() {
    return this.qaTable.find({ order: { createdAt: 'DESC' }, take: 100 });
  }

  saveQaReport(data: Partial<QaReportEntity>) {
    return this.qaTable.save(this.qaTable.create(data));
  }
}
