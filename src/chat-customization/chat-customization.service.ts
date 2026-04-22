import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChatCustomization,
  BackgroundType,
} from './entities/chat-customization.entity';
import { UpsertChatCustomizationDto } from './dto/upsert-chat-customization.dto';

@Injectable()
export class ChatCustomizationService {
  constructor(
    @InjectRepository(ChatCustomization)
    private readonly repo: Repository<ChatCustomization>,
  ) {}

  async get(userId: number): Promise<ChatCustomization | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async upsert(
    userId: number,
    dto: UpsertChatCustomizationDto,
  ): Promise<ChatCustomization> {
    let record = await this.repo.findOne({ where: { userId } });
    if (!record) {
      record = this.repo.create({ userId });
    }

    if (dto.chatColor !== undefined) record.chatColor = dto.chatColor;
    if (dto.backgroundType !== undefined) record.backgroundType = dto.backgroundType;

    if (dto.backgroundType === BackgroundType.COLOR) {
      if (dto.backgroundColor !== undefined) record.backgroundColor = dto.backgroundColor;
      record.backgroundImage = null;
    }

    if (dto.backgroundType === BackgroundType.IMAGE) {
      if (dto.backgroundImage !== undefined) record.backgroundImage = dto.backgroundImage;
      record.backgroundColor = null;
    }

    return this.repo.save(record);
  }

  async delete(userId: number): Promise<void> {
    const record = await this.repo.findOne({ where: { userId } });
    if (!record) throw new NotFoundException('No customization found');
    await this.repo.remove(record);
  }
}
