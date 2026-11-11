import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TaskEntity } from './task.entity';

@Entity('task_executions')
export class TaskExecutionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @ManyToOne(() => TaskEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: TaskEntity;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId!: string | null;

  @Column({ name: 'attempt_number', type: 'smallint' })
  attemptNumber!: number;

  @Column({ name: 'worker_id', type: 'varchar', length: 100 })
  workerId!: string;

  @Column({ type: 'varchar', length: 24 })
  status!: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT';

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
