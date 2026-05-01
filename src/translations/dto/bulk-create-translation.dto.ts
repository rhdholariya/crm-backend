import { IsString, IsNotEmpty, IsObject, Length } from 'class-validator';

export class BulkCreateTranslationDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 10)
  languageCode: string;

  @IsObject()
  translations: Record<string, string>; // { keyword: value }
}
