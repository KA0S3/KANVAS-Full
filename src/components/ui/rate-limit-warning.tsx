import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  X,
  TrendingUp,
  Database,
  Upload,
  Shield
} from 'lucide-react';
import { RateLimitMiddleware } from '@/services/rateLimitMiddleware';
import { RateLimitStatus } from '@/services/rateLimitService';

interface RateLimitWarningProps {
  userId: string;
  className?: string;
  compact?: boolean;
}

interface LimitCardProps {
  title: string;
  icon: React.ReactNode;
  status: RateLimitStatus;
  type: 'api' | 'auth' | 'upload';
}

const LimitCard: React.FC<LimitCardProps> = ({ title, icon, status, type }) => {
  const percentage = (status.current / status.limit) * 100;
  const isWarning = status.isSoftLimitExceeded && !status.isHardLimitExceeded;
  const isCritical = status.isHardLimitExceeded;
  
  const formatRemaining = () => {
    if (type === 'upload') {
      return `${status.remaining.toFixed(1)}MB`;
    }
    return `${status.remaining}`;
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className={`p-3 rounded-lg border ${
      isCritical ? 'border-red-200 bg-red-50' : 
      isWarning ? 'border-yellow-200 bg-yellow-50' : 
      'border-gray-200 bg-gray-50'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{title}</span>
          {isCritical && (
            <Badge variant="destructive" className="text-xs">
              Limited
            </Badge>
          )}
          {isWarning && (
            <Badge variant="secondary" className="text-xs bg-yellow-200 text-yellow-800">
              Warning
            </Badge>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {formatTime(status.resetIn)}
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">
            {status.current}/{status.limit} {type === 'upload' ? 'MB' : 'requests'}
          </span>
          <span className="font-medium">
            {formatRemaining()} left
          </span>
        </div>
        
        <Progress 
          value={Math.min(percentage, 100)} 
          className={`h-2 ${
            isCritical ? 'bg-red-100' : 
            isWarning ? 'bg-yellow-100' : 
            'bg-gray-100'
          }`}
        />
      </div>
    </div>
  );
};

export const RateLimitWarning: React.FC<RateLimitWarningProps> = ({ 
  userId, 
  className = '',
  compact = false 
}) => {
  const [status, setStatus] = useState<{
    api: RateLimitStatus;
    auth: RateLimitStatus;
    upload: RateLimitStatus;
  } | null>(null);
  const [isApproachingLimits, setIsApproachingLimits] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  useEffect(() => {
    const updateStatus = () => {
      try {
        const currentStatus = RateLimitMiddleware.getCurrentStatus(userId);
        const approaching = RateLimitMiddleware.isApproachingLimits(userId);
        
        setStatus(currentStatus);
        setIsApproachingLimits(approaching.isApproachingAnyLimit);
        setLastUpdated(Date.now());
      } catch (error) {
        console.error('[RateLimitWarning] Failed to get status:', error);
      }
    };

    // Initial update
    updateStatus();

    // Update every 30 seconds
    const interval = setInterval(updateStatus, 30000);

    return () => clearInterval(interval);
  }, [userId]);

  if (!status || !isApproachingLimits) {
    return null;
  }

  const approaching = RateLimitMiddleware.isApproachingLimits(userId);
  const hasCriticalWarnings = approaching.criticalWarnings.length > 0;

  if (compact) {
    return (
      <div className={`fixed top-4 right-4 z-50 max-w-sm ${className}`}>
        <Alert className={`${hasCriticalWarnings ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}`}>
          <AlertTriangle className={`h-4 w-4 ${hasCriticalWarnings ? 'text-red-600' : 'text-yellow-600'}`} />
          <AlertTitle className="text-sm">
            {hasCriticalWarnings ? 'Rate Limit Reached' : 'Rate Limit Warning'}
          </AlertTitle>
          <AlertDescription className="text-xs">
            {hasCriticalWarnings 
              ? 'Some operations are temporarily blocked.'
              : 'You are approaching rate limits.'
            }
            <Button 
              variant="link" 
              className="p-0 h-auto text-xs underline"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 max-w-md ${className}`}>
      <div className="bg-white rounded-lg shadow-lg border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Shield className={`h-5 w-5 ${hasCriticalWarnings ? 'text-red-600' : 'text-yellow-600'}`} />
            <h3 className="font-semibold">
              {hasCriticalWarnings ? 'Rate Limits Reached' : 'Rate Limit Warnings'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
              className="text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {/* Allow dismissal for warnings only */}}
              className="text-xs"
              disabled={hasCriticalWarnings}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 bg-gray-50">
          {hasCriticalWarnings ? (
            <div className="space-y-2">
              <p className="text-sm text-red-700 font-medium">
                Some operations are temporarily blocked to prevent service interruption.
              </p>
              {approaching.criticalWarnings.map((warning, index) => (
                <div key={index} className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {warning}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-yellow-700 font-medium">
                You are approaching rate limits. Consider saving work and continuing later.
              </p>
              {approaching.warnings.map((warning, index) => (
                <div key={index} className="text-xs text-yellow-600 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {warning}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailed Status */}
        {showDetails && (
          <div className="p-4 space-y-3">
            <LimitCard
              title="API Requests"
              icon={<Database className="h-4 w-4 text-blue-600" />}
              status={status.api}
              type="api"
            />
            
            <LimitCard
              title="Authentication"
              icon={<Shield className="h-4 w-4 text-green-600" />}
              status={status.auth}
              type="auth"
            />
            
            <LimitCard
              title="File Uploads"
              icon={<Upload className="h-4 w-4 text-purple-600" />}
              status={status.upload}
              type="upload"
            />
            
            <div className="text-xs text-gray-500 text-center pt-2 border-t">
              Last updated: {new Date(lastUpdated).toLocaleTimeString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Hook for components to check rate limits
export const useRateLimitStatus = (userId: string) => {
  const [status, setStatus] = useState<{
    api: RateLimitStatus;
    auth: RateLimitStatus;
    upload: RateLimitStatus;
  } | null>(null);
  const [isApproachingLimits, setIsApproachingLimits] = useState(false);

  const refresh = React.useCallback(() => {
    try {
      const currentStatus = RateLimitMiddleware.getCurrentStatus(userId);
      const approaching = RateLimitMiddleware.isApproachingLimits(userId);
      
      setStatus(currentStatus);
      setIsApproachingLimits(approaching.isApproachingAnyLimit);
    } catch (error) {
      console.error('[useRateLimitStatus] Failed to get status:', error);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    status,
    isApproachingLimits,
    refresh,
    canMakeApiRequest: status ? !status.api.isHardLimitExceeded : true,
    canMakeAuthRequest: status ? !status.auth.isHardLimitExceeded : true,
    canUpload: status ? !status.upload.isHardLimitExceeded : true,
  };
};
