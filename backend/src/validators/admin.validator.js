import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const addApprovedEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email address required'),
});

export const addAssignmentSchema = z.object({
  class_id: z.number().int().positive('class_id is required'),
  division_id: z.number().int().positive('division_id is required'),
  subject_id: z.number().int().positive('subject_id is required'),
});
