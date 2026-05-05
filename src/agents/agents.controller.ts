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
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@UseGuards(JwtAuthGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  // POST /api/agents — create an agent under the current user
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAgentDto,
  ) {
    const agent = await this.agentsService.create(user.id, dto);
    return successResponse('Agent created successfully', agent);
  }

  // GET /api/agents — list all agents created by the current user
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const result = await this.agentsService.findAll(user.id, page, limit);
    return successResponse('Agents fetched successfully', result);
  }

  // GET /api/agents/:id — get a single agent
  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const agent = await this.agentsService.findOne(user.id, id);
    return successResponse('Agent fetched successfully', agent);
  }

  // PATCH /api/agents/:id — update an agent
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAgentDto,
  ) {
    const agent = await this.agentsService.update(user.id, id, dto);
    return successResponse('Agent updated successfully', agent);
  }

  // DELETE /api/agents/:id — delete an agent
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.agentsService.remove(user.id, id);
    return successResponse('Agent deleted successfully');
  }
}
