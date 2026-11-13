import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AiEmployeeEntity } from './ai-employee.entity';
import { ContractStatus } from '../constant/enum.constant';

@Entity('agent_contracts')
export class AgentContractEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  @ManyToOne(() => AiEmployeeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: AiEmployeeEntity;

  @Column({ name: 'contract_number', type: 'varchar', length: 32, unique: true })
  contractNumber!: string;

  @Column({ type: 'varchar', length: 140 })
  title!: string;

  @Column({
    type: 'enum',
    enum: ContractStatus,
    default: ContractStatus.ACTIVE,
  })
  status!: ContractStatus;

  @Column({ name: 'token_salary_per_task', type: 'integer', default: 100 })
  tokenSalaryPerTask!: number;

  @Column({ name: 'token_balance', type: 'integer', default: 1000 })
  tokenBalance!: number;

  @Column({ name: 'staked_tokens', type: 'integer', default: 0 })
  stakedTokens!: number;

  @Column({ name: 'total_tokens_earned', type: 'integer', default: 1000 })
  totalTokensEarned!: number;

  @Column({ name: 'total_tokens_penalized', type: 'integer', default: 0 })
  totalTokensPenalized!: number;

  @Column({ name: 'reputation_score', type: 'integer', default: 100 })
  reputationScore!: number;

  @Column({ name: 'terms_content_md', type: 'text' })
  termsContentMd!: string;

  @Column({ name: 'signed_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  signedAt!: Date;

  @Column({ name: 'signature_hash', type: 'varchar', length: 64 })
  signatureHash!: string;

  @Column({ name: 'violations_count', type: 'integer', default: 0 })
  violationsCount!: number;

  @Column({ name: 'penalties_count', type: 'integer', default: 0 })
  penaltiesCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
