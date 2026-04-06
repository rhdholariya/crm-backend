import {
  IsEmail,
  IsString,
  MinLength,
  IsPhoneNumber,
  IsOptional,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsPhoneNumber()
  phoneNumber: string;

  @IsString()
  @MinLength(8)
  password: string;
}
