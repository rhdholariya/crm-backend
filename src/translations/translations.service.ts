import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Translation } from './entities/translation.entity';
import { CreateTranslationDto } from './dto/create-translation.dto';
import { UpdateTranslationDto } from './dto/update-translation.dto';
import { BulkCreateTranslationDto } from './dto/bulk-create-translation.dto';
import { Language } from '../language/entities/language.entity';

const ADMIN_ROLE_ID = 1;

@Injectable()
export class TranslationsService {
  constructor(
    @InjectRepository(Translation)
    private readonly repo: Repository<Translation>,
    @InjectRepository(Language)
    private readonly languageRepo: Repository<Language>,
  ) {}

  // Create a single translation entry
  async create(roleId: number, dto: CreateTranslationDto): Promise<Translation> {
    if (roleId !== ADMIN_ROLE_ID) throw new ForbiddenException('Admin only');

    const existing = await this.repo.findOne({
      where: { keyword: dto.keyword, languageCode: dto.languageCode.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException(
        `Translation for keyword "${dto.keyword}" in language "${dto.languageCode}" already exists`,
      );
    }

    const translation = await this.repo.save(
      this.repo.create({ ...dto, languageCode: dto.languageCode.toLowerCase() }),
    );

    // Auto-insert this keyword in all other languages with empty value
    try {
      const allLanguages = await this.languageRepo.find();
      const currentLanguageCode = dto.languageCode.toLowerCase();

      for (const language of allLanguages) {
        if (language.code === currentLanguageCode) continue; // Skip the language we just created for

        const alreadyExists = await this.repo.findOne({
          where: { keyword: dto.keyword, languageCode: language.code },
        });

        if (!alreadyExists) {
          await this.repo.save(
            this.repo.create({
              keyword: dto.keyword,
              languageCode: language.code,
              value: '', // Empty value — admin fills it in
            }),
          );
        }
      }
      console.log(`✓ Keyword "${dto.keyword}" auto-inserted in all languages`);
    } catch (error) {
      console.error(`Failed to auto-insert keyword "${dto.keyword}" in all languages:`, error);
      // Don't throw — translation was created successfully, just log the error
    }

    return translation;
  }

  // Bulk upsert: pass languageCode + { keyword: value } map
  async bulkUpsert(
    roleId: number,
    dto: BulkCreateTranslationDto,
  ): Promise<{ upserted: number }> {
    if (roleId !== ADMIN_ROLE_ID) throw new ForbiddenException('Admin only');

    const code = dto.languageCode.toLowerCase();
    const entries = Object.entries(dto.translations).map(([keyword, value]) =>
      this.repo.create({ keyword, languageCode: code, value }),
    );

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(Translation)
      .values(entries)
      .orUpdate(['value', 'updatedAt'], ['keyword', 'languageCode'])
      .execute();

    return { upserted: entries.length };
  }

  // GET all translations for a language code — returns flat { "keyword": "value" } object
  // e.g. { "common.appName": "CRM System", "auth.login.title": "Welcome To CRM System!" }
  async findByLanguage(languageCode: string): Promise<Record<string, string>> {
    const rows = await this.repo.find({
      where: { languageCode: languageCode.toLowerCase() },
      order: { keyword: 'ASC' },
      select: ['keyword', 'value'],
    });

    if (!rows.length) {
      throw new NotFoundException(`No translations found for language "${languageCode}"`);
    }

    return Object.fromEntries(rows.map(({ keyword, value }) => [keyword, value]));
  }

  // GET all translations for a language as a list — returns [{ id, keyword, value }]
  // Used by the edit UI so the frontend has both the id (for PATCH) and the keyword (for display)
  async findListByLanguage(
    languageCode: string,
  ): Promise<Pick<Translation, 'id' | 'keyword' | 'value'>[]> {
    const rows = await this.repo.find({
      where: { languageCode: languageCode.toLowerCase() },
      order: { keyword: 'ASC' },
      select: ['id', 'keyword', 'value'],
    });

    if (!rows.length) {
      throw new NotFoundException(`No translations found for language "${languageCode}"`);
    }

    return rows;
  }

  // GET single translation by keyword + languageCode
  async findOne(keyword: string, languageCode: string): Promise<Translation> {
    const row = await this.repo.findOne({
      where: { keyword, languageCode: languageCode.toLowerCase() },
    });
    if (!row) {
      throw new NotFoundException(
        `Translation for keyword "${keyword}" in language "${languageCode}" not found`,
      );
    }
    return row;
  }

  // Update a single translation
  async update(
    roleId: number,
    id: number,
    dto: UpdateTranslationDto,
  ): Promise<Translation> {
    if (roleId !== ADMIN_ROLE_ID) throw new ForbiddenException('Admin only');

    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Translation #${id} not found`);

    await this.repo.update(id, { value: dto.value });
    return this.repo.findOne({ where: { id } }) as Promise<Translation>;
  }

  // Delete a single translation
  async remove(roleId: number, id: number): Promise<{ message: string }> {
    if (roleId !== ADMIN_ROLE_ID) throw new ForbiddenException('Admin only');

    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Translation #${id} not found`);

    await this.repo.remove(row);
    return { message: 'Translation deleted successfully' };
  }
}
