import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('marketing_campaigns')
export class MarketingCampaignEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId!: string | null;

  @Column({ name: 'email_account_id', type: 'uuid', nullable: true })
  emailAccountId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  channel!: 'EMAIL' | 'SEO' | 'CONTENT' | 'SOCIAL';

  @Column({ name: 'target_audience', type: 'text', nullable: true })
  targetAudience!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  occasion!: string | null;

  @Column({ name: 'content_payload', type: 'jsonb', nullable: true })
  contentPayload!: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  channels!: string[] | null;

  @Column({ name: 'post_results', type: 'jsonb', nullable: true })
  postResults!: Array<{
    channel: string;
    status: 'PUBLISHED' | 'SCHEDULED' | 'FAILED' | 'PENDING';
    externalId?: string;
    externalUrl?: string;
    dispatchedAt: string;
    error?: string;
  }> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
