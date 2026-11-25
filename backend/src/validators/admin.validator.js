import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.string().email('Email is required').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const addApprovedEmailSchema = z.object({
  email: z.string().email('Valid email address required').trim().toLowerCase(),
});

export const addAssignmentSchema = z.object({
  class_id: z.number().int().positive('class_id is required'),
  division_id: z.number().int().positive('division_id is required'),
  subject_id: z.number().int().positive('subject_id is required'),
});
