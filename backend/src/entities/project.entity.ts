import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProjectPriority, ProjectStatus } from '../constant/enum.constant';
import { UserEntity } from './user.entity';

@Entity('projects')
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ name: 'ceo_instruction', type: 'text' })
  ceoInstruction!: string;

  @Column({ name: 'clarification_questions', type: 'jsonb', default: () => "'[]'" })
  clarificationQuestions!: string[];

  @Column({ name: 'structured_plan', type: 'jsonb', nullable: true })
  structuredPlan!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 32, default: ProjectStatus.PLANNING })
  status!: ProjectStatus;

  @Column({ type: 'varchar', length: 16, default: ProjectPriority.MEDIUM })
  priority!: ProjectPriority;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'created_by' })
  creator!: UserEntity;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
