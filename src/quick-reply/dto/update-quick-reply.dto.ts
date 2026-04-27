import { IsString, IsOptional } from 'class-validator';

export class UpdateQuickReplyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  body?: string;
}
