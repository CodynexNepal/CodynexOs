import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHrContractsRulesAndTokens1700000003000 implements MigrationInterface {
  name = 'AddHrContractsRulesAndTokens1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enums
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE contract_status_enum AS ENUM ('DRAFT', 'ACTIVE', 'PROBATION', 'SUSPENDED', 'TERMINATED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE rule_severity_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE penalty_type_enum AS ENUM ('WARNING', 'TOKEN_DEDUCTION', 'BUDGET_SLASH', 'PROBATION', 'SUSPENSION', 'TERMINATION');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE violation_status_enum AS ENUM ('RECORDED', 'ENFORCED', 'APPEALED', 'PARDONED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE token_transaction_type_enum AS ENUM ('SIGNING_BONUS', 'TASK_REWARD', 'QUALITY_BONUS', 'RULE_PENALTY', 'BUDGET_SLASH', 'STAKE', 'UNSTAKE', 'MANUAL_GRANT');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2. company_rules table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_code VARCHAR(64) NOT NULL UNIQUE,
        title VARCHAR(140) NOT NULL,
        description TEXT NOT NULL,
        severity rule_severity_enum NOT NULL DEFAULT 'MEDIUM',
        default_penalty_tokens INTEGER NOT NULL DEFAULT 200,
        category VARCHAR(64) NOT NULL DEFAULT 'OPERATIONAL',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. agent_contracts table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agent_contracts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES ai_employees(id) ON DELETE CASCADE,
        contract_number VARCHAR(32) NOT NULL UNIQUE,
        title VARCHAR(140) NOT NULL,
        status contract_status_enum NOT NULL DEFAULT 'ACTIVE',
        token_salary_per_task INTEGER NOT NULL DEFAULT 100,
        token_balance INTEGER NOT NULL DEFAULT 1000,
        staked_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens_earned INTEGER NOT NULL DEFAULT 1000,
        total_tokens_penalized INTEGER NOT NULL DEFAULT 0,
        reputation_score INTEGER NOT NULL DEFAULT 100,
        terms_content_md TEXT NOT NULL,
        signed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        signature_hash VARCHAR(64) NOT NULL,
        violations_count INTEGER NOT NULL DEFAULT 0,
        penalties_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_contracts_employee
      ON agent_contracts(employee_id)
    `);

    // 4. rule_violations table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rule_violations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES ai_employees(id) ON DELETE CASCADE,
        rule_id UUID REFERENCES company_rules(id) ON DELETE SET NULL,
        rule_code VARCHAR(64) NOT NULL,
        task_id UUID,
        severity rule_severity_enum NOT NULL DEFAULT 'MEDIUM',
        penalty_type penalty_type_enum NOT NULL DEFAULT 'WARNING',
        token_penalty_amount INTEGER NOT NULL DEFAULT 0,
        status violation_status_enum NOT NULL DEFAULT 'ENFORCED',
        explanation TEXT NOT NULL,
        detected_by VARCHAR(64) NOT NULL DEFAULT 'hr_director',
        enforced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rule_violations_employee
      ON rule_violations(employee_id, created_at DESC)
    `);

    // 5. agent_token_transactions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agent_token_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES ai_employees(id) ON DELETE CASCADE,
        contract_id UUID REFERENCES agent_contracts(id) ON DELETE SET NULL,
        task_id UUID,
        amount INTEGER NOT NULL,
        type token_transaction_type_enum NOT NULL DEFAULT 'TASK_REWARD',
        balance_after INTEGER NOT NULL,
        description VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_token_tx_employee
      ON agent_token_transactions(employee_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS agent_token_transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS rule_violations`);
    await queryRunner.query(`DROP TABLE IF EXISTS agent_contracts`);
    await queryRunner.query(`DROP TABLE IF EXISTS company_rules`);
    await queryRunner.query(`DROP TYPE IF EXISTS token_transaction_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS violation_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS penalty_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS rule_severity_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS contract_status_enum`);
  }
}
