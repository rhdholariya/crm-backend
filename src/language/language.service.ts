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
import { TranslationsService } from '../translations/translations.service';
import { getDefaultKeysMap } from '../translations/default-keys';

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
    private readonly translationsService: TranslationsService,
  ) {}

  // Admin only — create
  async create(roleId: number, dto: CreateLanguageDto): Promise<Language> {
    if (roleId !== ADMIN_ROLE_ID) throw new ForbiddenException('Admin only');

    const existing = await this.repo.findOne({
      where: { code: dto.code.toLowerCase() },
    });
    if (existing) throw new ConflictException(`Language code "${dto.code}" already exists`);

    const language = await this.repo.save(
      this.repo.create({ ...dto, code: dto.code.toLowerCase() }),
    );

    // Auto-insert default translation keys for this new language
    try {
      const defaultKeys = getDefaultKeysMap();
      await this.translationsService.bulkUpsert(ADMIN_ROLE_ID, {
        languageCode: language.code,
        translations: defaultKeys,
      });
      console.log(`✓ Default translation keys inserted for language: ${language.code}`);
    } catch (error) {
      console.error(`Failed to insert default translation keys for ${language.code}:`, error);
      // Don't throw — language was created successfully, just log the error
    }

    return language;
  }

  // All users — paginated + search by name or code
  async findAll(roleId: number, page = 1, limit = 10, search?: string): Promise<PaginatedLanguages> {
    const qb = this.repo.createQueryBuilder('language');

    // Base condition — non-admins only see active languages
    if (roleId !== ADMIN_ROLE_ID) {
      qb.where('language.isActive = :isActive', { isActive: true });
    }

    // Search filter — always use andWhere so it stacks on top of base condition
    if (search) {
      const term = `%${search.toLowerCase()}%`;
      qb.andWhere('(LOWER(language.name) LIKE :term OR LOWER(language.code) LIKE :term)', { term });
    }

    const [data, total] = await qb
      .orderBy('language.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

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
