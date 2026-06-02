import { MonitorX } from "lucide-react";

type DeviceLimitNoticeProps = {
  visible: boolean;
};

export function DeviceLimitNotice({ visible }: DeviceLimitNoticeProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-400/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <MonitorX className="mt-0.5 h-4 w-4 flex-none" />
      <p>
        This device was signed out because your account is active on two newer devices. Your local projects are still on this computer.
      </p>
    </div>
  );
}
