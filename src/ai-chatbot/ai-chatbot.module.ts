import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiSettings } from './entities/ai-settings.entity';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiMessage } from './entities/ai-message.entity';
import { AiChatbotService } from './ai-chatbot.service';
import { AiChatbotController } from './ai-chatbot.controller';
import { AiProviderService } from './ai-provider.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiSettings, AiConversation, AiMessage])],
  controllers: [AiChatbotController],
  providers: [AiChatbotService, AiProviderService],
  exports: [AiChatbotService],
})
export class AiChatbotModule {}
