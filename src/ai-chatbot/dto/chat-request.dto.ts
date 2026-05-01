import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsString()
  contactId?: string;
}

export class SuggestReplyDto {
  @IsString()
  @IsNotEmpty()
  customerMessage: string;

  @IsOptional()
  @IsString()
  conversationContext?: string;
}
