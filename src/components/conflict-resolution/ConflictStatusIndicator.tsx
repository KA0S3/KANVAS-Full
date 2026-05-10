import React from 'react';
import { AlertTriangle, CheckCircle, Clock, X } from 'lucide-react';

interface ConflictStatusIndicatorProps {
  conflictCount: number;
  isResolving: boolean;
  lastResolutionTime?: Date;
  onResolveConflicts?: () => void;
  onDismiss?: () => void;
}

export const ConflictStatusIndicator: React.FC<ConflictStatusIndicatorProps> = ({
  conflictCount,
  isResolving,
  lastResolutionTime,
  onResolveConflicts,
  onDismiss
}) => {
  if (conflictCount === 0 && !isResolving) {
    // Show success state briefly after resolution
    if (lastResolutionTime && Date.now() - lastResolutionTime.getTime() < 3000) {
      return (
        <div className="flex items-center space-x-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-800">Conflicts resolved</span>
        </div>
      );
    }
    return null;
  }

  if (isResolving) {
    return (
      <div className="flex items-center space-x-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
        <Clock className="w-4 h-4 text-blue-600 animate-spin" />
        <span className="text-sm text-blue-800">Resolving conflicts...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
      <AlertTriangle className="w-4 h-4 text-yellow-600" />
      <span className="text-sm text-yellow-800">
        {conflictCount} conflict{conflictCount !== 1 ? 's' : ''} detected
      </span>
      {onResolveConflicts && (
        <button
          onClick={onResolveConflicts}
          className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded hover:bg-yellow-200 transition-colors"
        >
          Resolve
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-yellow-600 hover:text-yellow-800 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
