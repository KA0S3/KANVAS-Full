/**
 * Project Cache Loading Indicator
 * 
 * Shows loading state for project cache operations.
 * Replaces save symbols with non-moving loading indicators
 * when cache is being refreshed.
 */

import { Loader2 } from 'lucide-react';
import { useProjectCacheLoading } from '@/hooks/useProjectCacheLoading';

interface ProjectCacheLoadingIndicatorProps {
  className?: string;
  showText?: boolean;
}

export function ProjectCacheLoadingIndicator({ 
  className = '', 
  showText = true 
}: ProjectCacheLoadingIndicatorProps) {
  const { isRefreshing, error } = useProjectCacheLoading();

  // Don't show anything if not refreshing and no error
  if (!isRefreshing && !error) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {isRefreshing && (
        <>
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          {showText && (
            <span className="text-sm text-blue-600">
              Refreshing projects...
            </span>
          )}
        </>
      )}
      
      {error && (
        <>
          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-white text-xs">!</span>
          </div>
          {showText && (
            <span className="text-sm text-red-600">
              Failed to refresh projects
            </span>
          )}
        </>
      )}
    </div>
  );
}
