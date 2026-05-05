import { IsEnum, IsString, IsBoolean, IsOptional } from 'class-validator';
import { AiModel, AiProvider } from '../entities/ai-settings.entity';

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(AiModel)
  model?: AiModel;

  @IsOptional()
  @IsEnum(AiProvider)
  provider?: AiProvider;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  autoReplyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  hideAdminQuickReplies?: boolean;

  @IsOptional()
  @IsString()
  systemPrompt?: string;
}
