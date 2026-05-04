/**
 * Centralized validation schemas using Zod
 * Provides consistent validation across the application
 */

import * as z from 'zod';

// Email validation schema
export const emailSchema = z.string().email('Please enter a valid email address');

// Text field validation schemas
export const titleSchema = z.string()
  .min(1, 'Title is required')
  .max(250, 'Title must be 250 characters or less');

export const subtitleSchema = z.string()
  .max(500, 'Subtitle must be 500 characters or less')
  .optional();

export const assetNameSchema = z.string()
  .min(1, 'Asset name is required')
  .max(250, 'Asset name must be 250 characters or less');

export const descriptionSchema = z.string().optional(); // No limit as requested

// Image validation schema - accepts all image formats
export const imageFileSchema = z.instanceof(File, { message: 'Please select a file' })
  .refine(
    (file) => file.type.startsWith('image/'),
    { message: 'File must be an image (any format accepted)' }
  );

// Asset validation schema
export const assetSchema = z.object({
  name: assetNameSchema,
  description: descriptionSchema,
  type: z.enum(['image', 'document', 'video', 'audio', 'code', 'other', 'card', 'text', 'container', 'viewport', 'tag']),
  x: z.number(),
  y: z.number(),
  width: z.number().min(1),
  height: z.number().min(1),
  tags: z.array(z.string()).optional(),
  thumbnail: z.string().optional(),
  background: z.string().optional(),
  content: z.string().optional(),
  customFields: z.array(z.any()).optional(),
  customFieldValues: z.array(z.any()).optional()
});

// User registration/login schema
export const userAuthSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, 'Password must be at least 6 characters')
});

// Password reset schema
export const passwordResetSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Export types for use in components
export type AssetFormData = z.infer<typeof assetSchema>;
export type UserAuthData = z.infer<typeof userAuthSchema>;
export type PasswordResetData = z.infer<typeof passwordResetSchema>;
