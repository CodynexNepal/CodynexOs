import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendAiUsageTracking1700000002000 implements MigrationInterface {
  name = 'ExtendAiUsageTracking1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ai_usage_logs
        ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS request_id VARCHAR(64),
        ADD COLUMN IF NOT EXISTS total_tokens INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS error_category VARCHAR(32)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
      ON ai_usage_logs(user_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_employee_created
      ON ai_usage_logs(employee_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_usage_employee_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_usage_user_created`);
    await queryRunner.query(`
      ALTER TABLE ai_usage_logs
        DROP COLUMN IF EXISTS error_category,
        DROP COLUMN IF EXISTS total_tokens,
        DROP COLUMN IF EXISTS request_id,
        DROP COLUMN IF EXISTS user_id
    `);
  }
}
