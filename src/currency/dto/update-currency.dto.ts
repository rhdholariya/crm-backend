import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateCurrencyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  symbol?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
