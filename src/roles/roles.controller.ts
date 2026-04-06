import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { successResponse } from '../common/utils/response.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  async create(@Body() dto: CreateRoleDto) {
    const role = await this.rolesService.create(dto);
    return successResponse('Role created successfully', role);
  }

  @Get()
  async findAll() {
    const roles = await this.rolesService.findAll();
    return successResponse('Roles fetched successfully', roles);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const role = await this.rolesService.findOne(+id);
    return successResponse('Role fetched successfully', role);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.rolesService.remove(+id);
    return successResponse('Role deleted successfully');
  }
}
