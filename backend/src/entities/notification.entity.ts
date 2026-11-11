import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('notifications')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 48 })
  category!: string;

  @Column({ type: 'varchar', length: 16 })
  severity!: 'INFO' | 'WARNING' | 'CRITICAL';

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ name: 'link_url', type: 'varchar', length: 255, nullable: true })
  linkUrl!: string | null;

  @Column({ name: 'channel_sent', type: 'jsonb', default: () => "'[]'" })
  channelSent!: string[];

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
