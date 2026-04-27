import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@UseGuards(JwtAuthGuard)
@Controller('currencies')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  // POST /api/currencies — admin only
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCurrencyDto) {
    const currency = await this.currencyService.create(user.roleId, dto);
    return successResponse('Currency created successfully', currency);
  }

  // GET /api/currencies?page=1&limit=10 — all users
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const result = await this.currencyService.findAll(user.roleId, page, limit);
    return successResponse('Currencies fetched successfully', result);
  }

  // GET /api/currencies/:id — all users
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const currency = await this.currencyService.findOne(id);
    return successResponse('Currency fetched successfully', currency);
  }

  // PATCH /api/currencies/:id — admin only
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCurrencyDto,
  ) {
    const currency = await this.currencyService.update(user.roleId, id, dto);
    return successResponse('Currency updated successfully', currency);
  }

  // DELETE /api/currencies/:id — admin only
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.currencyService.remove(user.roleId, id);
    return successResponse(result.message);
  }
}
