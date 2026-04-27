import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsObject,
} from 'class-validator';
import { NodeType } from '../entities/flow-node.entity';

export class FlowNodeDto {
  @IsString()
  @IsNotEmpty()
  nodeKey: string;

  @IsEnum(NodeType)
  type: NodeType;

  @IsString()
  @IsOptional()
  label?: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, any>;

  @IsNumber()
  @IsOptional()
  positionX?: number;

  @IsNumber()
  @IsOptional()
  positionY?: number;

  @IsObject()
  @IsOptional()
  uiMeta?: Record<string, any>;

  @IsString()
  @IsOptional()
  abVariant?: string;
}
