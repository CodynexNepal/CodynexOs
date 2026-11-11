import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
@Index('idx_audit_logs_created', ['createdAt', 'resourceType'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'actor_type', type: 'varchar', length: 24 })
  actorType!: 'USER' | 'AI_EMPLOYEE' | 'SYSTEM' | 'WORKER';

  @Column({ name: 'actor_id', type: 'varchar', length: 64 })
  actorId!: string;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 64 })
  resourceType!: string;

  @Column({ name: 'resource_id', type: 'varchar', length: 64, nullable: true })
  resourceId!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
