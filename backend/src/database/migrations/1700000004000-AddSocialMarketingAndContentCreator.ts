import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialMarketingAndContentCreator1700000004000 implements MigrationInterface {
  name = 'AddSocialMarketingAndContentCreator1700000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Extend marketing_campaigns with occasion and social multi-channel payload
    await queryRunner.query(`
      ALTER TABLE marketing_campaigns
        ADD COLUMN IF NOT EXISTS occasion VARCHAR(100),
        ADD COLUMN IF NOT EXISTS content_payload JSONB,
        ADD COLUMN IF NOT EXISTS channels JSONB,
        ADD COLUMN IF NOT EXISTS post_results JSONB
    `);

    // 2. Create social_accounts table for official accounts
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS social_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
        platform VARCHAR(32) NOT NULL,
        account_name VARCHAR(160) NOT NULL,
        account_handle VARCHAR(100),
        page_or_phone_id VARCHAR(120),
        access_token_encrypted TEXT,
        is_connected BOOLEAN NOT NULL DEFAULT TRUE,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_social_accounts_platform
      ON social_accounts(platform, is_connected)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS social_accounts CASCADE`);
    await queryRunner.query(`
      ALTER TABLE marketing_campaigns
        DROP COLUMN IF EXISTS post_results,
        DROP COLUMN IF EXISTS channels,
        DROP COLUMN IF EXISTS content_payload,
        DROP COLUMN IF EXISTS occasion
    `);
  }
}
