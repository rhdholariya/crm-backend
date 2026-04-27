import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuickReply } from './entities/quick-reply.entity';
import { CreateQuickReplyDto } from './dto/create-quick-reply.dto';
import { UpdateQuickReplyDto } from './dto/update-quick-reply.dto';

export interface PaginatedQuickReplies {
  data: QuickReply[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class QuickReplyService {
  constructor(
    @InjectRepository(QuickReply)
    private readonly repo: Repository<QuickReply>,
  ) {}

  create(userId: number, dto: CreateQuickReplyDto): Promise<QuickReply> {
    return this.repo.save(this.repo.create({ ...dto, userId }));
  }

  async findAll(
    userId: number,
    page = 1,
    limit = 10,
  ): Promise<PaginatedQuickReplies> {
    const [data, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(userId: number, id: number): Promise<QuickReply> {
    const qr = await this.repo.findOne({ where: { id } });
    if (!qr) throw new NotFoundException(`Quick reply #${id} not found`);
    if (qr.userId !== userId) throw new ForbiddenException();
    return qr;
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateQuickReplyDto,
  ): Promise<QuickReply> {
    await this.findOne(userId, id);
    await this.repo.update(id, dto);
    return this.findOne(userId, id);
  }

  async remove(userId: number, id: number): Promise<{ message: string }> {
    const qr = await this.findOne(userId, id);
    await this.repo.remove(qr);
    return { message: 'Quick reply deleted successfully' };
  }
}
