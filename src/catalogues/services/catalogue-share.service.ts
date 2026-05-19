import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CatalogueProduct } from '../entities/catalogue-product.entity';
import { Catalogue } from '../entities/catalogue.entity';
import { ShareProductDto, ShareCatalogueDto, ShareChannel } from '../dto/share-product.dto';
import { CatalogueService } from './catalogue.service';
import { WhatsAppMetaService } from '../../whatsapp/whatsapp-meta.service';
import { findSession } from '../../whatsapp/whatsapp.session';

@Injectable()
export class CatalogueShareService {
  private readonly logger = new Logger(CatalogueShareService.name);

  constructor(
    private readonly catalogueService: CatalogueService,
    private readonly metaService: WhatsAppMetaService,
  ) {}

  // ── Share individual products ───────────────────────────────────────────────

  async shareProducts(
    userId: number,
    catalogueId: number,
    dto: ShareProductDto,
  ): Promise<{ sent: number; failed: number; results: any[] }> {
    const products = await this.catalogueService.getProductsByIds(
      userId,
      dto.productIds,
    );

    if (!products.length) {
      throw new BadRequestException('No valid products found for the given IDs.');
    }

    const results: any[] = [];
    let sent = 0;
    let failed = 0;

    for (const recipient of dto.recipients) {
      try {
        if (dto.channel === ShareChannel.META) {
          await this.shareProductsViaMeta(userId, recipient, products, dto.customMessage);
        } else {
          await this.shareProductsViaQr(userId, recipient, products, dto.customMessage);
        }
        results.push({ recipient, status: 'sent' });
        sent++;
      } catch (error) {
        this.logger.error(
          `[SHARE] Failed to send to ${recipient}: ${error.message}`,
        );
        results.push({ recipient, status: 'failed', error: error.message });
        failed++;
      }
    }

    return { sent, failed, results };
  }

  // ── Share entire catalogue ──────────────────────────────────────────────────

  async shareCatalogue(
    userId: number,
    catalogueId: number,
    dto: ShareCatalogueDto,
  ): Promise<{ sent: number; failed: number; results: any[] }> {
    const catalogue = await this.catalogueService.getCatalogue(userId, catalogueId);
    const maxProducts = dto.maxProducts ?? 5;

    const products = await this.catalogueService.getActiveProductsForCatalogue(
      userId,
      catalogueId,
      maxProducts,
    );

    if (!products.length) {
      throw new BadRequestException('No active products in this catalogue to share.');
    }

    const results: any[] = [];
    let sent = 0;
    let failed = 0;

    for (const recipient of dto.recipients) {
      try {
        if (dto.channel === ShareChannel.META) {
          await this.shareCatalogueViaMeta(userId, recipient, catalogue, products, dto.customMessage);
        } else {
          await this.shareCatalogueViaQr(userId, recipient, catalogue, products, dto.customMessage);
        }
        results.push({ recipient, status: 'sent' });
        sent++;
      } catch (error) {
        this.logger.error(
          `[SHARE] Failed to send catalogue to ${recipient}: ${error.message}`,
        );
        results.push({ recipient, status: 'failed', error: error.message });
        failed++;
      }
    }

    return { sent, failed, results };
  }

  // ── Meta (Official WhatsApp Cloud API) ─────────────────────────────────────

  private async shareProductsViaMeta(
    userId: number,
    recipient: string,
    products: CatalogueProduct[],
    customMessage?: string,
  ): Promise<void> {
    const messages = this.buildProductMessages(products, customMessage);

    for (const message of messages) {
      await this.metaService.sendTextMessage(userId, recipient, message);
    }

    // Send product images via Meta image messages
    for (const product of products) {
      if (product.imageUrl) {
        await this.sendImageViaMeta(userId, recipient, product);
      }
    }
  }

  private async shareCatalogueViaMeta(
    userId: number,
    recipient: string,
    catalogue: Catalogue,
    products: CatalogueProduct[],
    customMessage?: string,
  ): Promise<void> {
    const introMessage = this.buildCatalogueIntroMessage(catalogue, customMessage);
    await this.metaService.sendTextMessage(userId, recipient, introMessage);

    for (const product of products) {
      const productMessage = this.buildSingleProductMessage(product);
      await this.metaService.sendTextMessage(userId, recipient, productMessage);

      if (product.imageUrl) {
        await this.sendImageViaMeta(userId, recipient, product);
      }
    }
  }

  /**
   * Send a product image using the Meta Cloud API image message type.
   */
  private async sendImageViaMeta(
    userId: number,
    recipient: string,
    product: CatalogueProduct,
  ): Promise<void> {
    try {
      const config = await (this.metaService as any).requireConfig(userId);
      const META_API_VERSION = 'v23.0';
      const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

      const caption = `🛍️ *${product.name}*\n${this.formatPrice(product.price, product.currency)}`;

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient.replace(/[^0-9]/g, ''),
        type: 'image',
        image: {
          link: product.imageUrl,
          caption,
        },
      };

      const response = await fetch(
        `${META_BASE}/${config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const data: any = await response.json();
      if (!response.ok || data.error) {
        this.logger.warn(
          `[META-IMAGE] Could not send image for product ${product.id}: ${data.error?.message}`,
        );
      }
    } catch (err: any) {
      this.logger.warn(`[META-IMAGE] Image send skipped: ${err.message}`);
    }
  }

  // ── QR / whatsapp-web.js ────────────────────────────────────────────────────

  private async shareProductsViaQr(
    userId: number,
    recipient: string,
    products: CatalogueProduct[],
    customMessage?: string,
  ): Promise<void> {
    const session = findSession(userId, 'default');
    if (!session?.client) {
      throw new BadRequestException(
        'WhatsApp QR session is not connected. Please scan the QR code first.',
      );
    }

    const messages = this.buildProductMessages(products, customMessage);
    const chatId = this.normalizeChatId(recipient);

    for (const message of messages) {
      await session.client.sendMessage(chatId, message);
    }

    // Send images via whatsapp-web.js MessageMedia
    for (const product of products) {
      if (product.imageUrl) {
        await this.sendImageViaQr(session, chatId, product);
      }
    }
  }

  private async shareCatalogueViaQr(
    userId: number,
    recipient: string,
    catalogue: Catalogue,
    products: CatalogueProduct[],
    customMessage?: string,
  ): Promise<void> {
    const session = findSession(userId, 'default');
    if (!session?.client) {
      throw new BadRequestException(
        'WhatsApp QR session is not connected. Please scan the QR code first.',
      );
    }

    const chatId = this.normalizeChatId(recipient);
    const introMessage = this.buildCatalogueIntroMessage(catalogue, customMessage);
    await session.client.sendMessage(chatId, introMessage);

    for (const product of products) {
      const productMessage = this.buildSingleProductMessage(product);
      await session.client.sendMessage(chatId, productMessage);

      if (product.imageUrl) {
        await this.sendImageViaQr(session, chatId, product);
      }
    }
  }

  private async sendImageViaQr(
    session: any,
    chatId: string,
    product: CatalogueProduct,
  ): Promise<void> {
    try {
      const { MessageMedia } = await import('whatsapp-web.js');
      const media = await MessageMedia.fromUrl(product.imageUrl!, {
        unsafeMime: true,
      });
      const caption = `🛍️ *${product.name}*\n${this.formatPrice(product.price, product.currency)}`;
      await session.client.sendMessage(chatId, media, { caption });
    } catch (err: any) {
      this.logger.warn(
        `[QR-IMAGE] Could not send image for product ${product.id}: ${err.message}`,
      );
    }
  }

  // ── Message builders ────────────────────────────────────────────────────────

  private buildProductMessages(
    products: CatalogueProduct[],
    customMessage?: string,
  ): string[] {
    const messages: string[] = [];

    if (customMessage) {
      messages.push(customMessage);
    }

    for (const product of products) {
      messages.push(this.buildSingleProductMessage(product));
    }

    return messages;
  }

  private buildSingleProductMessage(product: CatalogueProduct): string {
    const lines: string[] = [];

    lines.push(`🛍️ *${product.name}*`);

    if (product.description) {
      const shortDesc =
        product.description.length > 200
          ? product.description.substring(0, 197) + '...'
          : product.description;
      lines.push(`\n📝 ${shortDesc}`);
    }

    lines.push('');
    lines.push(this.formatPrice(product.price, product.currency));

    if (
      product.compareAtPrice &&
      product.compareAtPrice > product.price
    ) {
      const discount = Math.round(
        ((product.compareAtPrice - product.price) / product.compareAtPrice) * 100,
      );
      lines.push(`~~${this.formatPrice(product.compareAtPrice, product.currency)}~~ 🏷️ ${discount}% OFF`);
    }

    if (product.sku) {
      lines.push(`\n🔖 SKU: ${product.sku}`);
    }

    if (product.stockQuantity !== null && product.stockQuantity !== undefined) {
      if (product.stockQuantity === 0) {
        lines.push('❌ Out of Stock');
      } else if (product.stockQuantity <= 5) {
        lines.push(`⚠️ Only ${product.stockQuantity} left in stock!`);
      } else {
        lines.push('✅ In Stock');
      }
    }

    if (product.productUrl) {
      lines.push(`\n🔗 ${product.productUrl}`);
    }

    return lines.join('\n');
  }

  private buildCatalogueIntroMessage(
    catalogue: Catalogue,
    customMessage?: string,
  ): string {
    const lines: string[] = [];

    if (customMessage) {
      lines.push(customMessage);
      lines.push('');
    }

    lines.push(`📦 *${catalogue.name}*`);

    if (catalogue.description) {
      lines.push(catalogue.description);
    }

    lines.push('');
    lines.push('Here are our featured products:');

    return lines.join('\n');
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  private formatPrice(price: number, currency = 'USD'): string {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }).format(price);
    } catch {
      return `${currency} ${price.toFixed(2)}`;
    }
  }

  private normalizeChatId(phone: string): string {
    const digits = phone.replace(/[^0-9]/g, '');
    return `${digits}@c.us`;
  }
}
