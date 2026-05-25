import { v4 as uuidv4 } from 'uuid';
import { generateAssetId } from '@/lib/idGenerator';

// Legacy function - now delegates to proper ID generation
// This maintains backward compatibility while ensuring correct format
export function createId(): string {
  // Use proper formatted asset ID instead of raw UUID
  return generateAssetId();
}
