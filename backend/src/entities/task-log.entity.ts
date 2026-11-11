import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('task_logs')
export class TaskLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @Column({ name: 'execution_id', type: 'uuid', nullable: true })
  executionId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  level!: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
