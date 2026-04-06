import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly repo: Repository<Role>,
  ) {}

  create(dto: CreateRoleDto) {
    return this.repo.save(this.repo.create(dto));
  }

  findAll() {
    return this.repo.find();
  }

  async findOne(id: number) {
    const role = await this.repo.findOneBy({ id });
    if (!role) throw new NotFoundException(`Role #${id} not found`);
    return role;
  }

  findByName(name: string) {
    return this.repo.findOneBy({ name });
  }

  async remove(id: number) {
    const role = await this.findOne(id);
    return this.repo.remove(role);
  }
}
