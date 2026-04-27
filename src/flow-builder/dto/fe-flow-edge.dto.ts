import { IsString, IsNotEmpty, IsOptional, IsObject, IsBoolean } from 'class-validator';

/**
 * Matches exactly what Vue Flow / React Flow sends for edges.
 */
export class FeFlowEdgeDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  source: string; // source node id → stored as sourceNodeKey

  @IsString()
  @IsNotEmpty()
  target: string; // target node id → stored as targetNodeKey

  @IsString()
  @IsOptional()
  sourceHandle?: string | null;

  @IsString()
  @IsOptional()
  targetHandle?: string | null;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsObject()
  @IsOptional()
  style?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  animated?: boolean;

  @IsString()
  @IsOptional()
  markerEnd?: string;

  // Everything else (sourceNode, targetNode, sourceX/Y etc.) accepted and stored
  [key: string]: any;
}
