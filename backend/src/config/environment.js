import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'institution-attendance-jwt-secret-key-32bytes-long',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '2h',
  OTP_HMAC_SECRET: process.env.OTP_HMAC_SECRET || 'institution-attendance-hmac-secret-key-32bytes-long',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'QR Attendance System <onboarding@resend.dev>',
  GMAIL_ADDRESS: process.env.GMAIL_ADDRESS || '',
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD || '',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
};
