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

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsString()
  emailAccountId?: string;
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
  @IsString()
  businessId?: string;

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

export class CreateBusinessDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultGithubOwner?: string;
}

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultGithubOwner?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateEmailAccountDto {
  @IsOptional()
  @IsString()
  businessId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  label!: string;

  @IsOptional()
  @IsString()
  provider?: 'GMAIL' | 'SMTP';

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fromName!: string;

  @IsEmail()
  fromEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpUser?: string;

  @IsString()
  @IsNotEmpty()
  smtpPass!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailySendLimit?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateEmailAccountDto {
  @IsOptional()
  @IsString()
  businessId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  label?: string;

  @IsOptional()
  @IsString()
  provider?: 'GMAIL' | 'SMTP';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  fromName?: string;

  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpUser?: string;

  @IsOptional()
  @IsString()
  smtpPass?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailySendLimit?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class VerifyEmailAccountDto {
  @IsOptional()
  @IsEmail()
  testRecipientEmail?: string;
}

export class SendInteractionEmailDto {
  @IsOptional()
  @IsString()
  emailAccountId?: string;
}
