import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { Tag } from '../tags/entities/tag.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
  ) {}

  private async resolveTags(userId: number, tagIds: number[]): Promise<Tag[]> {
    if (!tagIds?.length) return [];
    const tags = await this.tagRepo.find({
      where: { id: In(tagIds), userId },
    });
    return tags;
  }

  async create(userId: number, dto: CreateContactDto): Promise<Contact> {
    const tags = await this.resolveTags(userId, dto.tagIds ?? []);
    const contact = this.contactRepo.create({
      userId,
      name: dto.name,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      tags,
    });
    return this.contactRepo.save(contact);
  }

  async findAll(
    userId: number,
    page = 1,
    limit = 10,
    search?: string,
    tagIds?: number[],
  ) {
    const qb = this.contactRepo
      .createQueryBuilder('contact')

      // ✅ Join for filtering (NO select)
      .leftJoin('contact.tags', 'filterTag')

      // ✅ Join for fetching ALL tags
      .leftJoinAndSelect('contact.tags', 'tag')

      .where('contact.userId = :userId', { userId });

    // ✅ Filter by tag
    if (tagIds?.length) {
      qb.andWhere('filterTag.id IN (:...tagIds)', { tagIds });
    }

    // ✅ Search
    if (search) {
      qb.andWhere(
        `(contact.name ILIKE :search 
        OR contact.email ILIKE :search 
        OR contact.phoneNumber ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    qb.orderBy('contact.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .distinct(true); // ⚠️ VERY IMPORTANT

    const [data, total] = await qb.getManyAndCount();

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
    };
  }

  async findOne(userId: number, id: number): Promise<Contact> {
    const contact = await this.contactRepo.findOne({ where: { id } });
    if (!contact) throw new NotFoundException(`Contact #${id} not found`);
    if (contact.userId !== userId) throw new ForbiddenException();
    return contact;
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateContactDto,
  ): Promise<Contact> {
    const contact = await this.findOne(userId, id);

    if (dto.name !== undefined) contact.name = dto.name;
    if (dto.email !== undefined) contact.email = dto.email;
    if (dto.phoneNumber !== undefined) contact.phoneNumber = dto.phoneNumber;
    if (dto.note !== undefined) contact.note = dto.note;
    if (dto.tagIds !== undefined) {
      contact.tags = await this.resolveTags(userId, dto.tagIds);
    }

    return this.contactRepo.save(contact);
  }

  async remove(userId: number, id: number): Promise<{ message: string }> {
    const contact = await this.findOne(userId, id);
    await this.contactRepo.remove(contact);
    return { message: 'Contact deleted successfully' };
  }
}
