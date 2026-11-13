import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AiEmployeeEntity } from './ai-employee.entity';
import { AgentContractEntity } from './agent-contract.entity';
import { TokenTransactionType } from '../constant/enum.constant';

@Entity('agent_token_transactions')
export class AgentTokenTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  @ManyToOne(() => AiEmployeeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: AiEmployeeEntity;

  @Column({ name: 'contract_id', type: 'uuid', nullable: true })
  contractId!: string | null;

  @ManyToOne(() => AgentContractEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contract_id' })
  contract!: AgentContractEntity | null;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId!: string | null;

  @Column({ type: 'integer' })
  amount!: number; // Positive for reward, negative for penalty

  @Column({
    type: 'enum',
    enum: TokenTransactionType,
    default: TokenTransactionType.TASK_REWARD,
  })
  type!: TokenTransactionType;

  @Column({ name: 'balance_after', type: 'integer' })
  balanceAfter!: number;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
