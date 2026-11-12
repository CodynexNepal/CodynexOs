import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessesAndEmailAccounts1700000001000 implements MigrationInterface {
  name = 'AddBusinessesAndEmailAccounts1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(160) NOT NULL,
        slug VARCHAR(120) UNIQUE NOT NULL,
        domain VARCHAR(255),
        industry VARCHAR(120),
        description TEXT,
        default_github_owner VARCHAR(100),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS email_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
        label VARCHAR(160) NOT NULL,
        provider VARCHAR(24) NOT NULL DEFAULT 'GMAIL' CHECK (provider IN ('GMAIL', 'SMTP')),
        from_name VARCHAR(160) NOT NULL,
        from_email VARCHAR(255) NOT NULL,
        smtp_host VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com',
        smtp_port INTEGER NOT NULL DEFAULT 587,
        smtp_secure BOOLEAN NOT NULL DEFAULT FALSE,
        smtp_user VARCHAR(255) NOT NULL,
        smtp_pass_encrypted TEXT NOT NULL,
        daily_send_limit INTEGER NOT NULL DEFAULT 100,
        sent_today INTEGER NOT NULL DEFAULT 0,
        last_reset_date VARCHAR(10),
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_accounts_business_default
      ON email_accounts(business_id, is_default, is_active)
    `);

    await queryRunner.query(`
      ALTER TABLE marketing_campaigns
        ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE crm_leads
        ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE crm_interactions
        ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE github_repositories
        ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE github_repositories DROP COLUMN IF EXISTS business_id`);
    await queryRunner.query(`ALTER TABLE projects DROP COLUMN IF EXISTS business_id`);
    await queryRunner.query(`
      ALTER TABLE crm_interactions
        DROP COLUMN IF EXISTS email_account_id,
        DROP COLUMN IF EXISTS business_id
    `);
    await queryRunner.query(`ALTER TABLE crm_leads DROP COLUMN IF EXISTS business_id`);
    await queryRunner.query(`
      ALTER TABLE marketing_campaigns
        DROP COLUMN IF EXISTS email_account_id,
        DROP COLUMN IF EXISTS business_id
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_accounts_business_default`);
    await queryRunner.query(`DROP TABLE IF EXISTS email_accounts`);
    await queryRunner.query(`DROP TABLE IF EXISTS businesses`);
  }
}
