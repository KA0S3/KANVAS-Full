/**
 * Tag Assignment Validation System
 * Provides validation for tag assignments and tag operations
 */

import type { Tag } from '@/types/extendedAsset';

export class TagValidationError extends Error {
  constructor(field: string, value: unknown, expectedType: string) {
    super(`Invalid tag ${field}: expected ${expectedType}, got ${typeof value} (${value})`);
    this.name = 'TagValidationError';
  }
}

/**
 * Validates tag ID format
 */
export function validateTagId(id: unknown): string {
  if (typeof id !== 'string') {
    throw new TagValidationError('id', id, 'string');
  }
  
  if (id.length === 0 || id.length > 50) {
    throw new TagValidationError('id', id, 'string with length 1-50');
  }
  
  // Allow alphanumeric characters, hyphens, and underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new TagValidationError('id', id, 'alphanumeric string with hyphens and underscores');
  }
  
  return id;
}

/**
 * Validates tag name
 */
export function validateTagName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new TagValidationError('name', name, 'string');
  }
  
  const trimmedName = name.trim();
  
  if (trimmedName.length === 0 || trimmedName.length > 100) {
    throw new TagValidationError('name', name, 'string with length 1-100 after trimming');
  }
  
  // Prevent control characters and other problematic characters
  if (/[\x00-\x1F\x7F]/.test(trimmedName)) {
    throw new TagValidationError('name', name, 'string without control characters');
  }
  
  return trimmedName;
}

/**
 * Validates tag color format
 */
export function validateTagColor(color: unknown): string {
  if (typeof color !== 'string') {
    throw new TagValidationError('color', color, 'string');
  }
  
  // Support hex colors (3, 6, or 8 digits)
  if (!/^#([0-9A-Fa-f]{3}){1,2}$|^#([0-9A-Fa-f]{8})$/.test(color)) {
    throw new TagValidationError('color', color, 'hex color (e.g., #FF0000 or #FF0000FF)');
  }
  
  return color.toUpperCase();
}

/**
 * Validates a complete tag object
 */
export function validateTag(tag: unknown): Tag {
  if (typeof tag !== 'object' || tag === null) {
    throw new TagValidationError('tag', tag, 'object');
  }
  
  const tagObj = tag as Record<string, unknown>;
  
  return {
    id: validateTagId(tagObj.id),
    name: validateTagName(tagObj.name),
    color: validateTagColor(tagObj.color)
  };
}

/**
 * Validates tag assignment (array of tag IDs)
 */
export function validateTagAssignment(tagIds: unknown): string[] {
  if (!Array.isArray(tagIds)) {
    throw new TagValidationError('tag assignment', tagIds, 'array of tag IDs');
  }
  
  // Remove duplicates and validate each tag ID
  const uniqueTagIds = [...new Set(tagIds)];
  
  if (uniqueTagIds.length > 20) {
    throw new TagValidationError('tag assignment', tagIds, 'array with maximum 20 unique tags');
  }
  
  return uniqueTagIds.map((tagId, index) => {
    try {
      return validateTagId(tagId);
    } catch (error) {
      throw new TagValidationError(`tag assignment[${index}]`, tagId, 'valid tag ID');
    }
  });
}

/**
 * Validates tag-color relationship consistency
 */
export function validateTagColorConsistency(tags: Tag[], assignedTagIds: string[]): void {
  const tagMap = new Map<string, Tag>();
  
  // Build tag lookup map
  tags.forEach(tag => {
    try {
      const validatedTag = validateTag(tag);
      tagMap.set(validatedTag.id, validatedTag);
    } catch (error) {
      throw new TagValidationError('tag collection', tag, 'valid tag object');
    }
  });
  
  // Validate each assigned tag ID exists and has consistent color
  assignedTagIds.forEach(tagId => {
    const tag = tagMap.get(tagId);
    if (!tag) {
      throw new TagValidationError('tag assignment', tagId, 'existing tag ID');
    }
    
    // Additional validation for tag-color relationships if needed
    if (!tag.color.startsWith('#')) {
      throw new TagValidationError('tag color', tag.color, 'hex color format');
    }
  });
}

/**
 * Safe tag validation that returns result instead of throwing
 */
export function safeValidateTag(tag: unknown): { isValid: boolean; tag?: Tag; errors: string[] } {
  try {
    const validatedTag = validateTag(tag);
    return { isValid: true, tag: validatedTag, errors: [] };
  } catch (error) {
    if (error instanceof TagValidationError) {
      return { isValid: false, errors: [error.message] };
    }
    return { isValid: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Safe tag assignment validation
 */
export function safeValidateTagAssignment(tagIds: unknown): { isValid: boolean; tagIds?: string[]; errors: string[] } {
  try {
    const validatedTagIds = validateTagAssignment(tagIds);
    return { isValid: true, tagIds: validatedTagIds, errors: [] };
  } catch (error) {
    if (error instanceof TagValidationError) {
      return { isValid: false, errors: [error.message] };
    }
    return { isValid: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Validates tag creation constraints
 */
export function validateTagCreation(tag: Partial<Tag>, existingTags: Tag[]): void {
  // Check for duplicate names
  const tagName = tag.name;
  if (tagName) {
    const existingTag = existingTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    if (existingTag) {
      throw new TagValidationError('tag name', tagName, 'unique tag name');
    }
  }
  
  // Check for duplicate IDs
  const tagId = tag.id;
  if (tagId) {
    const existingTag = existingTags.find(t => t.id === tagId);
    if (existingTag) {
      throw new TagValidationError('tag ID', tagId, 'unique tag ID');
    }
  }
}

/**
 * Validates tag update constraints
 */
export function validateTagUpdate(tagId: string, updates: Partial<Tag>, existingTags: Tag[]): void {
  // Check if tag exists
  const existingTag = existingTags.find(t => t.id === tagId);
  if (!existingTag) {
    throw new TagValidationError('tag ID', tagId, 'existing tag ID');
  }
  
  // Check for name conflicts (excluding current tag)
  if (updates.name) {
    const conflictingTag = existingTags.find(t => 
      t.id !== tagId && t.name.toLowerCase() === updates.name!.toLowerCase()
    );
    if (conflictingTag) {
      throw new TagValidationError('tag name', updates.name, 'unique tag name');
    }
  }
}

/**
 * Validates tag deletion constraints
 */
export function validateTagDeletion(tagId: string, tagsInUse: Record<string, number>): void {
  // Check if tag is being used by any assets
  const usageCount = tagsInUse[tagId] || 0;
  if (usageCount > 0) {
    throw new TagValidationError('tag deletion', tagId, `tag not in use (currently used by ${usageCount} assets)`);
  }
}
