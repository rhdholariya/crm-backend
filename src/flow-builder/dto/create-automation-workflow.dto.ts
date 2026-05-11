import { IsString, IsEnum, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { TriggerType, ActionType } from '../entities/automation-workflow.entity';

export class CreateAutomationWorkflowDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TriggerType)
  triggerType: TriggerType;

  @IsOptional()
  triggerConditions?: Record<string, any>;

  @IsEnum(ActionType)
  actionType: ActionType;

  @IsOptional()
  actionConfig?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  runOnce?: boolean;

  @IsOptional()
  @IsNumber()
  delayMinutes?: number;
}
