import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, RefreshCw, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { useLicenseStore } from '@/stores/licenseStore';

const fallbackStatus: KanvasUpdateStatus = {
  state: 'disabled',
  channel: 'stable',
  currentVersion: 'unknown',
  autoDownload: false,
  canCheck: false,
  canDownload: false,
  canInstall: false,
  message: 'Desktop updater is unavailable in this environment.',
};

const upgradeUrl = import.meta.env.VITE_KANVAS_UPGRADE_URL || 'https://kanvas.app/upgrade';

export function UpdateSettingsSection() {
  const [status, setStatus] = useState<KanvasUpdateStatus>(fallbackStatus);
  const [busyAction, setBusyAction] = useState<'check' | 'download' | 'install' | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const licenseStatus = useLicenseStore((state) => state.status);
  const refreshLicenseHeartbeat = useLicenseStore((state) => state.heartbeat);
  const hasUpdater = typeof window !== 'undefined' && Boolean(window.kanvasUpdates);

  useEffect(() => {
    if (!window.kanvasUpdates) {
      return;
    }

    let mounted = true;
    window.kanvasUpdates.getStatus().then((nextStatus) => {
      if (mounted) {
        setStatus(nextStatus);
      }
    });

    const unsubscribe = window.kanvasUpdates.onStatus((nextStatus) => {
      if (mounted) {
        setStatus(nextStatus);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status.channel === 'beta') {
      void refreshLicenseHeartbeat(true);
    }
  }, [refreshLicenseHeartbeat, status.channel]);

  useEffect(() => {
    if (!window.kanvasUpdates?.setStableAvailability || status.channel !== 'beta') {
      return;
    }

    const stableAvailable = Boolean(licenseStatus?.stableAvailable);
    const stableUpgradeEligible = Boolean(licenseStatus?.stableUpgradeEligible);
    window.kanvasUpdates.setStableAvailability({ stableAvailable, stableUpgradeEligible }).then(setStatus);
  }, [licenseStatus?.stableAvailable, licenseStatus?.stableUpgradeEligible, status.channel]);

  const stateLabel = useMemo(() => {
    switch (status.state) {
      case 'checking':
        return 'Checking';
      case 'no-update':
        return 'Up to date';
      case 'available':
        return 'Available';
      case 'downloading':
        return 'Downloading';
      case 'downloaded':
        return 'Ready';
      case 'error':
        return 'Failed';
      case 'disabled':
        return 'Disabled';
      default:
        return 'Idle';
    }
  }, [status.state]);

  const runAction = async (
    action: 'check' | 'download' | 'install',
    handler: () => Promise<KanvasUpdateStatus>,
  ) => {
    setBusyAction(action);
    setInstallError(null);
    try {
      setStatus(await handler());
    } finally {
      setBusyAction(null);
    }
  };

  const installSafely = async () => {
    setBusyAction('install');
    setInstallError(null);
    try {
      if (window.kanvasBeforeUpdateInstall) {
        await window.kanvasBeforeUpdateInstall();
      }
      if (window.kanvasUpdates) {
        setStatus(await window.kanvasUpdates.install());
      }
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : 'Unable to save project data before installing the update.');
    } finally {
      setBusyAction(null);
    }
  };

  const showStablePrompt = status.channel === 'beta' && status.stableAvailable;

  const toggleAutoDownload = async (enabled: boolean) => {
    if (!window.kanvasUpdates) {
      return;
    }
    setStatus(await window.kanvasUpdates.setAutoDownload(enabled));
  };

  return (
    <div className="border-t border-glass-border/30 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-foreground">Updates</div>
            <Badge variant={status.channel === 'beta' ? 'secondary' : 'outline'}>
              {status.channel === 'beta' ? 'Beta channel' : 'Stable channel'}
            </Badge>
            <Badge variant={status.state === 'error' ? 'destructive' : 'outline'}>{stateLabel}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Current version {status.currentVersion}
            {status.availableVersion ? ` • Available ${status.availableVersion}` : ''}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Auto-download</span>
          <Switch
            checked={status.autoDownload}
            disabled={!hasUpdater || status.state === 'disabled'}
            onCheckedChange={toggleAutoDownload}
            aria-label="Auto-download updates"
          />
        </div>
      </div>

      <div className="mt-3 text-sm text-muted-foreground">{status.message}</div>
      {installError ? <div className="mt-3 text-sm text-destructive">{installError}</div> : null}

      {status.state === 'downloading' && (
        <Progress value={status.progress || 0} className="mt-3 h-2" />
      )}

      {status.channel === 'beta' && (
        <div className="mt-3 rounded-md border border-glass-border/30 bg-glass/20 p-3 text-xs text-muted-foreground">
          {showStablePrompt
            ? status.stableUpgradeEligible
              ? 'Stable KANVAS is available. Use your account page to buy the upgrade and download the stable installer.'
              : 'Stable KANVAS is available. Use your account page to download it if your account includes stable access.'
            : 'This build receives beta-safe updates only. Full-version upgrades use the purchase and entitlement path once it is available.'}
          <a
            href={upgradeUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
          >
            Upgrade path
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasUpdater || !status.canCheck || busyAction !== null}
          onClick={() => window.kanvasUpdates && runAction('check', window.kanvasUpdates.check)}
          className="glass cosmic-glow border-glass-border/40 hover:bg-glass/20"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Check for updates
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasUpdater || !status.canDownload || busyAction !== null}
          onClick={() => window.kanvasUpdates && runAction('download', window.kanvasUpdates.download)}
          className="glass cosmic-glow border-glass-border/40 hover:bg-glass/20"
        >
          <Download className="mr-2 h-4 w-4" />
          Download update
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={!hasUpdater || !status.canInstall || busyAction !== null}
          onClick={installSafely}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Restart and install
        </Button>
      </div>
    </div>
  );
}
