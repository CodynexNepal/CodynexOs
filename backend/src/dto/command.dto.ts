import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ProjectPriority } from '../constant/enum.constant';

export class IssueCommandDto {
  @IsString()
  @IsNotEmpty({ message: 'CEO instruction cannot be empty' })
  @MaxLength(4000)
  instruction!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsEnum(ProjectPriority)
  priority?: ProjectPriority;

  @IsOptional()
  @IsString()
  clarificationAnswer?: string;
}

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  departmentId!: string;

  @IsOptional()
  @IsString()
  assignedEmployeeId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsNotEmpty()
  taskType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependsOnTaskIds?: string[];
}

export class ReviewApprovalDto {
  @IsString()
  @IsNotEmpty()
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
