// dto/update-profile.dto.ts
import { IsEmail, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsNotEmpty()
  firstName: string;

  @IsOptional()
  @IsNotEmpty()
  lastName: string;

  // @IsOptional()
  // @IsEmail()
  // email: string;

  @IsOptional()
  @IsNotEmpty()
  phoneNumber: string;
}
