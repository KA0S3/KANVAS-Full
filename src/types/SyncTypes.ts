/**
 * RUNTIME SYNC STATE TYPES
 * 
 * These types define the runtime sync state that MUST be kept separate
 * from canonical asset data. This follows the strict zone separation
 * principles defined in the architecture plan.
 * 
 * 🔒 CRITICAL: These types are NEVER to be mixed with canonical Asset data
 */

// Runtime sync state (Memory + IndexedDB syncQueue ONLY)
export interface RuntimeSyncState {
  assetId: string;
  operation: 'create' | 'update' | 'delete';
  status: 'dirty' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  lastAttempt?: string;
  error?: string;
  createdAt: string;
  processedAt?: string;
}

// UI state (Zustand UI store ONLY - never persisted)
export interface UIState {
  selectedAssets: Set<string>;
  hoveredAsset: string | null;
  dragState: any;
  viewport: { x: number; y: number; zoom: number };
}

// Sync queue entry (IndexedDB syncQueue table ONLY)
export interface SyncQueueEntry extends RuntimeSyncState {
  id: string;
  projectId: string;
  assetData?: any; // Full asset snapshot for updates
}

// Sync store state (Memory only)
export interface SyncStoreState {
  syncQueue: Map<string, RuntimeSyncState>;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncAt?: string;
  errorCount: number;
}

// Background sync processor state
export interface SyncProcessorState {
  isProcessing: boolean;
  currentBatch: string[];
  processedCount: number;
  failedCount: number;
  lastProcessedAt?: string;
}

// File upload state (separate from assets)
export interface FileUploadState {
  fileId: string;
  assetId: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  error?: string;
  localUrl?: string; // Temporary blob URL
  cloudUrl?: string; // Final R2 URL
}

// Type guards for sync state
export function isRuntimeSyncState(obj: any): obj is RuntimeSyncState {
  return obj && 
    typeof obj.assetId === 'string' &&
    ['create', 'update', 'delete'].includes(obj.operation) &&
    ['dirty', 'syncing', 'synced', 'failed'].includes(obj.status) &&
    typeof obj.retryCount === 'number' &&
    typeof obj.createdAt === 'string';
}

export function isSyncQueueEntry(obj: any): obj is SyncQueueEntry {
  return obj &&
    typeof obj.assetId === 'string' &&
    ['create', 'update', 'delete'].includes(obj.operation) &&
    ['dirty', 'syncing', 'synced', 'failed'].includes(obj.status) &&
    typeof obj.retryCount === 'number' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.id === 'string' &&
    typeof obj.projectId === 'string';
}

export function isFileUploadState(obj: any): obj is FileUploadState {
  return obj &&
    typeof obj.fileId === 'string' &&
    typeof obj.assetId === 'string' &&
    ['pending', 'uploading', 'completed', 'failed'].includes(obj.status) &&
    typeof obj.progress === 'number';
}

// Helper functions for creating sync state
export function createRuntimeSyncState(
  assetId: string,
  operation: 'create' | 'update' | 'delete'
): RuntimeSyncState {
  return {
    assetId,
    operation,
    status: 'dirty',
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };
}

export function createSyncQueueEntry(
  projectId: string,
  assetId: string,
  operation: 'create' | 'update' | 'delete',
  assetData?: any
): SyncQueueEntry {
  return {
    ...createRuntimeSyncState(assetId, operation),
    id: crypto.randomUUID(),
    projectId,
    assetData,
  };
}

export function createFileUploadState(
  fileId: string,
  assetId: string
): FileUploadState {
  return {
    fileId,
    assetId,
    status: 'pending',
    progress: 0,
  };
}

// Validation functions to ensure state separation
export function validateSyncStateSeparation(
  asset: any,
  syncState: any
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check that asset doesn't contain sync state
  const syncFields = ['status', 'retryCount', 'lastAttempt', 'error', 'sync_status'];
  for (const field of syncFields) {
    if (field in asset) {
      violations.push(`Asset contains sync field '${field}'`);
    }
  }

  // Check that sync state doesn't contain asset data (except assetData field)
  if (syncState && typeof syncState === 'object') {
    const assetFields = ['layout', 'content', 'style', 'behavior', 'metadata'];
    for (const field of assetFields) {
      if (field in syncState && field !== 'assetData') {
        violations.push(`Sync state contains asset field '${field}'`);
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
