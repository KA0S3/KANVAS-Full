import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { documentMutationService } from '@/services/DocumentMutationService';
import type { Conflict, ConflictResolution, ConflictStrategy } from '@/services/ConflictResolver';

interface ConflictContextType {
  conflicts: Conflict[];
  isResolving: boolean;
  lastResolutionTime?: Date;
  showConflictDialog: boolean;
  detectConflicts: () => Promise<void>;
  resolveConflicts: (strategy: ConflictStrategy, conflicts: Conflict[]) => Promise<void>;
  dismissConflicts: () => void;
  openConflictDialog: () => void;
  closeConflictDialog: () => void;
}

const ConflictContext = createContext<ConflictContextType | undefined>(undefined);

interface ConflictResolutionProviderProps {
  children: ReactNode;
  documentService: typeof documentMutationService;
}

export const ConflictResolutionProvider: React.FC<ConflictResolutionProviderProps> = ({
  children,
  documentService
}) => {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [lastResolutionTime, setLastResolutionTime] = useState<Date>();
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  const detectConflicts = useCallback(async () => {
    try {
      // Get current document state and check for conflicts
      const currentProjectId = documentService.getCurrentProjectId();
      if (!currentProjectId) return;

      // This would integrate with the DocumentMutationService's conflict detection
      // For now, we'll simulate conflict detection
      const detectedConflicts: Conflict[] = [];
      
      // In a real implementation, this would call documentService.detectAndResolveConflicts()
      // and capture any conflicts that need user intervention
      
      setConflicts(detectedConflicts);
      
      if (detectedConflicts.length > 0) {
        setShowConflictDialog(true);
      }
    } catch (error) {
      console.error('Failed to detect conflicts:', error);
    }
  }, [documentService]);

  const resolveConflicts = useCallback(async (strategy: ConflictStrategy, conflictList: Conflict[]) => {
    setIsResolving(true);
    
    try {
      // Update the ConflictResolver strategy
      documentService.setConflictStrategy(strategy);
      
      // Trigger sync with conflict resolution
      const success = await documentService.syncNow();
      
      if (success) {
        setConflicts([]);
        setLastResolutionTime(new Date());
        setShowConflictDialog(false);
      } else {
        console.error('Failed to resolve conflicts during sync');
      }
    } catch (error) {
      console.error('Failed to resolve conflicts:', error);
    } finally {
      setIsResolving(false);
    }
  }, [documentService]);

  const dismissConflicts = useCallback(() => {
    setConflicts([]);
    setShowConflictDialog(false);
  }, []);

  const openConflictDialog = useCallback(() => {
    setShowConflictDialog(true);
  }, []);

  const closeConflictDialog = useCallback(() => {
    setShowConflictDialog(false);
  }, []);

  const value: ConflictContextType = {
    conflicts,
    isResolving,
    lastResolutionTime,
    showConflictDialog,
    detectConflicts,
    resolveConflicts,
    dismissConflicts,
    openConflictDialog,
    closeConflictDialog
  };

  return (
    <ConflictContext.Provider value={value}>
      {children}
    </ConflictContext.Provider>
  );
};

export const useConflictResolution = (): ConflictContextType => {
  const context = useContext(ConflictContext);
  if (context === undefined) {
    throw new Error('useConflictResolution must be used within a ConflictResolutionProvider');
  }
  return context;
};
