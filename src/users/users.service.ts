import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UpdateProfileDto } from '../auth/dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.repo.findOneBy({ email: dto.email });
    if (existing) throw new ConflictException('Email already in use');
    const hashed = await bcrypt.hash(dto.password, 10);
    const user = this.repo.create({ ...dto, password: hashed });
    return this.repo.save(user);
  }

  async findAll(page = 1, limit = 10) {
    const [data, total] = await this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.roleId != :roleId', { roleId: 1 })
      .orderBy('user.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { total, page, limit, totalPages: Math.ceil(total / limit), data };
  }

  async findOne(id: number) {
    const user = await this.repo.findOne({
      where: { id },
      relations: ['role'],
    });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  async findOneWithPassword(id: number) {
    const user = await this.repo.findOne({
      where: { id },
      select: ['id', 'email', 'password', 'roleId', 'isActive'],
    });

    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  findByEmail(email: string) {
    return this.repo.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'password',
        'roleId',
        'isActive',
        'otpVerifiedAt',
      ],
    });
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.findOne(id);
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    return this.repo.remove(user);
  }

  async generatePasswordResetToken(email: string) {
    const user = await this.repo.findOneBy({ email });
    if (!user) throw new NotFoundException('User not found');

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await this.repo.update(user.id, {
      resetToken,
      resetTokenExpiry,
    });

    return resetToken;
  }

  async resetPassword(resetToken: string, newPassword: string) {
    const user = await this.repo.findOne({
      where: { resetToken },
      select: ['id', 'resetTokenExpiry'],
    });

    if (!user) throw new NotFoundException('Invalid reset token');

    if (new Date() > user.resetTokenExpiry) {
      throw new NotFoundException('Reset token expired');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.repo.update(user.id, {
      password: hashed,
      resetToken: '',
      resetTokenExpiry: new Date(0),
    });

    return { message: 'Password reset successfully' };
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const user = await this.repo.findOneBy({ id: userId });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.repo.update(userId, dto);

    return this.findOne(userId);
  }

  async updatePassword(userId: number, password: string) {
    await this.repo.update(userId, { password });
  }

  async updateStripeCustomerId(
    userId: number,
    stripeCustomerId: string,
  ): Promise<void> {
    await this.repo.update(userId, { stripeCustomerId });
  }

  async updateSubscriptionStatus(
    userId: number,
    activePlanId: number | null,
  ): Promise<void> {
    await this.repo.update(userId, { activePlanId });
  }

  async findByStripeCustomerId(stripeCustomerId: string) {
    return this.repo.findOne({ where: { stripeCustomerId } });
  }
}
