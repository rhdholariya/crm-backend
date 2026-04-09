import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentSettingsService } from './payment-settings.service';
import { CreatePaymentSettingDto } from './dto/create-payment-setting.dto';
import { UpdatePaymentSettingDto } from './dto/update-payment-setting.dto';

@Controller('payment-settings')
export class PaymentSettingsController {
  constructor(private readonly service: PaymentSettingsService) {}

  // GET /api/payment-settings
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // GET /api/payment-settings/:key
  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.service.findOne(key);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePaymentSettingDto[]) {
    return this.service.createBulk(dto);
  }

  @Put()
  updateBulk(@Body() dto: UpdatePaymentSettingDto[]) {
    return this.service.updateBulk(dto);
  }

  // DELETE /api/payment-settings/:key
  @Delete(':key')
  @HttpCode(HttpStatus.OK)
  remove(@Param('key') key: string) {
    return this.service.remove(key);
  }
}
