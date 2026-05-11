import {
  IsString,
  IsBoolean,
  IsOptional,
  IsPhoneNumber,
  IsEmail,
} from 'class-validator';

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
