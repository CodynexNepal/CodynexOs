import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeQaReportTaskIdNullable1700000005000 implements MigrationInterface {
  name = 'MakeQaReportTaskIdNullable1700000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Allow task_id to be nullable so ad-hoc workspace verification can persist QA reports
    await queryRunner.query(`
      ALTER TABLE qa_reports
        ALTER COLUMN task_id DROP NOT NULL
    `);

    // 2. Re-create task_id foreign key constraint with ON DELETE SET NULL
    await queryRunner.query(`
      ALTER TABLE qa_reports
        DROP CONSTRAINT IF EXISTS qa_reports_task_id_fkey
    `);
    await queryRunner.query(`
      ALTER TABLE qa_reports
        ADD CONSTRAINT qa_reports_task_id_fkey
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    `);

    // 3. Ensure reviewer_employee_id foreign key has ON DELETE SET NULL
    await queryRunner.query(`
      ALTER TABLE qa_reports
        DROP CONSTRAINT IF EXISTS qa_reports_reviewer_employee_id_fkey
    `);
    await queryRunner.query(`
      ALTER TABLE qa_reports
        ADD CONSTRAINT qa_reports_reviewer_employee_id_fkey
        FOREIGN KEY (reviewer_employee_id) REFERENCES ai_employees(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE qa_reports
        DROP CONSTRAINT IF EXISTS qa_reports_task_id_fkey
    `);
    await queryRunner.query(`
      ALTER TABLE qa_reports
        ADD CONSTRAINT qa_reports_task_id_fkey
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE qa_reports
        ALTER COLUMN task_id SET NOT NULL
    `);
  }
}
