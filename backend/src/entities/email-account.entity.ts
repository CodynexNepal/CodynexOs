import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EmailProviderType = 'GMAIL' | 'SMTP';

@Entity('email_accounts')
export class EmailAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId!: string | null;

  @Column({ type: 'varchar', length: 160 })
  label!: string;

  @Column({ type: 'varchar', length: 24, default: 'GMAIL' })
  provider!: EmailProviderType;

  @Column({ name: 'from_name', type: 'varchar', length: 160 })
  fromName!: string;

  @Column({ name: 'from_email', type: 'varchar', length: 255 })
  fromEmail!: string;

  @Column({ name: 'smtp_host', type: 'varchar', length: 255, default: 'smtp.gmail.com' })
  smtpHost!: string;

  @Column({ name: 'smtp_port', type: 'integer', default: 587 })
  smtpPort!: number;

  @Column({ name: 'smtp_secure', type: 'boolean', default: false })
  smtpSecure!: boolean;

  @Column({ name: 'smtp_user', type: 'varchar', length: 255 })
  smtpUser!: string;

  @Column({ name: 'smtp_pass_encrypted', type: 'text' })
  smtpPassEncrypted!: string;

  @Column({ name: 'daily_send_limit', type: 'integer', default: 100 })
  dailySendLimit!: number;

  @Column({ name: 'sent_today', type: 'integer', default: 0 })
  sentToday!: number;

  @Column({ name: 'last_reset_date', type: 'varchar', length: 10, nullable: true })
  lastResetDate!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_verified_at', type: 'timestamptz', nullable: true })
  lastVerifiedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
