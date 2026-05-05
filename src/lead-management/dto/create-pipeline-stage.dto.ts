import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreatePipelineStageDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  color: string; // Hex color

  @IsOptional()
  @IsNumber()
  position?: number;
}
