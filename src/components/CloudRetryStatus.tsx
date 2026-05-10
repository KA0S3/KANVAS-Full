import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw, X, ChevronDown, ChevronUp, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { documentMutationService } from '@/services/DocumentMutationService';
import { unifiedUploadService } from '@/services/UnifiedUploadService';
import { useAssetStore } from '@/stores/assetStore';
import type { Asset } from '@/types/assetInterfaces';

interface FailedUpload {
  assetId: string;
  name: string;
  cloudStatus: string;
  cloudError: string | null;
}

interface CloudRetryStatusProps {
  compact?: boolean;
  projectId?: string;
}

/**
 * CloudRetryStatus - Small, discreet component for managing failed cloud uploads
 * 
 * Shows:
 * - Failed upload count badge
 * - Expandable list of failed uploads
 * - Manual retry button per item
 * - Retry all option
 * 
 * Designed to be integrated into existing sync UI or shown standalone
 */
export function CloudRetryStatus({ compact = false, projectId }: CloudRetryStatusProps) {
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  // Load failed uploads
  const loadFailedUploads = useCallback(async () => {
    if (!documentMutationService.getStatus().syncEnabled) return;
    
    try {
      const failed = await documentMutationService.getFailedUploads();
      setFailedUploads(failed);
    } catch (error) {
      console.error('[CloudRetryStatus] Failed to load failed uploads:', error);
    }
  }, []);

  // Initial load only - disabled periodic refresh to prevent Supabase quota flood
  useEffect(() => {
    loadFailedUploads();
    // NOTE: Polling disabled to prevent Supabase quota flood
    // Refresh manually via retry actions instead
  }, [loadFailedUploads]);

  // Listen for cloud retry events
  useEffect(() => {
    const unsubscribe = unifiedUploadService.onCloudRetry((assetId, retryCount) => {
      console.log(`[CloudRetryStatus] Retry event for ${assetId} (attempt ${retryCount})`);
      // Refresh the list after a retry is triggered
      setTimeout(loadFailedUploads, 1000);
    });
    
    return unsubscribe;
  }, [loadFailedUploads]);

  // Handle manual retry for a single asset
  const handleRetry = async (assetId: string) => {
    const assets = useAssetStore.getState().getCurrentBookAssets();
    const asset = assets[assetId] as Asset & { file?: File };
    if (!asset?.file) {
      console.error('[CloudRetryStatus] No file available for retry - user must re-upload');
      return;
    }

    setRetryingIds(prev => new Set(prev).add(assetId));
    
    try {
      const result = await unifiedUploadService.retryUpload(
        assetId,
        asset.file,
        projectId || documentMutationService.getStatus().documentVersion.toString()
      );

      if (result.success) {
        // Remove from failed list
        setFailedUploads(prev => prev.filter(u => u.assetId !== assetId));
      } else {
        // Refresh to get updated error
        await loadFailedUploads();
      }
    } catch (error) {
      console.error('[CloudRetryStatus] Retry failed:', error);
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    }
  };

  // Check if an asset has a file available for retry
  const hasFileForRetry = (assetId: string): boolean => {
    const assets = useAssetStore.getState().getCurrentBookAssets();
    const asset = assets[assetId] as Asset & { file?: File };
    return !!asset?.file;
  };

  // Retry all failed uploads
  const handleRetryAll = async () => {
    setIsLoading(true);
    
    for (const upload of failedUploads) {
      await handleRetry(upload.assetId);
    }
    
    setIsLoading(false);
  };

  // Dismiss/clear a failed upload (keep local only)
  const handleDismiss = async (assetId: string) => {
    // Reset to local status
    await documentMutationService.updateCloudStatus(assetId, 'local');
    setFailedUploads(prev => prev.filter(u => u.assetId !== assetId));
  };

  // Compact view - just a badge with count
  if (compact) {
    if (failedUploads.length === 0) return null;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => setIsExpanded(true)}
            >
              <CloudOff className="w-3 h-3 mr-1" />
              <Badge variant="destructive" className="h-4 min-w-4 text-[10px] px-1">
                {failedUploads.length}
              </Badge>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{failedUploads.length} failed upload{failedUploads.length !== 1 ? 's' : ''}</p>
            <p className="text-xs text-muted-foreground">Click to view details</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full view - expandable panel
  return (
    <div className="bg-background border rounded-lg overflow-hidden">
      {/* Header - always visible */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {failedUploads.length > 0 ? (
            <AlertCircle className="w-4 h-4 text-red-500" />
          ) : (
            <CloudOff className="w-4 h-4 text-gray-400" />
          )}
          <span className="text-sm font-medium">
            Cloud Upload Status
          </span>
          {failedUploads.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              {failedUploads.length} failed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {failedUploads.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                handleRetryAll();
              }}
              disabled={isLoading}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Retry All
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t">
          {failedUploads.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No failed uploads
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {failedUploads.map((upload) => (
                <div
                  key={upload.assetId}
                  className="flex items-center justify-between p-2 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                >
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="text-sm truncate" title={upload.name}>
                      {upload.name}
                    </p>
                    {upload.cloudError && (
                      <p className="text-xs text-red-500 truncate" title={upload.cloudError}>
                        {upload.cloudError}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleRetry(upload.assetId)}
                            disabled={retryingIds.has(upload.assetId) || !hasFileForRetry(upload.assetId)}
                          >
                            <RefreshCw className={`w-3 h-3 ${retryingIds.has(upload.assetId) ? 'animate-spin' : ''}`} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {hasFileForRetry(upload.assetId) 
                            ? 'Retry upload to cloud'
                            : 'File not available - re-upload required'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                            onClick={() => handleDismiss(upload.assetId)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Keep local only (don&apos;t sync to cloud)
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact badge version for inline use
 */
export function CloudRetryBadge() {
  const [failedCount, setFailedCount] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const checkFailed = async () => {
      try {
        const failed = await documentMutationService.getFailedUploads();
        setFailedCount(failed.length);
      } catch (error) {
        console.error('[CloudRetryBadge] Failed to check:', error);
      }
    };

    checkFailed();
    // NOTE: Polling disabled to prevent Supabase quota flood
    // Refresh manually via retry actions instead
  }, []);

  if (failedCount === 0) return null;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="destructive"
              className="cursor-pointer hover:bg-red-600"
              onClick={() => setShowDetails(true)}
            >
              <CloudOff className="w-3 h-3 mr-1" />
              {failedCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{failedCount} failed cloud upload{failedCount !== 1 ? 's' : ''}</p>
            <p className="text-xs">Click to manage</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {showDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="p-4">
              <CloudRetryStatus />
            </div>
            <div className="p-4 border-t flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDetails(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
