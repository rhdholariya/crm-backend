import { IsString, IsEmail, IsOptional, IsArray, IsInt } from 'class-validator';

export class UpdateContactDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  tagIds?: number[];
}
