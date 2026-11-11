import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { AiUsageStatus } from '../constant/enum.constant';

@Entity('ai_usage_logs')
@Index('idx_ai_usage_created', ['createdAt', 'provider'])
export class AiUsageLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId!: string | null;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ name: 'input_tokens', type: 'integer', default: 0 })
  inputTokens!: number;

  @Column({ name: 'output_tokens', type: 'integer', default: 0 })
  outputTokens!: number;

  @Column({
    name: 'estimated_cost_usd',
    type: 'numeric',
    precision: 10,
    scale: 6,
    default: '0.000000',
  })
  estimatedCostUsd!: string;

  @Column({ type: 'varchar', length: 24 })
  status!: AiUsageStatus;

  @Column({ name: 'latency_ms', type: 'integer', nullable: true })
  latencyMs!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
