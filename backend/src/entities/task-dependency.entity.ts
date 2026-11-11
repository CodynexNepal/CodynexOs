import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { TaskEntity } from './task.entity';

@Entity('task_dependencies')
export class TaskDependencyEntity {
  @PrimaryColumn({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @PrimaryColumn({ name: 'depends_on_task_id', type: 'uuid' })
  dependsOnTaskId!: string;

  @ManyToOne(() => TaskEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: TaskEntity;

  @ManyToOne(() => TaskEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depends_on_task_id' })
  dependsOnTask!: TaskEntity;
}
