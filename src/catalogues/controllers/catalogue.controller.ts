import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/utils/response.util';
import { CatalogueService } from '../services/catalogue.service';
import { CatalogueSyncService } from '../services/catalogue-sync.service';
import { CatalogueShareService } from '../services/catalogue-share.service';
import { CreateCatalogueDto } from '../dto/create-catalogue.dto';
import { UpdateCatalogueDto } from '../dto/update-catalogue.dto';
import { CreateCatalogueProductDto } from '../dto/create-catalogue-product.dto';
import { UpdateCatalogueProductDto } from '../dto/update-catalogue-product.dto';
import { QueryCatalogueDto, QueryProductDto } from '../dto/query-catalogue.dto';
import { ShareProductDto, ShareCatalogueDto } from '../dto/share-product.dto';
import { IsArray, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

class BulkDeleteProductsDto {
  @IsArray()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  @Type(() => Number)
  productIds: number[];
}

@Controller('catalogues')
@UseGuards(JwtAuthGuard)
export class CatalogueController {
  private readonly logger = new Logger(CatalogueController.name);

  constructor(
    private readonly catalogueService: CatalogueService,
    private readonly syncService: CatalogueSyncService,
    private readonly shareService: CatalogueShareService,
  ) {}

  // ── Catalogues ──────────────────────────────────────────────────────────────

  @Post()
  async createCatalogue(
    @CurrentUser() user: any,
    @Body() dto: CreateCatalogueDto,
  ) {
    const data = await this.catalogueService.createCatalogue(user.id, dto);
    return successResponse('Catalogue created successfully', data);
  }

  @Get()
  async listCatalogues(
    @CurrentUser() user: any,
    @Query() query: QueryCatalogueDto,
  ) {
    const data = await this.catalogueService.listCatalogues(user.id, query);
    return successResponse('Catalogues fetched successfully', data);
  }

  @Get(':id')
  async getCatalogue(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.catalogueService.getCatalogue(user.id, id);
    return successResponse('Catalogue fetched successfully', data);
  }

  @Put(':id')
  @Patch(':id')
  async updateCatalogue(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatalogueDto,
  ) {
    const data = await this.catalogueService.updateCatalogue(user.id, id, dto);
    return successResponse('Catalogue updated successfully', data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteCatalogue(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.catalogueService.deleteCatalogue(user.id, id);
    return successResponse('Catalogue deleted successfully');
  }

  // ── Sync from ecommerce platform ────────────────────────────────────────────

  @Post(':id/sync')
  async syncCatalogue(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.logger.log(`[API] POST /catalogues/${id}/sync → userId=${user.id}`);
    const data = await this.syncService.syncFromIntegration(user.id, id);
    return successResponse(
      `Sync complete — ${data.created} created, ${data.updated} updated`,
      data,
    );
  }

  // ── Share catalogue ─────────────────────────────────────────────────────────

  @Post(':id/share')
  async shareCatalogue(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ShareCatalogueDto,
  ) {
    this.logger.log(
      `[API] POST /catalogues/${id}/share → userId=${user.id} channel=${dto.channel} recipients=${dto.recipients.length}`,
    );
    const data = await this.shareService.shareCatalogue(user.id, id, dto);
    return successResponse(
      `Catalogue shared — ${data.sent} sent, ${data.failed} failed`,
      data,
    );
  }

  // ── Products ────────────────────────────────────────────────────────────────

  @Post(':id/products')
  async addProduct(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCatalogueProductDto,
  ) {
    const data = await this.catalogueService.addProduct(user.id, id, dto);
    return successResponse('Product added successfully', data);
  }

  @Get(':id/products')
  async listProducts(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryProductDto,
  ) {
    const data = await this.catalogueService.listProducts(user.id, id, query);
    return successResponse('Products fetched successfully', data);
  }

  @Get(':id/products/:productId')
  async getProduct(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    const data = await this.catalogueService.getProduct(user.id, id, productId);
    return successResponse('Product fetched successfully', data);
  }

  @Put(':id/products/:productId')
  @Patch(':id/products/:productId')
  async updateProduct(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: UpdateCatalogueProductDto,
  ) {
    const data = await this.catalogueService.updateProduct(user.id, id, productId, dto);
    return successResponse('Product updated successfully', data);
  }

  @Delete(':id/products/:productId')
  @HttpCode(HttpStatus.OK)
  async deleteProduct(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    await this.catalogueService.deleteProduct(user.id, id, productId);
    return successResponse('Product deleted successfully');
  }

  @Delete(':id/products')
  @HttpCode(HttpStatus.OK)
  async bulkDeleteProducts(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BulkDeleteProductsDto,
  ) {
    const data = await this.catalogueService.bulkDeleteProducts(user.id, id, dto.productIds);
    return successResponse(`${data.deleted} product(s) deleted`, data);
  }

  // ── Share products ──────────────────────────────────────────────────────────

  @Post(':id/products/share')
  async shareProducts(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ShareProductDto,
  ) {
    this.logger.log(
      `[API] POST /catalogues/${id}/products/share → userId=${user.id} channel=${dto.channel} products=${dto.productIds.length} recipients=${dto.recipients.length}`,
    );
    const data = await this.shareService.shareProducts(user.id, id, dto);
    return successResponse(
      `Products shared — ${data.sent} sent, ${data.failed} failed`,
      data,
    );
  }
}
