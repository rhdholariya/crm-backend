import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsInt,
  IsPositive,
  IsEnum,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ShareChannel {
  META = 'meta',
  QR = 'qr',
}

export class ShareProductDto {
  /** Recipient phone number(s) in E.164 format, e.g. "919876543210" */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  recipients: string[];

  /** Product IDs to share */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  @Type(() => Number)
  productIds: number[];

  /** Optional custom message prepended before product details */
  @IsOptional()
  @IsString()
  customMessage?: string;

  /** Channel to use for sending: meta (official API) or qr (whatsapp-web.js) */
  @IsEnum(ShareChannel)
  channel: ShareChannel;
}

export class ShareCatalogueDto {
  /** Recipient phone number(s) */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  recipients: string[];

  /** Optional custom intro message */
  @IsOptional()
  @IsString()
  customMessage?: string;

  /** Channel to use */
  @IsEnum(ShareChannel)
  channel: ShareChannel;

  /** Max products to include in the share (default 5) */
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  maxProducts?: number;
}
