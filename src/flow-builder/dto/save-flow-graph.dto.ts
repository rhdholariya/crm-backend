import { IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { FlowNodeDto } from './flow-node.dto';
import { FlowEdgeDto } from './flow-edge.dto';

/**
 * Full graph save — replaces all nodes & edges for a flow.
 * Used by the drag-and-drop UI to persist the entire canvas state.
 */
export class SaveFlowGraphDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowNodeDto)
  nodes: FlowNodeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowEdgeDto)
  @IsOptional()
  edges?: FlowEdgeDto[];
}
