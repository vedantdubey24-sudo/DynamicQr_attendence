import { z } from 'zod';

export const checkEmailSchema = z.object({
  email: z.string().email('Valid email address required').trim().toLowerCase(),
});

export const sendOtpSchema = z.object({
  email: z.string().email('Valid email address required').trim().toLowerCase(),
  purpose: z.enum(['TEACHER_REGISTRATION', 'LOGIN_CODE_RECOVERY']).default('TEACHER_REGISTRATION'),
});

export const verifyOtpSchema = z.object({
  email: z.string().email('Valid email address required').trim().toLowerCase(),
  otp: z.string().length(6, 'OTP must contain exactly 6 digits.').regex(/^\d+$/, 'OTP must contain only digits'),
  purpose: z.enum(['TEACHER_REGISTRATION', 'LOGIN_CODE_RECOVERY']).default('TEACHER_REGISTRATION'),
});

export const registerTeacherSchema = z.object({
  full_name: z.string().min(1, 'full_name is required').trim(),
  department: z.string().min(1, 'department is required').trim(),
  designation: z.string().min(1, 'designation is required').trim(),
  erp_id: z.string().min(1, 'erp_id is required').trim(),
  teaching_assignments: z.array(z.any()).optional().default([]),
});

export const loginWithCodeSchema = z.object({
  email: z.string().email('Valid email required').trim().toLowerCase(),
  code: z.string().min(1, 'Login code is required').trim(),
});

export const recoverySendOtpSchema = z.object({
  email: z.string().email('Valid email required').trim().toLowerCase(),
});

export const recoveryVerifyOtpSchema = z.object({
  email: z.string().email('Valid email required').trim().toLowerCase(),
  otp: z.string().length(6, 'OTP must contain exactly 6 digits.').regex(/^\d+$/),
});

export const resetLoginCodeSchema = z.object({
  email: z.string().email('Valid email required').trim().toLowerCase(),
  recovery_token: z.string().min(1, 'Recovery token is required').trim(),
});
