import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { resetPasswordTemplate } from '../templates';
import { otpTemplate } from '../templates/auth/otp.template';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || '127.0.0.1',
      port: parseInt(process.env.MAIL_PORT || '1025'),
      secure: false,
      // secure: process.env.MAIL_SECURE === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
    });
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    resetUrl: string,
  ) {
    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: email,
      subject: 'Password Reset Request',
      html: resetPasswordTemplate(resetUrl, resetToken),
      // html: `
      //   <h2>Password Reset Request</h2>
      //   <p>You requested a password reset. Click the link below to reset your password:</p>
      //   <a href="${resetUrl}?token=${resetToken}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
      //     Reset Password
      //   </a>
      //   <p>This link expires in 1 hour.</p>
      //   <p>If you didn't request this, ignore this email.</p>
      // `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  async sendOtpEmail(email: string, otp: string) {
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM || 'noreply@example.com',
      to: email,
      subject: 'OTP Verification',
      html: otpTemplate(otp),
    });
  }
}
