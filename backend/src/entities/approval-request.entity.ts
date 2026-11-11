import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { ApprovalStatus } from '../constant/enum.constant';

@Entity('approval_requests')
export class ApprovalRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId!: string | null;

  @Column({ name: 'requested_by_employee_id', type: 'uuid', nullable: true })
  requestedByEmployeeId!: string | null;

  @Column({ name: 'action_type', type: 'varchar', length: 64 })
  actionType!: string;

  @Column({ type: 'varchar', length: 300 })
  summary!: string;

  @Column({ name: 'risk_assessment', type: 'text', nullable: true })
  riskAssessment!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 24, default: ApprovalStatus.PENDING })
  status!: ApprovalStatus;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
