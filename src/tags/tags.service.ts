import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './entities/tag.entity';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
  ) {}

  create(userId: number, dto: CreateTagDto) {
    return this.tagRepo.save(this.tagRepo.create({ ...dto, userId }));
  }

  findAll(userId: number) {
    return this.tagRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async findOne(userId: number, id: number) {
    const tag = await this.tagRepo.findOne({ where: { id } });
    if (!tag) throw new NotFoundException(`Tag #${id} not found`);
    if (tag.userId !== userId) throw new ForbiddenException();
    return tag;
  }

  async update(userId: number, id: number, dto: UpdateTagDto) {
    const tag = await this.findOne(userId, id);
    await this.tagRepo.update(tag.id, dto);
    return this.tagRepo.findOne({ where: { id } });
  }

  async remove(userId: number, id: number) {
    const tag = await this.findOne(userId, id);
    await this.tagRepo.remove(tag);
    return { message: 'Tag deleted successfully' };
  }
}
