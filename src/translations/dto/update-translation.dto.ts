import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateTranslationDto {
  @IsString()
  @IsNotEmpty()
  value: string;
}
