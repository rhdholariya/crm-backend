import { baseTemplate } from '../layouts/base.template';

export const otpTemplate = (otp: string) => {
  const content = `
    <p>Your OTP is:</p>

    <h1 style="text-align:center; letter-spacing:5px;">
      ${otp}
    </h1>

    <p>This OTP is valid for 10 minutes.</p>
  `;

  return baseTemplate('OTP Verification', content);
};
