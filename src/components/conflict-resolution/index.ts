// Conflict Resolution Components
// Phase 8: Conflict Resolution & Error Handling

export { ConflictResolutionProvider } from './ConflictResolutionProvider';
export { ConflictStatusIndicator } from './ConflictStatusIndicator';
export { ConflictResolutionDialog } from './ConflictResolutionDialog';
export { useConflictResolution } from './ConflictResolutionProvider';

// Re-export types
export type { 
  Conflict, 
  ConflictResolution, 
  ConflictStrategy,
  ConflictResolverOptions 
} from '@/services/ConflictResolver';

export { 
  ConflictResolver, 
  conflictResolver 
} from '@/services/ConflictResolver';
