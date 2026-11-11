import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        role VARCHAR(32) NOT NULL CHECK (role IN ('CEO', 'ADMIN', 'OPERATOR', 'VIEWER')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash VARCHAR(255) NOT NULL,
        ip_address VARCHAR(64),
        user_agent TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        daily_token_budget INTEGER NOT NULL DEFAULT 100000,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        department_id UUID NOT NULL REFERENCES departments(id),
        slug VARCHAR(64) UNIQUE NOT NULL,
        role_title VARCHAR(120) NOT NULL,
        system_instruction TEXT NOT NULL,
        allowed_tools JSONB NOT NULL DEFAULT '[]',
        knowledge_scopes JSONB NOT NULL DEFAULT '[]',
        preferred_provider VARCHAR(32) NOT NULL DEFAULT 'gemini',
        preferred_model VARCHAR(100) NOT NULL DEFAULT 'gemini-2.5-flash',
        fallback_provider VARCHAR(32) DEFAULT 'groq',
        fallback_model VARCHAR(100) DEFAULT 'llama-3.3-70b-versatile',
        daily_token_budget INTEGER NOT NULL DEFAULT 50000,
        execution_budget_ms INTEGER NOT NULL DEFAULT 60000,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(200) NOT NULL,
        ceo_instruction TEXT NOT NULL,
        clarification_questions JSONB DEFAULT '[]',
        structured_plan JSONB,
        status VARCHAR(32) NOT NULL DEFAULT 'PLANNING'
          CHECK (status IN ('PLANNING', 'AWAITING_CLARIFICATION', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED')),
        priority VARCHAR(16) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
        created_by UUID NOT NULL REFERENCES users(id),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        department_id UUID NOT NULL REFERENCES departments(id),
        assigned_employee_id UUID REFERENCES ai_employees(id),
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        task_type VARCHAR(48) NOT NULL,
        priority SMALLINT NOT NULL DEFAULT 50,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
          CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'QUEUED', 'RUNNING', 'BLOCKED', 'UNDER_REVIEW', 'FAILED', 'COMPLETED', 'CANCELLED')),
        idempotency_key VARCHAR(128) UNIQUE NOT NULL,
        input_payload JSONB NOT NULL DEFAULT '{}',
        output_payload JSONB,
        verification_result JSONB,
        retry_count SMALLINT NOT NULL DEFAULT 0,
        max_retries SMALLINT NOT NULL DEFAULT 3,
        next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lease_owner VARCHAR(100),
        lease_expires_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, depends_on_task_id),
        CHECK (task_id <> depends_on_task_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        employee_id UUID REFERENCES ai_employees(id),
        attempt_number SMALLINT NOT NULL,
        worker_id VARCHAR(100) NOT NULL,
        status VARCHAR(24) NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT')),
        error_code VARCHAR(64),
        error_message TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_logs (
        id BIGSERIAL PRIMARY KEY,
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        execution_id UUID REFERENCES task_executions(id) ON DELETE SET NULL,
        level VARCHAR(16) NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')),
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        requested_by_employee_id UUID REFERENCES ai_employees(id),
        action_type VARCHAR(64) NOT NULL,
        summary VARCHAR(300) NOT NULL,
        risk_assessment TEXT,
        payload JSONB NOT NULL DEFAULT '{}',
        status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
        reviewed_by UUID REFERENCES users(id),
        review_note TEXT,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        category VARCHAR(48) NOT NULL CHECK (category IN ('INSTRUCTION', 'REQUIREMENT', 'TECH_DECISION', 'ARCHITECTURE', 'LESSON_LEARNED', 'FEEDBACK', 'STRATEGY')),
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        department_id UUID REFERENCES departments(id),
        title VARCHAR(200) NOT NULL,
        slug VARCHAR(150) UNIQUE NOT NULL,
        content_md TEXT NOT NULL,
        is_trusted BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS github_repositories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner VARCHAR(100) NOT NULL,
        name VARCHAR(120) NOT NULL,
        default_branch VARCHAR(64) NOT NULL DEFAULT 'main',
        is_write_authorized BOOLEAN NOT NULL DEFAULT FALSE,
        last_synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (owner, name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS github_pull_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        repository_id UUID NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
        task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        pr_number INTEGER NOT NULL,
        branch_name VARCHAR(150) NOT NULL,
        title VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CHECKS_FAILED', 'READY_FOR_REVIEW', 'MERGED', 'CLOSED')),
        checks_summary JSONB DEFAULT '{}',
        html_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS qa_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        reviewer_employee_id UUID REFERENCES ai_employees(id),
        verdict VARCHAR(24) NOT NULL CHECK (verdict IN ('PASSED', 'FAILED', 'BLOCKED')),
        checks_executed JSONB NOT NULL,
        failed_component VARCHAR(120),
        correction_task_id UUID REFERENCES tasks(id),
        summary TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS marketing_campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        name VARCHAR(200) NOT NULL,
        channel VARCHAR(32) NOT NULL CHECK (channel IN ('EMAIL', 'SEO', 'CONTENT', 'SOCIAL')),
        target_audience TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED')),
        approved_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS crm_leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
        business_name VARCHAR(200) NOT NULL,
        contact_name VARCHAR(150),
        email VARCHAR(255),
        phone VARCHAR(64),
        website TEXT,
        city VARCHAR(100),
        source_url TEXT,
        stage VARCHAR(32) NOT NULL DEFAULT 'NEW'
          CHECK (stage IN ('NEW', 'QUALIFIED', 'OUTREACH_DRAFTED', 'CONTACTED', 'REPLIED', 'DEMO_SCHEDULED', 'WON', 'LOST', 'OPTED_OUT')),
        lead_score SMALLINT NOT NULL DEFAULT 0,
        is_opted_out BOOLEAN NOT NULL DEFAULT FALSE,
        dedup_hash VARCHAR(64) UNIQUE NOT NULL,
        next_follow_up_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS crm_interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
        direction VARCHAR(16) NOT NULL CHECK (direction IN ('OUTBOUND', 'INBOUND', 'NOTE')),
        channel VARCHAR(32) NOT NULL,
        subject VARCHAR(255),
        body TEXT NOT NULL,
        reply_classification VARCHAR(32),
        approval_status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (approval_status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'BLOCKED')),
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS budget_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        scope_type VARCHAR(24) NOT NULL CHECK (scope_type IN ('GLOBAL', 'DEPARTMENT', 'EMPLOYEE')),
        scope_id UUID,
        daily_token_limit INTEGER NOT NULL,
        monthly_usd_limit NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
        max_concurrent_requests SMALLINT NOT NULL DEFAULT 3,
        allow_paid_providers BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id BIGSERIAL PRIMARY KEY,
        task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        employee_id UUID REFERENCES ai_employees(id) ON DELETE SET NULL,
        provider VARCHAR(32) NOT NULL,
        model VARCHAR(100) NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
        status VARCHAR(24) NOT NULL CHECK (status IN ('SUCCESS', 'RATE_LIMITED', 'QUOTA_EXHAUSTED', 'ERROR')),
        latency_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category VARCHAR(48) NOT NULL,
        severity VARCHAR(16) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        link_url VARCHAR(255),
        channel_sent JSONB NOT NULL DEFAULT '[]',
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGSERIAL PRIMARY KEY,
        actor_type VARCHAR(24) NOT NULL CHECK (actor_type IN ('USER', 'AI_EMPLOYEE', 'SYSTEM', 'WORKER')),
        actor_id VARCHAR(64) NOT NULL,
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(64) NOT NULL,
        resource_id VARCHAR(64),
        ip_address VARCHAR(64),
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        is_secret BOOLEAN NOT NULL DEFAULT FALSE,
        updated_by UUID REFERENCES users(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS idempotency_records (
        idempotency_key VARCHAR(128) PRIMARY KEY,
        method VARCHAR(16) NOT NULL,
        path VARCHAR(255) NOT NULL,
        status_code SMALLINT NOT NULL,
        response_body JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tasks_queue_poll ON tasks (status, next_run_at, priority DESC) WHERE status IN ('QUEUED', 'RUNNING')`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks (project_id, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs (created_at DESC, provider)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC, resource_type)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_memory_fts ON company_memory USING GIN (to_tsvector('english', title || ' ' || content))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'idempotency_records',
      'system_settings',
      'audit_logs',
      'notifications',
      'ai_usage_logs',
      'budget_policies',
      'crm_interactions',
      'crm_leads',
      'marketing_campaigns',
      'qa_reports',
      'github_pull_requests',
      'github_repositories',
      'knowledge_documents',
      'company_memory',
      'approval_requests',
      'task_logs',
      'task_executions',
      'task_dependencies',
      'tasks',
      'projects',
      'ai_employees',
      'departments',
      'sessions',
      'users',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
  }
}
