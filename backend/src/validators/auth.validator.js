import { z } from 'zod';

export const checkEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email address required'),
});

export const sendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email address required'),
  purpose: z.enum(['TEACHER_REGISTRATION', 'LOGIN_CODE_RECOVERY']).default('TEACHER_REGISTRATION'),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email address required'),
  otp: z.string().length(6, 'OTP must contain exactly 6 digits.').regex(/^\d+$/, 'OTP must contain only digits'),
  purpose: z.enum(['TEACHER_REGISTRATION', 'LOGIN_CODE_RECOVERY']).default('TEACHER_REGISTRATION'),
});

export const registerTeacherSchema = z.object({
  full_name: z.string().trim().min(1, 'full_name is required'),
  department: z.string().trim().min(1, 'department is required'),
  designation: z.string().trim().min(1, 'designation is required'),
  erp_id: z.string().trim().min(1, 'erp_id is required'),
  teaching_assignments: z.array(z.any()).optional().default([]),
});

export const loginWithCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email required'),
  code: z.string().trim().min(1, 'Login code is required'),
});

export const recoverySendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email required'),
});

export const recoveryVerifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email required'),
  otp: z.string().length(6, 'OTP must contain exactly 6 digits.').regex(/^\d+$/),
});

export const resetLoginCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email required'),
  recovery_token: z.string().trim().min(1, 'Recovery token is required'),
});
