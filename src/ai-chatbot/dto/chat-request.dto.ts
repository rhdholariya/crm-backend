import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  // Optional: use a specific chatbot by ID instead of the active one
  @IsOptional()
  @IsNumber()
  chatbotId?: number;
}

export class SuggestReplyDto {
  @IsString()
  @IsNotEmpty()
  customerMessage: string;

  @IsOptional()
  @IsString()
  conversationContext?: string;
}
