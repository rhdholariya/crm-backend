import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RolesService } from '../roles/roles.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly rolesService: RolesService,
  ) {}

  async create(createdByUserId: number, dto: CreateAgentDto): Promise<User> {
    const agentRole = await this.rolesService.findByName('Agent');
    if (!agentRole) {
      throw new BadRequestException(
        'Agent role not found. Please run the database seed first.',
      );
    }

    const existing = await this.userRepo.findOneBy({ email: dto.email });
    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    const agent = this.userRepo.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phoneNumber: dto.phoneNumber ?? undefined,
      password: hashed,
      roleId: agentRole.id,
      createdBy: createdByUserId,
      isActive: dto.isActive,
      otpVerifiedAt: new Date(),
    });

    const saved = await this.userRepo.save(agent);
    return saved;
  }

  async findAll(
    createdByUserId: number,
    page = 1,
    limit = 10,
  ): Promise<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    data: User[];
  }> {
    const agentRole = await this.rolesService.findByName('Agent');
    if (!agentRole) return { total: 0, page, limit, totalPages: 0, data: [] };

    const [data, total] = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.created_by = :createdByUserId', { createdByUserId })
      .andWhere('user.roleId = :roleId', { roleId: agentRole.id })
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
    };
  }

  async findOne(createdByUserId: number, agentId: number): Promise<User> {
    const agentRole = await this.rolesService.findByName('Agent');

    const agent = await this.userRepo.findOne({
      where: { id: agentId, roleId: agentRole?.id },
      relations: ['role'],
    });

    if (!agent) {
      throw new NotFoundException(`Agent #${agentId} not found`);
    }

    if (agent.createdBy !== createdByUserId) {
      throw new ForbiddenException('You do not have access to this agent');
    }

    return agent;
  }

  async update(
    createdByUserId: number,
    agentId: number,
    dto: UpdateAgentDto,
  ): Promise<User> {
    const agent = await this.findOne(createdByUserId, agentId);

    if (dto.email && dto.email !== agent.email) {
      const existing = await this.userRepo.findOneBy({ email: dto.email });
      if (existing) {
        throw new BadRequestException('Email already in use');
      }
    }

    Object.assign(agent, dto);
    return this.userRepo.save(agent);
  }

  async remove(createdByUserId: number, agentId: number): Promise<void> {
    const agent = await this.findOne(createdByUserId, agentId);
    await this.userRepo.remove(agent);
  }
}
