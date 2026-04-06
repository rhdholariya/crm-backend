import { baseTemplate } from '../layouts/base.template';

export const resetPasswordTemplate = (url: string, token: string) => {
  const content = `
    <p>You requested a password reset.</p>

    <div style="text-align:center; margin:20px 0;">
      <a href="${url}?token=${token}" 
         style="background:#2563eb; color:#fff; padding:10px 20px; border-radius:5px;">
        Reset Password
      </a>
    </div>

    <p>This link expires in 1 hour.</p>
  `;

  return baseTemplate('Password Reset', content);
};
