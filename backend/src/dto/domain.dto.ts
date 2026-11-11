import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsArray,
} from 'class-validator';
import { LeadStage, MemoryCategory } from '../constant/enum.constant';

export class CreateMemoryDto {
  @IsEnum(MemoryCategory)
  category!: MemoryCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  projectId?: string;
}

export class CreateKnowledgeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  contentMd!: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

export class ConnectRepoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  owner!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  defaultBranch?: string;

  @IsOptional()
  @IsBoolean()
  isWriteAuthorized?: boolean;
}

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  channel!: 'EMAIL' | 'SEO' | 'CONTENT' | 'SOCIAL';

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}

export class UpsertLeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  businessName!: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;
}

export class UpdateBudgetPolicyDto {
  @IsInt()
  @Min(1000)
  dailyTokenLimit!: number;

  @IsInt()
  @Min(1)
  maxConcurrentRequests!: number;

  @IsBoolean()
  allowPaidProviders!: boolean;
}

export class UpdateSettingDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  value!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;
}
