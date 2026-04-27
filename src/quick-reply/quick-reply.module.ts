import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuickReply } from './entities/quick-reply.entity';
import { QuickReplyService } from './quick-reply.service';
import { QuickReplyController } from './quick-reply.controller';

@Module({
  imports: [TypeOrmModule.forFeature([QuickReply])],
  controllers: [QuickReplyController],
  providers: [QuickReplyService],
  exports: [QuickReplyService],
})
export class QuickReplyModule {}
