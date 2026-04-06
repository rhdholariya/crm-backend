import {
  IsEmail,
  IsString,
  MinLength,
  IsInt,
  IsPhoneNumber,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsPhoneNumber()
  phoneNumber: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsInt()
  roleId: number;
}
