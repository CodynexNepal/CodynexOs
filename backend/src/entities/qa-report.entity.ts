import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { QaVerdict } from '../constant/enum.constant';

@Entity('qa_reports')
export class QaReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @Column({ name: 'reviewer_employee_id', type: 'uuid', nullable: true })
  reviewerEmployeeId!: string | null;

  @Column({ type: 'varchar', length: 24 })
  verdict!: QaVerdict;

  @Column({ name: 'checks_executed', type: 'jsonb', default: () => "'[]'" })
  checksExecuted!: Array<{ name: string; status: string; output?: string }>;

  @Column({ name: 'failed_component', type: 'varchar', length: 120, nullable: true })
  failedComponent!: string | null;

  @Column({ name: 'correction_task_id', type: 'uuid', nullable: true })
  correctionTaskId!: string | null;

  @Column({ type: 'text' })
  summary!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
