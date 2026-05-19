import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogueProduct, ProductStatus } from '../entities/catalogue-product.entity';
import { Catalogue, CatalogueSource } from '../entities/catalogue.entity';
import { CatalogueService } from './catalogue.service';
import { EcommerceIntegration, IntegrationPlatform } from '../../lead-management/entities/ecommerce-integration.entity';

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  handle: string;
  status: string;
  variants: Array<{
    id: number;
    sku: string;
    price: string;
    compare_at_price: string | null;
    inventory_quantity: number;
  }>;
  images: Array<{ src: string }>;
}

interface WooProduct {
  id: number;
  name: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  status: string;
  categories: Array<{ name: string }>;
  images: Array<{ src: string }>;
  permalink: string;
}

@Injectable()
export class CatalogueSyncService {
  private readonly logger = new Logger(CatalogueSyncService.name);

  constructor(
    @InjectRepository(CatalogueProduct)
    private readonly productRepo: Repository<CatalogueProduct>,
    @InjectRepository(EcommerceIntegration)
    private readonly integrationRepo: Repository<EcommerceIntegration>,
    private readonly catalogueService: CatalogueService,
  ) {}

  /**
   * Sync products from the linked ecommerce integration into the catalogue.
   * Existing products with matching externalProductId are updated; new ones are inserted.
   */
  async syncFromIntegration(
    userId: number,
    catalogueId: number,
  ): Promise<{ synced: number; created: number; updated: number }> {
    const catalogue = await this.catalogueService.getCatalogue(userId, catalogueId);

    if (!catalogue.integrationId) {
      throw new BadRequestException(
        'This catalogue is not linked to an ecommerce integration.',
      );
    }

    const integration = await this.integrationRepo.findOne({
      where: { id: catalogue.integrationId, userId },
    });

    if (!integration) {
      throw new BadRequestException('Linked ecommerce integration not found.');
    }

    await this.catalogueService.setCatalogueSyncing(catalogueId);

    try {
      let stats = { synced: 0, created: 0, updated: 0 };

      if (integration.platform === IntegrationPlatform.SHOPIFY) {
        stats = await this.syncShopify(userId, catalogue, integration);
      } else if (integration.platform === IntegrationPlatform.WOOCOMMERCE) {
        stats = await this.syncWooCommerce(userId, catalogue, integration);
      } else {
        throw new BadRequestException(
          `Unsupported platform: ${integration.platform}`,
        );
      }

      await this.catalogueService.markCatalogueSynced(catalogueId);
      this.logger.log(
        `[SYNC] Catalogue ${catalogueId} synced — created=${stats.created} updated=${stats.updated}`,
      );
      return stats;
    } catch (error) {
      // Restore active status on failure so the catalogue is not stuck in syncing
      await this.catalogueService.markCatalogueSynced(catalogueId);
      throw error;
    }
  }

  // ── Shopify ─────────────────────────────────────────────────────────────────

  private async syncShopify(
    userId: number,
    catalogue: Catalogue,
    integration: EcommerceIntegration,
  ): Promise<{ synced: number; created: number; updated: number }> {
    const products = await this.fetchShopifyProducts(integration);
    return this.upsertProducts(userId, catalogue, products.map(this.mapShopifyProduct.bind(this)));
  }

  private async fetchShopifyProducts(
    integration: EcommerceIntegration,
  ): Promise<ShopifyProduct[]> {
    const baseUrl = integration.storeUrl.replace(/\/$/, '');
    const allProducts: ShopifyProduct[] = [];
    let pageInfo: string | null = null;
    const limit = 250;

    do {
      const url = pageInfo
        ? `${baseUrl}/admin/api/2024-01/products.json?limit=${limit}&page_info=${pageInfo}`
        : `${baseUrl}/admin/api/2024-01/products.json?limit=${limit}`;

      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': integration.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new BadRequestException(
          `Shopify API error (${response.status}): ${body}`,
        );
      }

      const data: any = await response.json();
      allProducts.push(...(data.products || []));

      // Shopify cursor-based pagination via Link header
      const linkHeader = response.headers.get('Link') || '';
      const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      pageInfo = nextMatch ? nextMatch[1] : null;
    } while (pageInfo);

    this.logger.log(`[SHOPIFY] Fetched ${allProducts.length} products`);
    return allProducts;
  }

  private mapShopifyProduct(p: ShopifyProduct): Partial<CatalogueProduct> {
    const variant = p.variants?.[0];
    const price = parseFloat(variant?.price || '0');
    const compareAtPrice = variant?.compare_at_price
      ? parseFloat(variant.compare_at_price)
      : undefined;

    return {
      externalProductId: String(p.id),
      name: p.title,
      description: this.stripHtml(p.body_html || ''),
      imageUrl: p.images?.[0]?.src || undefined,
      additionalImages: p.images?.slice(1).map((img) => img.src) || [],
      price,
      compareAtPrice,
      sku: variant?.sku || undefined,
      category: p.product_type || undefined,
      stockQuantity: variant?.inventory_quantity ?? undefined,
      status:
        p.status === 'active' ? ProductStatus.ACTIVE : ProductStatus.INACTIVE,
      metadata: { shopifyHandle: p.handle, vendor: p.vendor },
    };
  }

  // ── WooCommerce ─────────────────────────────────────────────────────────────

  private async syncWooCommerce(
    userId: number,
    catalogue: Catalogue,
    integration: EcommerceIntegration,
  ): Promise<{ synced: number; created: number; updated: number }> {
    const products = await this.fetchWooProducts(integration);
    return this.upsertProducts(userId, catalogue, products.map(this.mapWooProduct.bind(this)));
  }

  private async fetchWooProducts(
    integration: EcommerceIntegration,
  ): Promise<WooProduct[]> {
    const baseUrl = integration.storeUrl.replace(/\/$/, '');
    const allProducts: WooProduct[] = [];
    let page = 1;
    const perPage = 100;

    // WooCommerce uses Basic Auth: consumer_key:consumer_secret
    const credentials = Buffer.from(
      `${integration.apiKey}:${integration.apiSecret}`,
    ).toString('base64');

    while (true) {
      const url = `${baseUrl}/wp-json/wc/v3/products?per_page=${perPage}&page=${page}&status=publish`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new BadRequestException(
          `WooCommerce API error (${response.status}): ${body}`,
        );
      }

      const data: WooProduct[] = await response.json();
      if (!data.length) break;

      allProducts.push(...data);
      if (data.length < perPage) break;
      page++;
    }

    this.logger.log(`[WOOCOMMERCE] Fetched ${allProducts.length} products`);
    return allProducts;
  }

  private mapWooProduct(p: WooProduct): Partial<CatalogueProduct> {
    const price = parseFloat(p.price || p.regular_price || '0');
    const compareAtPrice =
      p.regular_price && p.sale_price && p.sale_price !== p.regular_price
        ? parseFloat(p.regular_price)
        : undefined;

    return {
      externalProductId: String(p.id),
      name: p.name,
      description: this.stripHtml(p.description || p.short_description || ''),
      imageUrl: p.images?.[0]?.src || undefined,
      additionalImages: p.images?.slice(1).map((img) => img.src) || [],
      price,
      compareAtPrice,
      sku: p.sku || undefined,
      category: p.categories?.[0]?.name || undefined,
      productUrl: p.permalink || undefined,
      stockQuantity: p.stock_quantity ?? undefined,
      status:
        p.status === 'publish' ? ProductStatus.ACTIVE : ProductStatus.INACTIVE,
      metadata: { wooStatus: p.status },
    };
  }

  // ── Upsert helper ───────────────────────────────────────────────────────────

  private async upsertProducts(
    userId: number,
    catalogue: Catalogue,
    mappedProducts: Partial<CatalogueProduct>[],
  ): Promise<{ synced: number; created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const mapped of mappedProducts) {
      const existing = mapped.externalProductId
        ? await this.productRepo.findOne({
            where: {
              catalogueId: catalogue.id,
              externalProductId: mapped.externalProductId,
            },
          })
        : null;

      if (existing) {
        Object.assign(existing, mapped);
        await this.productRepo.save(existing);
        updated++;
      } else {
        const product = this.productRepo.create({
          ...mapped,
          userId,
          catalogueId: catalogue.id,
          currency: catalogue.currency || 'USD',
        });
        await this.productRepo.save(product);
        created++;
      }
    }

    return { synced: created + updated, created, updated };
  }

  // ── Utility ─────────────────────────────────────────────────────────────────

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
}
