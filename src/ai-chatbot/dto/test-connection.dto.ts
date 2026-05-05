import { IsEnum, IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { AiModel, AiProvider } from '../entities/ai-settings.entity';

export class TestConnectionDto {
  @IsNotEmpty({ message: 'apiKey is required' })
  @IsString()
  apiKey: string;

  @IsNotEmpty({ message: 'model is required' })
  @IsEnum(AiModel, {
    message: `model must be one of: ${Object.values(AiModel).join(', ')}`,
  })
  model: AiModel;

  @IsNotEmpty({ message: 'name is required' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'provider is required' })
  @IsEnum(AiProvider, {
    message: `provider must be one of: ${Object.values(AiProvider).join(', ')}`,
  })
  provider: AiProvider;

  @IsNotEmpty({ message: 'System Prompt is required' })
  @IsString()
  systemPrompt?: string;
}
