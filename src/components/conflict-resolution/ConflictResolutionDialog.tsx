import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import type { Conflict, ConflictResolution, ConflictStrategy } from '@/services/ConflictResolver';

interface ConflictResolutionDialogProps {
  conflicts: Conflict[];
  onResolve: (strategy: ConflictStrategy, conflicts: Conflict[]) => void;
  onCancel: () => void;
  isOpen: boolean;
}

export const ConflictResolutionDialog: React.FC<ConflictResolutionDialogProps> = ({
  conflicts,
  onResolve,
  onCancel,
  isOpen
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<ConflictStrategy>('server-wins');
  const [expandedConflicts, setExpandedConflicts] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const toggleConflictExpansion = (conflictId: string) => {
    const newExpanded = new Set(expandedConflicts);
    if (newExpanded.has(conflictId)) {
      newExpanded.delete(conflictId);
    } else {
      newExpanded.add(conflictId);
    }
    setExpandedConflicts(newExpanded);
  };

  const getConflictIcon = (conflict: Conflict) => {
    switch (conflict.operation.op) {
      case 'DELETE_ASSET':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'UPDATE_POSITION':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'UPDATE_METADATA':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getConflictDescription = (conflict: Conflict) => {
    const { operation } = conflict;
    const assetId = getOperationAssetId(operation) || 'unknown';
    
    switch (operation.op) {
      case 'DELETE_ASSET':
        return `Asset "${assetId}" was deleted locally but modified on server`;
      case 'UPDATE_POSITION':
        return `Asset "${assetId}" position was changed both locally and on server`;
      case 'UPDATE_METADATA':
        return `Asset "${assetId}" metadata was changed both locally and on server`;
      case 'CREATE_ASSET':
        return `Asset "${assetId}" creation conflicts with server state`;
      default:
        return `Conflict detected for asset "${assetId}"`;
    }
  };

  // Helper function to safely extract asset ID from operation
  const getOperationAssetId = (operation: any): string | null => {
    switch (operation.op) {
      case 'CREATE_ASSET':
      case 'DELETE_ASSET':
      case 'MOVE_ASSET':
      case 'UPDATE_POSITION':
      case 'UPDATE_METADATA':
      case 'UPDATE_BACKGROUND_CONFIG':
      case 'UPDATE_ASSET_BACKGROUND':
      case 'UPDATE_CUSTOM_FIELDS':
      case 'UPDATE_ASSET_TAGS':
        return operation.assetId || null;
      case 'UPDATE_VIEWPORT':
        return operation.currentAssetId || null;
      default:
        return null;
    }
  };

  const strategies: { value: ConflictStrategy; label: string; description: string }[] = [
    {
      value: 'server-wins',
      label: 'Server Wins',
      description: 'Keep server version and discard local changes'
    },
    {
      value: 'client-wins',
      label: 'Local Wins',
      description: 'Keep local changes and overwrite server version'
    },
    {
      value: 'merge',
      label: 'Auto-Merge',
      description: 'Automatically merge non-conflicting changes'
    },
    {
      value: 'manual',
      label: 'Manual Review',
      description: 'Review each conflict individually'
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Sync Conflicts Detected
              </h2>
              <p className="text-sm text-gray-600">
                {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} need resolution
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[50vh]">
          {/* Strategy Selection */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Resolution Strategy</h3>
            <div className="space-y-2">
              {strategies.map((strategy) => (
                <label
                  key={strategy.value}
                  className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="radio"
                    name="strategy"
                    value={strategy.value}
                    checked={selectedStrategy === strategy.value}
                    onChange={(e) => setSelectedStrategy(e.target.value as ConflictStrategy)}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-gray-900">{strategy.label}</div>
                    <div className="text-sm text-gray-600">{strategy.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Conflict List */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Conflicts</h3>
            <div className="space-y-2">
              {conflicts.map((conflict, index) => {
                const assetId = getOperationAssetId(conflict.operation);
                const conflictId = `${conflict.operation.op}-${assetId || index}`;
                const isExpanded = expandedConflicts.has(conflictId);
                
                return (
                  <div
                    key={conflictId}
                    className="border rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleConflictExpansion(conflictId)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        {getConflictIcon(conflict)}
                        <span className="text-sm font-medium text-gray-900">
                          {getConflictDescription(conflict)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {conflict.field && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            {conflict.field}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {isExpanded ? 'Hide' : 'Show'} details
                        </span>
                      </div>
                    </button>
                    
                    {isExpanded && (
                      <div className="px-4 py-3 bg-gray-50 border-t">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="font-medium text-gray-700 mb-1">Local Changes</div>
                            <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-32">
                              {JSON.stringify(conflict.clientState, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="font-medium text-gray-700 mb-1">Server State</div>
                            <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-32">
                              {JSON.stringify(conflict.serverState, null, 2)}
                            </pre>
                          </div>
                        </div>
                        {conflict.reason && (
                          <div className="mt-3 text-xs text-gray-600 bg-yellow-50 p-2 rounded">
                            <strong>Reason:</strong> {conflict.reason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel Sync
          </button>
          <button
            onClick={() => onResolve(selectedStrategy, conflicts)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Resolve Conflicts</span>
          </button>
        </div>
      </div>
    </div>
  );
};
