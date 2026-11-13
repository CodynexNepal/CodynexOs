import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AiEmployeeEntity } from './ai-employee.entity';
import { CompanyRuleEntity } from './company-rule.entity';
import { PenaltyType, RuleSeverity, ViolationStatus } from '../constant/enum.constant';

@Entity('rule_violations')
export class RuleViolationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  @ManyToOne(() => AiEmployeeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: AiEmployeeEntity;

  @Column({ name: 'rule_id', type: 'uuid', nullable: true })
  ruleId!: string | null;

  @ManyToOne(() => CompanyRuleEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rule_id' })
  rule!: CompanyRuleEntity | null;

  @Column({ name: 'rule_code', type: 'varchar', length: 64 })
  ruleCode!: string;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId!: string | null;

  @Column({
    type: 'enum',
    enum: RuleSeverity,
    default: RuleSeverity.MEDIUM,
  })
  severity!: RuleSeverity;

  @Column({
    name: 'penalty_type',
    type: 'enum',
    enum: PenaltyType,
    default: PenaltyType.WARNING,
  })
  penaltyType!: PenaltyType;

  @Column({ name: 'token_penalty_amount', type: 'integer', default: 0 })
  tokenPenaltyAmount!: number;

  @Column({
    type: 'enum',
    enum: ViolationStatus,
    default: ViolationStatus.ENFORCED,
  })
  status!: ViolationStatus;

  @Column({ type: 'text' })
  explanation!: string;

  @Column({ name: 'detected_by', type: 'varchar', length: 64, default: 'hr_director' })
  detectedBy!: string;

  @Column({ name: 'enforced_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  enforcedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
