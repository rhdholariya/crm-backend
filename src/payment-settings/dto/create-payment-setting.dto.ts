import { IsNotEmpty, IsString, MaxLength, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentSettingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class CreatePaymentSettingArrayDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentSettingDto)
  data: CreatePaymentSettingDto[];
}
