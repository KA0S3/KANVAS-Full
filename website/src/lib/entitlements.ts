import { requireSupabase } from "./supabaseClient";
import type { DeviceActivation, Entitlement, EntitlementState } from "../types/domain";

const nowIso = () => new Date().toISOString();

export function isPaidLicense(license: Entitlement | null): boolean {
  if (!license || license.status !== "active") {
    return false;
  }

  return !license.expires_at || license.expires_at > nowIso();
}

export function hasChannelAccess(state: EntitlementState | null, channel: "beta" | "stable"): boolean {
  if (!state?.paid) {
    return false;
  }

  return state.licenses.some((license) => isPaidLicense(license) && license.allowed_channels.includes(channel));
}

export async function fetchEntitlement(userId: string): Promise<EntitlementState> {
  const supabase = requireSupabase();

  const { data: licenses, error: licenseError } = await supabase
    .from("entitlements")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${nowIso()}`)
    .order("created_at", { ascending: false })
    .returns<Entitlement[]>();

  if (licenseError) {
    throw licenseError;
  }

  const { data: devices, error: devicesError } = await supabase
    .from("device_activations")
    .select("*")
    .eq("user_id", userId)
    .is("deactivated_at", null)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .returns<DeviceActivation[]>();

  if (devicesError) {
    throw devicesError;
  }

  const activeLicenses = (licenses || []).filter(isPaidLicense);
  const stableLicense = activeLicenses.find((license) => license.allowed_channels.includes("stable")) || null;
  const betaLicense = activeLicenses.find((license) => license.allowed_channels.includes("beta")) || null;

  return {
    license: stableLicense || betaLicense || activeLicenses[0] || null,
    licenses: activeLicenses,
    devices: devices || [],
    paid: activeLicenses.length > 0,
    betaAccess: Boolean(betaLicense),
    stableAccess: Boolean(stableLicense),
    stableUpgradeEligible: activeLicenses.some((license) => license.stable_upgrade_eligible),
  };
}
