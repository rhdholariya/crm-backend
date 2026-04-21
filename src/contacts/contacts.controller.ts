import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateContactDto) {
    const contact = await this.contactsService.create(user.id, dto);
    return successResponse('Contact created successfully', contact);
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('tagIds') tagIds?: string,
  ) {
    const parsedTagIds = tagIds
      ? tagIds.split(',').map((id) => Number(id))
      : [];

    const result = await this.contactsService.findAll(
      user.id,
      Number(page),
      Number(limit),
      search,
      parsedTagIds,
    );

    return successResponse('Contacts fetched successfully', result);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const contact = await this.contactsService.findOne(user.id, id);
    return successResponse('Contact fetched successfully', contact);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContactDto,
  ) {
    const contact = await this.contactsService.update(user.id, id, dto);
    return successResponse('Contact updated successfully', contact);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.contactsService.remove(user.id, id);
    return successResponse(result.message);
  }
}
