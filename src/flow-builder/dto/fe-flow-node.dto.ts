import { IsString, IsNotEmpty, IsOptional, IsObject, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Matches exactly what Vue Flow / React Flow sends from the FE canvas.
 * The `id` field is the node's unique key within the flow.
 * The `type` is the FE node type string (e.g. "trigger", "sendMessage", "condition").
 * Position and all UI metadata are preserved as-is.
 */
export class FeNodePositionDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;
}

export class FeFlowNodeDto {
  @IsString()
  @IsNotEmpty()
  id: string; // FE node id → stored as nodeKey

  @IsString()
  @IsNotEmpty()
  type: string; // FE type string → mapped to NodeType enum

  @IsObject()
  @IsOptional()
  @Type(() => FeNodePositionDto)
  position?: FeNodePositionDto; // { x, y }

  @IsObject()
  @IsOptional()
  computedPosition?: { x: number; y: number; z?: number };

  @IsObject()
  @IsOptional()
  data?: Record<string, any>; // { label, config, keywords, message, ... }

  @IsObject()
  @IsOptional()
  dimensions?: { width: number; height: number };

  @IsObject()
  @IsOptional()
  handleBounds?: Record<string, any>;

  @IsObject()
  @IsOptional()
  uiMeta?: Record<string, any>;

  // Everything else the FE sends (selected, dragging, etc.) is accepted and stored
  [key: string]: any;
}
