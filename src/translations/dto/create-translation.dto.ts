import { IsString, IsNotEmpty, Length } from 'class-validator';

export class CreateTranslationDto {
  @IsString()
  @IsNotEmpty()
  keyword: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 10)
  languageCode: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}
