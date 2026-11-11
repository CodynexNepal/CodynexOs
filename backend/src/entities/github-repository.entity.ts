import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('github_repositories')
@Unique(['owner', 'name'])
export class GithubRepositoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  owner!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'default_branch', type: 'varchar', length: 64, default: 'main' })
  defaultBranch!: string;

  @Column({ name: 'is_write_authorized', type: 'boolean', default: false })
  isWriteAuthorized!: boolean;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
