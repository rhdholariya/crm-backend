import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateLanguageDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  code?: string;

  @IsString()
  @IsOptional()
  flag?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
