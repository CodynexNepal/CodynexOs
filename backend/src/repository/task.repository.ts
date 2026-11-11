import { AppDataSource } from '../database/database-source';
import { TaskEntity } from '../entities/task.entity';
import { TaskDependencyEntity } from '../entities/task-dependency.entity';
import { TaskExecutionEntity } from '../entities/task-execution.entity';
import { TaskLogEntity } from '../entities/task-log.entity';
import { TaskStatus } from '../constant/enum.constant';

export class TaskRepository {
  private get repo() {
    return AppDataSource.getRepository(TaskEntity);
  }

  private get depRepo() {
    return AppDataSource.getRepository(TaskDependencyEntity);
  }

  private get execRepo() {
    return AppDataSource.getRepository(TaskExecutionEntity);
  }

  private get logRepo() {
    return AppDataSource.getRepository(TaskLogEntity);
  }

  async findAll(filters?: { projectId?: string; status?: TaskStatus; departmentId?: string }) {
    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.department', 'dept')
      .leftJoinAndSelect('t.assignedEmployee', 'emp')
      .orderBy('t.createdAt', 'DESC');

    if (filters?.projectId) qb.andWhere('t.projectId = :projectId', { projectId: filters.projectId });
    if (filters?.status) qb.andWhere('t.status = :status', { status: filters.status });
    if (filters?.departmentId)
      qb.andWhere('t.departmentId = :departmentId', { departmentId: filters.departmentId });

    return qb.getMany();
  }

  findById(id: string) {
    return this.repo.findOne({
      where: { id },
      relations: ['department', 'assignedEmployee', 'project'],
    });
  }

  findByIdempotencyKey(key: string) {
    return this.repo.findOne({ where: { idempotencyKey: key } });
  }

  save(task: Partial<TaskEntity>) {
    return this.repo.save(this.repo.create(task));
  }

  updateById(id: string, patch: Partial<TaskEntity>) {
    return this.repo.update({ id }, patch as Parameters<typeof this.repo.update>[1]);
  }

  async addDependency(taskId: string, dependsOnTaskId: string) {
    return this.depRepo.save(this.depRepo.create({ taskId, dependsOnTaskId }));
  }

  async getDependencies(taskId: string) {
    return this.depRepo.find({ where: { taskId }, relations: ['dependsOn'] });
  }

  async appendLog(
    taskId: string,
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    message: string,
    metadata: Record<string, unknown> = {},
    executionId?: string | null,
  ) {
    return this.logRepo.save(
      this.logRepo.create({
        taskId,
        executionId: executionId ?? null,
        level,
        message,
        metadata,
      }),
    );
  }

  async getLogs(taskId: string) {
    return this.logRepo.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
      take: 200,
    });
  }

  async createExecution(data: Partial<TaskExecutionEntity>) {
    return this.execRepo.save(this.execRepo.create(data));
  }

  async updateExecution(id: string, patch: Partial<TaskExecutionEntity>) {
    return this.execRepo.update({ id }, patch as Parameters<typeof this.execRepo.update>[1]);
  }

  /**
   * Atomically claim one ready QUEUED task whose dependencies are all COMPLETED.
   */
  async claimNextReadyTask(workerId: string, leaseSeconds: number): Promise<TaskEntity | null> {
    return AppDataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `
        SELECT t.id
        FROM tasks t
        WHERE t.status = 'QUEUED'
          AND t.next_run_at <= NOW()
          AND NOT EXISTS (
            SELECT 1
            FROM task_dependencies td
            JOIN tasks dep ON dep.id = td.depends_on_task_id
            WHERE td.task_id = t.id
              AND dep.status <> 'COMPLETED'
          )
        ORDER BY t.priority DESC, t.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
        `,
      );

      if (!rows || rows.length === 0) return null;
      const taskId = rows[0].id as string;

      await manager.query(
        `
        UPDATE tasks
        SET status = 'RUNNING',
            lease_owner = $1,
            lease_expires_at = NOW() + ($2 || ' seconds')::interval,
            started_at = COALESCE(started_at, NOW()),
            updated_at = NOW()
        WHERE id = $3
        `,
        [workerId, String(leaseSeconds), taskId],
      );

      return manager.getRepository(TaskEntity).findOne({
        where: { id: taskId },
        relations: ['department', 'assignedEmployee', 'project'],
      });
    });
  }

  async reclaimExpiredLeases(): Promise<number> {
    const expired = await this.repo
      .createQueryBuilder('t')
      .where('t.status = :status', { status: TaskStatus.RUNNING })
      .andWhere('t.leaseExpiresAt IS NOT NULL')
      .andWhere('t.leaseExpiresAt < NOW()')
      .getMany();

    let reclaimed = 0;
    for (const task of expired) {
      const nextRetry = task.retryCount + 1;
      if (nextRetry > task.maxRetries) {
        await this.repo.update(
          { id: task.id },
          {
            status: TaskStatus.FAILED,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        );
        await this.appendLog(task.id, 'ERROR', 'Task lease expired and max retries exhausted');
      } else {
        const delaySec = Math.min(300, Math.pow(2, nextRetry) * 5);
        await this.repo.update(
          { id: task.id },
          {
            status: TaskStatus.QUEUED,
            retryCount: nextRetry,
            leaseOwner: null,
            leaseExpiresAt: null,
            nextRunAt: new Date(Date.now() + delaySec * 1000),
          },
        );
        await this.appendLog(
          task.id,
          'WARN',
          `Reclaimed stale lease; scheduled retry #${nextRetry} in ${delaySec}s`,
        );
      }
      reclaimed += 1;
    }
    return reclaimed;
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.status')
      .getRawMany<{ status: string; count: string }>();

    const map: Record<string, number> = {};
    for (const r of rows) {
      map[r.status] = Number(r.count);
    }
    return map;
  }
}
