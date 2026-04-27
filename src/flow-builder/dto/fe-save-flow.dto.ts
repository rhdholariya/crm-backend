import { IsString, IsOptional, IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FeFlowNodeDto } from './fe-flow-node.dto';
import { FeFlowEdgeDto } from './fe-flow-edge.dto';

/**
 * The exact payload the FE sends when saving a flow from the canvas.
 * Matches the structure: { name, nodes[], edges[] }
 */
export class FeSaveFlowDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  triggerConfig?: Record<string, any>;

  @IsObject()
  @IsOptional()
  variables?: Record<string, any>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeFlowNodeDto)
  nodes: FeFlowNodeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeFlowEdgeDto)
  @IsOptional()
  edges?: FeFlowEdgeDto[];
}
