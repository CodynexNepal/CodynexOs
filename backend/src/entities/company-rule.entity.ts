import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RuleSeverity } from '../constant/enum.constant';

@Entity('company_rules')
export class CompanyRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'rule_code', type: 'varchar', length: 64, unique: true })
  ruleCode!: string;

  @Column({ type: 'varchar', length: 140 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({
    type: 'enum',
    enum: RuleSeverity,
    default: RuleSeverity.MEDIUM,
  })
  severity!: RuleSeverity;

  @Column({ name: 'default_penalty_tokens', type: 'integer', default: 200 })
  defaultPenaltyTokens!: number;

  @Column({ type: 'varchar', length: 64, default: 'OPERATIONAL' })
  category!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
