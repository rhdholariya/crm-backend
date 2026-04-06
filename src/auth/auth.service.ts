import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RolesService } from '../roles/roles.service';
import { MailService } from '../common/services/mail.service';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthUser } from './entities/auth-user.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  private otpStore = new Map<string, { otp: string; expires: number }>();
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<AuthUser | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return null;
    return { id: user.id, email: user.email, roleId: user.roleId };
  }

  login(user: AuthUser) {
    const payload = { sub: user.id, email: user.email, roleId: user.roleId };
    return { access_token: this.jwtService.sign(payload), user };
  }

  async register(dto: RegisterDto) {
    const userRole = await this.rolesService.findByName('User');
    if (!userRole) throw new BadRequestException('User role not found');

    const user = await this.usersService.create({
      ...dto,
      roleId: userRole.id,
    });

    const payload = { sub: user.id, email: user.email, roleId: user.roleId };
    return { access_token: this.jwtService.sign(payload), user };
  }

  async me(userId: number) {
    return this.usersService.findOne(userId);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const resetToken = await this.usersService.generatePasswordResetToken(
      dto.email,
    );
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password`;

    const sent = await this.mailService.sendPasswordResetEmail(
      dto.email,
      resetToken,
      resetUrl,
    );

    if (!sent) throw new BadRequestException('Failed to send reset email');

    return { message: 'Password reset email sent successfully' };
  }

  async sendOtp(email: string) {
    const otp = this.generateOtp();

    this.otpStore.set(email, {
      otp,
      expires: Date.now() + 10 * 60 * 1000,
    });

    await this.mailService.sendOtpEmail(email, otp);

    return { message: 'OTP sent successfully' };
  }

  verifyOtp(email: string, otp: string) {
    const record = this.otpStore.get(email);

    if (!record) {
      throw new BadRequestException('OTP not found');
    }

    if (record.expires < Date.now()) {
      this.otpStore.delete(email);
      throw new BadRequestException('OTP expired');
    }

    if (record.otp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    this.otpStore.delete(email);

    return { message: 'OTP verified successfully' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    return this.usersService.resetPassword(dto.resetToken, dto.newPassword);
  }
}
