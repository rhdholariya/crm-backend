import {
  IsString,
  IsBoolean,
  IsOptional,
  IsPhoneNumber,
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
  @IsBoolean()
  isActive?: boolean;
}
