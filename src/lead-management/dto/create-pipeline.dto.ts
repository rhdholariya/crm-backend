import { IsString, IsOptional, IsEnum } from 'class-validator';
import { PipelineType } from '../entities/pipeline.entity';

export class CreatePipelineDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PipelineType)
  type?: PipelineType;
}
