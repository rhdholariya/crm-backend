import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Catalogue, CatalogueStatus, CatalogueSource } from '../entities/catalogue.entity';
import { CatalogueProduct, ProductStatus } from '../entities/catalogue-product.entity';
import { CreateCatalogueDto } from '../dto/create-catalogue.dto';
import { UpdateCatalogueDto } from '../dto/update-catalogue.dto';
import { CreateCatalogueProductDto } from '../dto/create-catalogue-product.dto';
import { UpdateCatalogueProductDto } from '../dto/update-catalogue-product.dto';
import { QueryCatalogueDto, QueryProductDto } from '../dto/query-catalogue.dto';

@Injectable()
export class CatalogueService {
  private readonly logger = new Logger(CatalogueService.name);

  constructor(
    @InjectRepository(Catalogue)
    private readonly catalogueRepo: Repository<Catalogue>,
    @InjectRepository(CatalogueProduct)
    private readonly productRepo: Repository<CatalogueProduct>,
  ) {}

  // ── Catalogues ──────────────────────────────────────────────────────────────

  async createCatalogue(
    userId: number,
    dto: CreateCatalogueDto,
  ): Promise<Catalogue> {
    const catalogue = this.catalogueRepo.create({
      ...dto,
      userId,
      status: CatalogueStatus.ACTIVE,
    });
    return this.catalogueRepo.save(catalogue);
  }

  async listCatalogues(
    userId: number,
    query: QueryCatalogueDto,
  ): Promise<{ data: Catalogue[]; total: number; page: number; limit: number; totalPages: number }> {
    const { status, source, search, page = 1, limit = 20 } = query;

    const qb = this.catalogueRepo
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .loadRelationCountAndMap('c.productCount', 'c.products');

    if (status) qb.andWhere('c.status = :status', { status });
    if (source) qb.andWhere('c.source = :source', { source });
    if (search) qb.andWhere('c.name ILIKE :search', { search: `%${search}%` });

    const [data, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getCatalogue(userId: number, id: number): Promise<Catalogue> {
    const catalogue = await this.catalogueRepo.findOne({
      where: { id, userId },
      relations: ['products'],
    });
    if (!catalogue) throw new NotFoundException('Catalogue not found');
    return catalogue;
  }

  async updateCatalogue(
    userId: number,
    id: number,
    dto: UpdateCatalogueDto,
  ): Promise<Catalogue> {
    const catalogue = await this.getCatalogue(userId, id);
    Object.assign(catalogue, dto);
    return this.catalogueRepo.save(catalogue);
  }

  async deleteCatalogue(userId: number, id: number): Promise<void> {
    const catalogue = await this.getCatalogue(userId, id);
    await this.catalogueRepo.remove(catalogue);
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async addProduct(
    userId: number,
    catalogueId: number,
    dto: CreateCatalogueProductDto,
  ): Promise<CatalogueProduct> {
    const catalogue = await this.getCatalogue(userId, catalogueId);

    const product = this.productRepo.create({
      ...dto,
      userId,
      catalogueId: catalogue.id,
      currency: dto.currency || catalogue.currency || 'USD',
    });
    return this.productRepo.save(product);
  }

  async listProducts(
    userId: number,
    catalogueId: number,
    query: QueryProductDto,
  ): Promise<{ data: CatalogueProduct[]; total: number; page: number; limit: number; totalPages: number }> {
    // Verify catalogue ownership
    await this.getCatalogue(userId, catalogueId);

    const { status, search, category, page = 1, limit = 20 } = query;

    const qb = this.productRepo
      .createQueryBuilder('p')
      .where('p.catalogueId = :catalogueId', { catalogueId })
      .andWhere('p.userId = :userId', { userId });

    if (status) qb.andWhere('p.status = :status', { status });
    if (category) qb.andWhere('p.category ILIKE :category', { category: `%${category}%` });
    if (search) {
      qb.andWhere('(p.name ILIKE :search OR p.description ILIKE :search OR p.sku ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const [data, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getProduct(
    userId: number,
    catalogueId: number,
    productId: number,
  ): Promise<CatalogueProduct> {
    const product = await this.productRepo.findOne({
      where: { id: productId, catalogueId, userId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProduct(
    userId: number,
    catalogueId: number,
    productId: number,
    dto: UpdateCatalogueProductDto,
  ): Promise<CatalogueProduct> {
    const product = await this.getProduct(userId, catalogueId, productId);
    Object.assign(product, dto);
    return this.productRepo.save(product);
  }

  async deleteProduct(
    userId: number,
    catalogueId: number,
    productId: number,
  ): Promise<void> {
    const product = await this.getProduct(userId, catalogueId, productId);
    await this.productRepo.remove(product);
  }

  async bulkDeleteProducts(
    userId: number,
    catalogueId: number,
    productIds: number[],
  ): Promise<{ deleted: number }> {
    await this.getCatalogue(userId, catalogueId);

    const result = await this.productRepo
      .createQueryBuilder()
      .delete()
      .where('id IN (:...ids)', { ids: productIds })
      .andWhere('catalogueId = :catalogueId', { catalogueId })
      .andWhere('userId = :userId', { userId })
      .execute();

    return { deleted: result.affected ?? 0 };
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  async getProductsByIds(
    userId: number,
    productIds: number[],
  ): Promise<CatalogueProduct[]> {
    if (!productIds.length) return [];
    return this.productRepo
      .createQueryBuilder('p')
      .where('p.id IN (:...ids)', { ids: productIds })
      .andWhere('p.userId = :userId', { userId })
      .getMany();
  }

  async getActiveProductsForCatalogue(
    userId: number,
    catalogueId: number,
    limit = 5,
  ): Promise<CatalogueProduct[]> {
    return this.productRepo.find({
      where: { catalogueId, userId, status: ProductStatus.ACTIVE },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async markCatalogueSynced(catalogueId: number): Promise<void> {
    await this.catalogueRepo.update(catalogueId, {
      lastSyncedAt: new Date(),
      status: CatalogueStatus.ACTIVE,
    });
  }

  async setCatalogueSyncing(catalogueId: number): Promise<void> {
    await this.catalogueRepo.update(catalogueId, {
      status: CatalogueStatus.SYNCING,
    });
  }
}
