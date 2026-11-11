import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TaskStatus } from '../constant/enum.constant';
import { ProjectEntity } from './project.entity';
import { DepartmentEntity } from './department.entity';
import { AiEmployeeEntity } from './ai-employee.entity';

@Entity('tasks')
@Index('idx_tasks_project', ['projectId', 'status'])
export class TaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => ProjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ name: 'parent_task_id', type: 'uuid', nullable: true })
  parentTaskId!: string | null;

  @Column({ name: 'department_id', type: 'uuid' })
  departmentId!: string;

  @ManyToOne(() => DepartmentEntity)
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity;

  @Column({ name: 'assigned_employee_id', type: 'uuid', nullable: true })
  assignedEmployeeId!: string | null;

  @ManyToOne(() => AiEmployeeEntity, { nullable: true })
  @JoinColumn({ name: 'assigned_employee_id' })
  assignedEmployee!: AiEmployeeEntity | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'task_type', type: 'varchar', length: 48 })
  taskType!: string;

  @Column({ type: 'smallint', default: 50 })
  priority!: number;

  @Column({ type: 'varchar', length: 32, default: TaskStatus.DRAFT })
  status!: TaskStatus;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, unique: true })
  idempotencyKey!: string;

  @Column({ name: 'input_payload', type: 'jsonb', default: () => "'{}'" })
  inputPayload!: Record<string, unknown>;

  @Column({ name: 'output_payload', type: 'jsonb', nullable: true })
  outputPayload!: Record<string, unknown> | null;

  @Column({ name: 'verification_result', type: 'jsonb', nullable: true })
  verificationResult!: Record<string, unknown> | null;

  @Column({ name: 'retry_count', type: 'smallint', default: 0 })
  retryCount!: number;

  @Column({ name: 'max_retries', type: 'smallint', default: 3 })
  maxRetries!: number;

  @Column({ name: 'next_run_at', type: 'timestamptz', default: () => 'NOW()' })
  nextRunAt!: Date;

  @Column({ name: 'lease_owner', type: 'varchar', length: 100, nullable: true })
  leaseOwner!: string | null;

  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
