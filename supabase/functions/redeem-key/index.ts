import {
  handleError,
  HttpError,
  json,
  readJson,
  requireUser,
  serviceClient,
  sha256Hex,
} from "../_shared/common.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: json(request, {}).headers });

  try {
    const { user } = await requireUser(request);
    const body = await readJson<{ key?: string }>(request);
    if (!body.key) throw new HttpError(400, "key_required");

    const supabase = serviceClient();
    const keyHash = await sha256Hex(body.key.trim());
    const { data: accessKey, error } = await supabase
      .from("access_keys")
      .select("*")
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (error) throw error;
    if (!accessKey) throw new HttpError(404, "access_key_not_found");
    if (accessKey.status !== "active") throw new HttpError(403, "access_key_not_active");
    if (accessKey.expires_at && new Date(accessKey.expires_at).getTime() <= Date.now()) {
      throw new HttpError(403, "access_key_expired");
    }
    if (accessKey.redemption_count >= accessKey.max_redemptions) {
      throw new HttpError(409, "access_key_redemptions_exhausted");
    }

    const { data: existingRedemption, error: redemptionLookupError } = await supabase
      .from("access_key_redemptions")
      .select("id")
      .eq("access_key_id", accessKey.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (redemptionLookupError) throw redemptionLookupError;

    if (!existingRedemption) {
      const { error: redemptionError } = await supabase
        .from("access_key_redemptions")
        .insert({ access_key_id: accessKey.id, user_id: user.id });
      if (redemptionError) throw redemptionError;

      const { error: countError } = await supabase
        .from("access_keys")
        .update({ redemption_count: accessKey.redemption_count + 1 })
        .eq("id", accessKey.id);
      if (countError) throw countError;
    }

    const entitlementPayload = {
        user_id: user.id,
        status: "active",
        plan: accessKey.plan,
        allowed_devices: accessKey.allowed_devices,
        allowed_channels: accessKey.allowed_channels,
        source: "access_key",
        expires_at: accessKey.expires_at,
      };
    const { data: existingEntitlement, error: existingEntitlementError } = await supabase
      .from("entitlements")
      .select("id")
      .eq("user_id", user.id)
      .eq("source", "access_key")
      .eq("plan", accessKey.plan)
      .maybeSingle();
    if (existingEntitlementError) throw existingEntitlementError;

    const entitlementRequest = existingEntitlement
      ? supabase.from("entitlements").update(entitlementPayload).eq("id", existingEntitlement.id)
      : supabase.from("entitlements").insert(entitlementPayload);

    const { data: entitlement, error: entitlementError } = await entitlementRequest.select("*").single();
    if (entitlementError) throw entitlementError;

    await supabase.from("audit_log").insert({
      actor_user_id: user.id,
      action: "access_key_redeemed",
      target_type: "entitlement",
      target_id: entitlement.id,
      metadata: { access_key_id: accessKey.id },
    });

    return json(request, { ok: true, entitlement });
  } catch (error) {
    return handleError(request, error);
  }
});
