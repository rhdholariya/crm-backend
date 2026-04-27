import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
} from 'class-validator';

export class FlowEdgeDto {
  @IsString()
  @IsNotEmpty()
  sourceNodeKey: string;

  @IsString()
  @IsNotEmpty()
  targetNodeKey: string;

  @IsString()
  @IsOptional()
  sourceHandle?: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsObject()
  @IsOptional()
  condition?: Record<string, any>;

  @IsObject()
  @IsOptional()
  uiMeta?: Record<string, any>;
}
