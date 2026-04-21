import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
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
    const record = await this.repo.findOne({ where: { userId } });
    return record ? this.withImageUrl(record) : null;
  }

  async upsert(
    userId: number,
    dto: UpsertChatCustomizationDto,
    file?: Express.Multer.File,
  ): Promise<ChatCustomization> {
    let record = await this.repo.findOne({ where: { userId } });
    if (!record) {
      record = this.repo.create({ userId });
    }

    if (dto.chatColor !== undefined) record.chatColor = dto.chatColor;
    if (dto.backgroundType !== undefined)
      record.backgroundType = dto.backgroundType;

    if (dto.backgroundType === BackgroundType.COLOR) {
      if (dto.backgroundColor !== undefined)
        record.backgroundColor = dto.backgroundColor;
      // clear image if switching to color
      if (record.backgroundImage) {
        this.deleteFile(record.backgroundImage);
        record.backgroundImage = null;
      }
    }

    if (dto.backgroundType === BackgroundType.IMAGE && file) {
      // remove old image
      if (record.backgroundImage) this.deleteFile(record.backgroundImage);
      // store as relative path from cwd e.g. uploads/chat-bg/bg-123.jpg
      record.backgroundImage = file.path.replace(/\\/g, '/');
      record.backgroundColor = null;
    }

    const saved = await this.repo.save(record);
    return this.withImageUrl(saved);
  }

  async delete(userId: number): Promise<void> {
    const record = await this.repo.findOne({ where: { userId } });
    if (!record) throw new NotFoundException('No customization found');
    if (record.backgroundImage) this.deleteFile(record.backgroundImage);
    await this.repo.remove(record);
  }

  /** Converts stored file path → public URL accessible by frontend */
  private withImageUrl(record: ChatCustomization): ChatCustomization {
    if (record.backgroundImage) {
      // Normalize to forward slashes and strip leading ./
      const normalized = record.backgroundImage.replace(/\\/g, '/').replace(/^\.\//, '');
      // Result: /uploads/chat-bg/bg-123.jpg
      (record as any).backgroundImageUrl = `/${normalized}`;
    } else {
      (record as any).backgroundImageUrl = null;
    }
    return record;
  }

  private deleteFile(filePath: string) {
    try {
      const abs = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {
      // ignore file deletion errors
    }
  }
}
