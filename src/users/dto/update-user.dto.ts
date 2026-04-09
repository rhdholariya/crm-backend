import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @IsOptional()
  roleId?: number;

  @IsOptional()
  @IsDateString()
  otpVerifiedAt?: Date;
}
