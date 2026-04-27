import { IsString, IsOptional, IsObject } from 'class-validator';

export class SimulateFlowDto {
  @IsString()
  @IsOptional()
  triggerMessage?: string;

  @IsObject()
  @IsOptional()
  variables?: Record<string, any>;

  @IsString()
  @IsOptional()
  contactPhone?: string;
}
