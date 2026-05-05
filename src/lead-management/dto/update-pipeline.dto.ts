import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { PipelineType } from '../entities/pipeline.entity';

export class UpdatePipelineDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PipelineType)
  type?: PipelineType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
