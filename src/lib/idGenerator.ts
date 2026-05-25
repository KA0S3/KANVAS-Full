/**
 * CENTRALIZED ID GENERATION SYSTEM
 * 
 * Generates consistent, readable IDs across the entire application.
 * All IDs follow the format: {prefix}_{userShortId}_{timestampBase36}_{randomChars}
 * 
 * Format breakdown:
 * - prefix: Entity type (usr, prj, ast, etc.)
 * - userShortId: First 6 chars of user ID (or 'guest' for unauthenticated)
 * - timestampBase36: Current timestamp in base36 (short, sortable)
 * - randomChars: 4 random characters for uniqueness
 * 
 * Example: prj_abc123_1k2m3n_x7k9p
 */

/**
 * Generate a short user identifier from a full user ID
 */
export function generateUserShortId(userId: string | null | undefined): string {
  if (!userId) return 'guest';
  
  // Take first 6 characters of the UUID, remove dashes
  const cleanId = userId.replace(/-/g, '');
  return cleanId.substring(0, 6);
}

/**
 * Convert timestamp to base36 for shorter, sortable representation
 */
export function timestampToBase36(timestamp: number = Date.now()): string {
  return timestamp.toString(36);
}

/**
 * Generate random characters for uniqueness
 */
export function generateRandomChars(length: number = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a project/book ID
 * Format: prj_{userShortId}_{timestampBase36}_{randomChars}
 */
export function generateProjectId(userId?: string): string {
  const userShortId = generateUserShortId(userId);
  const timestamp = timestampToBase36();
  const random = generateRandomChars(4);
  return `prj_${userShortId}_${timestamp}_${random}`;
}

/**
 * Generate an asset ID
 * Format: ast_{userShortId}_{timestampBase36}_{randomChars}
 */
export function generateAssetId(userId?: string): string {
  const userShortId = generateUserShortId(userId);
  const timestamp = timestampToBase36();
  const random = generateRandomChars(4);
  return `ast_${userShortId}_${timestamp}_${random}`;
}

/**
 * Generate a file ID
 * Format: fil_{userShortId}_{timestampBase36}_{randomChars}
 */
export function generateFileId(userId?: string): string {
  const userShortId = generateUserShortId(userId);
  const timestamp = timestampToBase36();
  const random = generateRandomChars(4);
  return `fil_${userShortId}_${timestamp}_${random}`;
}

/**
 * Parse an ID to extract its components
 */
export function parseId(id: string): {
  prefix: string;
  userShortId: string;
  timestamp: string;
  random: string;
} | null {
  const parts = id.split('_');
  if (parts.length !== 4) return null;
  
  return {
    prefix: parts[0],
    userShortId: parts[1],
    timestamp: parts[2],
    random: parts[3],
  };
}

/**
 * Validate if an ID follows the expected format
 */
export function isValidId(id: string): boolean {
  const parsed = parseId(id);
  if (!parsed) return false;
  
  // Check prefix is valid
  const validPrefixes = ['prj', 'ast', 'fil', 'usr'];
  if (!validPrefixes.includes(parsed.prefix)) return false;
  
  // Check userShortId is 6 characters
  if (parsed.userShortId.length !== 6) return false;
  
  // Check timestamp is valid base36
  if (!/^[a-z0-9]+$/i.test(parsed.timestamp)) return false;
  
  // Check random is 4 characters
  if (parsed.random.length !== 4) return false;
  
  return true;
}

/**
 * Extract user short ID from any generated ID
 */
export function extractUserShortId(id: string): string | null {
  const parsed = parseId(id);
  return parsed?.userShortId || null;
}
