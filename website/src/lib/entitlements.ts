import { requireSupabase } from "./supabaseClient";
import type { DeviceActivation, Entitlement, EntitlementState } from "../types/domain";

const nowIso = () => new Date().toISOString();

export function isPaidLicense(license: Entitlement | null): boolean {
  if (!license || license.status !== "active") {
    return false;
  }

  return !license.expires_at || license.expires_at > nowIso();
}

export async function fetchEntitlement(userId: string): Promise<EntitlementState> {
  const supabase = requireSupabase();

  const { data: license, error: licenseError } = await supabase
    .from("entitlements")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${nowIso()}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Entitlement>();

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

  return {
    license,
    devices: devices || [],
    paid: isPaidLicense(license),
  };
}
