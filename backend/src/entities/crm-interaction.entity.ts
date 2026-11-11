import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('crm_interactions')
export class CrmInteractionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId!: string;

  @Column({ type: 'varchar', length: 16 })
  direction!: 'OUTBOUND' | 'INBOUND' | 'NOTE';

  @Column({ type: 'varchar', length: 32 })
  channel!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subject!: string | null;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'reply_classification', type: 'varchar', length: 32, nullable: true })
  replyClassification!: string | null;

  @Column({ name: 'approval_status', type: 'varchar', length: 24, default: 'DRAFT' })
  approvalStatus!: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'BLOCKED';

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
