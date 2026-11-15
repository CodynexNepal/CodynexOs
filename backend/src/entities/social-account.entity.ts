import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SocialPlatform = 'FACEBOOK' | 'TIKTOK' | 'WHATSAPP' | 'INSTAGRAM';

@Entity('social_accounts')
export class SocialAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  platform!: SocialPlatform;

  @Column({ name: 'account_name', type: 'varchar', length: 160 })
  accountName!: string;

  @Column({ name: 'account_handle', type: 'varchar', length: 100, nullable: true })
  accountHandle!: string | null;

  @Column({ name: 'page_or_phone_id', type: 'varchar', length: 120, nullable: true })
  pageOrPhoneId!: string | null;

  @Column({ name: 'access_token_encrypted', type: 'text', nullable: true })
  accessTokenEncrypted!: string | null;

  @Column({ name: 'is_connected', type: 'boolean', default: true })
  isConnected!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
