import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('idempotency_records')
export class IdempotencyRecordEntity {
  @PrimaryColumn({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey!: string;

  @Column({ type: 'varchar', length: 16 })
  method!: string;

  @Column({ type: 'varchar', length: 255 })
  path!: string;

  @Column({ name: 'status_code', type: 'smallint' })
  statusCode!: number;

  @Column({ name: 'response_body', type: 'jsonb' })
  responseBody!: Record<string, unknown>;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
