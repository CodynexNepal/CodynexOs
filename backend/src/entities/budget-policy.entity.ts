import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('budget_policies')
export class BudgetPolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'scope_type', type: 'varchar', length: 24 })
  scopeType!: 'GLOBAL' | 'DEPARTMENT' | 'EMPLOYEE';

  @Column({ name: 'scope_id', type: 'uuid', nullable: true })
  scopeId!: string | null;

  @Column({ name: 'daily_token_limit', type: 'integer' })
  dailyTokenLimit!: number;

  @Column({
    name: 'monthly_usd_limit',
    type: 'numeric',
    precision: 10,
    scale: 4,
    default: '0.0000',
  })
  monthlyUsdLimit!: string;

  @Column({ name: 'max_concurrent_requests', type: 'smallint', default: 3 })
  maxConcurrentRequests!: number;

  @Column({ name: 'allow_paid_providers', type: 'boolean', default: false })
  allowPaidProviders!: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
