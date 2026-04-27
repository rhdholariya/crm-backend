import { IsString, IsNotEmpty } from 'class-validator';

export class CreateQuickReplyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  body: string;
}
