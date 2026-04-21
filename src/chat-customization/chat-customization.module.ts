import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatCustomization } from './entities/chat-customization.entity';
import { ChatCustomizationService } from './chat-customization.service';
import { ChatCustomizationController } from './chat-customization.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ChatCustomization])],
  controllers: [ChatCustomizationController],
  providers: [ChatCustomizationService],
  exports: [ChatCustomizationService],
})
export class ChatCustomizationModule {}
