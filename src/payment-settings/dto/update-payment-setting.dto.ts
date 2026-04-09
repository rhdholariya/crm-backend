import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdatePaymentSettingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}
