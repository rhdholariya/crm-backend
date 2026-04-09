import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PaymentSetting } from './entity/payment-settings.entity';
import { CreatePaymentSettingDto } from './dto/create-payment-setting.dto';
import { UpdatePaymentSettingDto } from './dto/update-payment-setting.dto';

@Injectable()
export class PaymentSettingsService {
  constructor(
    @InjectRepository(PaymentSetting)
    private readonly repo: Repository<PaymentSetting>,
    private readonly configService: ConfigService,
  ) {}

  private get webhookUrl(): string {
    return this.configService.get<string>('WEBHOOK_URL') ?? '';
  }

  async findAll(): Promise<{ key: string; value: string }[]> {
    const settings = await this.repo.find();
    return [...settings, { key: 'webhook', value: this.webhookUrl }];
  }

  async findOne(key: string): Promise<PaymentSetting> {
    const setting = await this.repo.findOne({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting "${key}" not found`);
    return setting;
  }

  async createBulk(
    dto: CreatePaymentSettingDto[],
  ): Promise<{ key: string; value: string }[]> {
    if (!dto || !Array.isArray(dto) || dto.length === 0) {
      throw new BadRequestException(
        'Body must be a non-empty array of { key, value }',
      );
    }

    const settings = this.repo.create(dto);
    const saved = await this.repo.save(settings);
    return [...saved, { key: 'webhook', value: this.webhookUrl }];
  }

  async updateBulk(dto: UpdatePaymentSettingDto[]): Promise<PaymentSetting[]> {
    const keys = dto.map((d) => d.key);

    const existing = await this.repo.find({
      where: keys.map((k) => ({ key: k })),
    });
    const foundKeys = existing.map((e) => e.key);
    const notFound = keys.filter((k) => !foundKeys.includes(k));

    if (notFound.length > 0) {
      throw new NotFoundException(`Keys not found: ${notFound.join(', ')}`);
    }

    const updated = existing.map((setting) => {
      const match = dto.find((d) => d.key === setting.key)!;
      setting.value = match.value;
      return setting;
    });

    return this.repo.save(updated);
  }

  async remove(key: string): Promise<{ message: string }> {
    const setting = await this.findOne(key);
    await this.repo.remove(setting);
    return { message: `Setting "${key}" deleted successfully` };
  }
}
