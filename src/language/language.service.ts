import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Language } from './entities/language.entity';
import { CreateLanguageDto } from './dto/create-language.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';

const ADMIN_ROLE_ID = 1;

export interface PaginatedLanguages {
  data: Language[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class LanguageService {
  constructor(
    @InjectRepository(Language)
    private readonly repo: Repository<Language>,
  ) {}

  // Admin only — create
  async create(roleId: number, dto: CreateLanguageDto): Promise<Language> {
    if (roleId !== ADMIN_ROLE_ID) throw new ForbiddenException('Admin only');

    const existing = await this.repo.findOne({
      where: { code: dto.code.toLowerCase() },
    });
    if (existing) throw new ConflictException(`Language code "${dto.code}" already exists`);

    return this.repo.save(
      this.repo.create({ ...dto, code: dto.code.toLowerCase() }),
    );
  }

  // All users — paginated (admin sees all, users see active only)
  async findAll(roleId: number, page = 1, limit = 10): Promise<PaginatedLanguages> {
    const where = roleId === ADMIN_ROLE_ID ? {} : { isActive: true };
    const [data, total] = await this.repo.findAndCount({
      where,
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // All users — get single by id
  async findOne(id: number): Promise<Language> {
    const language = await this.repo.findOne({ where: { id } });
    if (!language) throw new NotFoundException(`Language #${id} not found`);
    return language;
  }

  // Admin only — update
  async update(roleId: number, id: number, dto: UpdateLanguageDto): Promise<Language> {
    if (roleId !== ADMIN_ROLE_ID) throw new ForbiddenException('Admin only');

    await this.findOne(id);

    if (dto.code) {
      const conflict = await this.repo.findOne({
        where: { code: dto.code.toLowerCase() },
      });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Language code "${dto.code}" already exists`);
      }
      dto.code = dto.code.toLowerCase();
    }

    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  // Admin only — delete
  async remove(roleId: number, id: number): Promise<{ message: string }> {
    if (roleId !== ADMIN_ROLE_ID) throw new ForbiddenException('Admin only');
    const language = await this.findOne(id);
    await this.repo.remove(language);
    return { message: 'Language deleted successfully' };
  }
}
