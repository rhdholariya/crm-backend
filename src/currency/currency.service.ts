import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './entities/currency.entity';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

const ADMIN_ROLE_ID = 1;

export interface PaginatedCurrencies {
  data: Currency[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class CurrencyService {
  constructor(
    @InjectRepository(Currency)
    private readonly repo: Repository<Currency>,
  ) {}

  // Admin only — create a currency
  async create(roleId: number, dto: CreateCurrencyDto): Promise<Currency> {
    if (roleId !== ADMIN_ROLE_ID) throw new ForbiddenException('Admin only');

    const existing = await this.repo.findOne({
      where: { code: dto.code.toUpperCase() },
    });
    if (existing) throw new ConflictException(`Currency code "${dto.code}" already exists`);

    return this.repo.save(
      this.repo.create({ ...dto, code: dto.code.toUpperCase() }),
    );
  }

  // All users — list currencies with pagination (admin sees all, users see active only)
  async findAll(roleId: number, page = 1, limit = 10): Promise<PaginatedCurrencies> {
    const where = roleId === ADMIN_ROLE_ID ? {} : { isActive: true };
    const [data, total] = await this.repo.findAndCount({
      where,
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // All users — get single currency by id
  async findOne(id: number): Promise<Currency> {
    const currency = await this.repo.findOne({ where: { id } });
    if (!currency) throw new NotFoundException(`Currency #${id} not found`);
    return currency;
  }

  // All users — get currency by code (used internally by other services)
  async findByCode(code: string): Promise<Currency> {
    const currency = await this.repo.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!currency) throw new NotFoundException(`Currency "${code}" not found`);
    return currency;
  }

  // Admin only — update
  async update(roleId: number, id: number, dto: UpdateCurrencyDto): Promise<Currency> {
    if (roleId !== ADMIN_ROLE_ID) throw new ForbiddenException('Admin only');

    const currency = await this.findOne(id);

    if (dto.code) {
      const conflict = await this.repo.findOne({
        where: { code: dto.code.toUpperCase() },
      });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Currency code "${dto.code}" already exists`);
      }
      dto.code = dto.code.toUpperCase();
    }

    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  // Admin only — delete
  async remove(roleId: number, id: number): Promise<{ message: string }> {
    if (roleId !== ADMIN_ROLE_ID) throw new ForbiddenException('Admin only');
    const currency = await this.findOne(id);
    await this.repo.remove(currency);
    return { message: 'Currency deleted successfully' };
  }
}
