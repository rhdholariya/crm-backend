import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { BackgroundType } from '../entities/chat-customization.entity';

export class UpsertChatCustomizationDto {
  @IsOptional()
  @IsString()
  chatColor?: string;

  @IsOptional()
  @Transform(({ value }) => value?.trim?.() ?? value)
  @IsEnum(BackgroundType)
  backgroundType?: BackgroundType;

  @IsOptional()
  @IsString()
  backgroundColor?: string;

  /** Base64 encoded image string e.g. "data:image/png;base64,iVBOR..." */
  @IsOptional()
  @IsString()
  backgroundImage?: string;
}
