import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('github_pull_requests')
export class GithubPullRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'repository_id', type: 'uuid' })
  repositoryId!: string;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId!: string | null;

  @Column({ name: 'pr_number', type: 'integer' })
  prNumber!: number;

  @Column({ name: 'branch_name', type: 'varchar', length: 150 })
  branchName!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status!: 'OPEN' | 'CHECKS_FAILED' | 'READY_FOR_REVIEW' | 'MERGED' | 'CLOSED';

  @Column({ name: 'checks_summary', type: 'jsonb', default: () => "'{}'" })
  checksSummary!: Record<string, unknown>;

  @Column({ name: 'html_url', type: 'text' })
  htmlUrl!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
