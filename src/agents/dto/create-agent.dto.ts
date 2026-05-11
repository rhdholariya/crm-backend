import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsPhoneNumber, IsBoolean,
} from 'class-validator';

export class CreateAgentDto {
  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
