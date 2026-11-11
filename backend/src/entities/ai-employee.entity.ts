import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DepartmentEntity } from './department.entity';

@Entity('ai_employees')
export class AiEmployeeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'department_id', type: 'uuid' })
  departmentId!: string;

  @ManyToOne(() => DepartmentEntity)
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity;

  @Column({ type: 'varchar', length: 64, unique: true })
  slug!: string;

  @Column({ name: 'role_title', type: 'varchar', length: 120 })
  roleTitle!: string;

  @Column({ name: 'system_instruction', type: 'text' })
  systemInstruction!: string;

  @Column({ name: 'allowed_tools', type: 'jsonb', default: () => "'[]'" })
  allowedTools!: string[];

  @Column({ name: 'knowledge_scopes', type: 'jsonb', default: () => "'[]'" })
  knowledgeScopes!: string[];

  @Column({ name: 'preferred_provider', type: 'varchar', length: 32, default: 'gemini' })
  preferredProvider!: string;

  @Column({ name: 'preferred_model', type: 'varchar', length: 100, default: 'gemini-3.8-flash' })
  preferredModel!: string;

  @Column({ name: 'fallback_provider', type: 'varchar', length: 32, nullable: true, default: 'groq' })
  fallbackProvider!: string | null;

  @Column({
    name: 'fallback_model',
    type: 'varchar',
    length: 100,
    nullable: true,
    default: 'llama-3.1-8b-instant',
  })
  fallbackModel!: string | null;

  @Column({ name: 'daily_token_budget', type: 'integer', default: 50000 })
  dailyTokenBudget!: number;

  @Column({ name: 'execution_budget_ms', type: 'integer', default: 60000 })
  executionBudgetMs!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
