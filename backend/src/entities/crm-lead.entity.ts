import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LeadStage } from '../constant/enum.constant';

@Entity('crm_leads')
export class CrmLeadEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId!: string | null;

  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId!: string | null;

  @Column({ name: 'business_name', type: 'varchar', length: 200 })
  businessName!: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 150, nullable: true })
  contactName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  website!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ name: 'source_url', type: 'text', nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'varchar', length: 32, default: LeadStage.NEW })
  stage!: LeadStage;

  @Column({ name: 'lead_score', type: 'smallint', default: 0 })
  leadScore!: number;

  @Column({ name: 'is_opted_out', type: 'boolean', default: false })
  isOptedOut!: boolean;

  @Column({ name: 'dedup_hash', type: 'varchar', length: 64, unique: true })
  dedupHash!: string;

  @Column({ name: 'next_follow_up_at', type: 'timestamptz', nullable: true })
  nextFollowUpAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
