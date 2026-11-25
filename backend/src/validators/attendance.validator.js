import { z } from 'zod';

export const createSessionSchema = z.object({
  class_id: z.number().int().positive('class_id is required'),
  division_id: z.number().int().positive('division_id is required'),
  subject_id: z.number().int().positive('subject_id is required'),
});
