import {
  assertAdmin,
  handleError,
  HttpError,
  json,
  randomCode,
  readJson,
  requireUser,
  serviceClient,
  sha256Hex,
} from "../_shared/common.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: json(request, {}).headers });

  try {
    const { user } = await requireUser(request);
    const supabase = serviceClient();
    const admin = await assertAdmin(supabase, user.id);
    const body = await readJson<any>(request);
    const action = body.action;

    if (action === "admin_status") {
      return json(request, { ok: true, admin: { user_id: user.id, role: admin.role } });
    }

    if (action === "create_entitlement" || action === "update_entitlement") {
      const payload = {
        id: body.entitlement_id,
        user_id: body.user_id,
        status: body.status ?? "active",
        plan: body.plan ?? "admin_grant",
        allowed_devices: body.allowed_devices ?? 2,
        allowed_channels: body.allowed_channels ?? ["stable"],
        source: "admin",
        expires_at: body.expires_at ?? null,
      };
      const { data, error } = await supabase.from("entitlements").upsert(payload).select("*").single();
      if (error) throw error;
      await supabase.from("audit_log").insert({
        actor_user_id: user.id,
        action,
        target_type: "entitlement",
        target_id: data.id,
        metadata: { role: admin.role },
      });
      return json(request, { ok: true, entitlement: data });
    }

    if (action === "create_access_key") {
      const plaintext = body.key ?? `kanvas_${randomCode()}`;
      const status = body.status ?? "active";
      if (!["active", "revoked", "expired"].includes(status)) throw new HttpError(400, "invalid_access_key_status");
      const { data, error } = await supabase
        .from("access_keys")
        .insert({
          key_hash: await sha256Hex(plaintext),
          label: body.label ?? null,
          plan: body.plan ?? "stable",
          allowed_devices: body.allowed_devices ?? 2,
          allowed_channels: body.allowed_channels ?? ["stable"],
          max_redemptions: body.max_redemptions ?? 1,
          expires_at: body.expires_at ?? null,
          status,
          created_by: user.id,
        })
        .select("*")
        .single();
      if (error) throw error;
      await supabase.from("audit_log").insert({
        actor_user_id: user.id,
        action,
        target_type: "access_key",
        target_id: data.id,
        metadata: { role: admin.role, label: data.label },
      });
      return json(request, { ok: true, access_key: { ...data, key_hash: undefined }, plaintext_key: plaintext });
    }

    if (action === "revoke_access_key") {
      const { data, error } = await supabase
        .from("access_keys")
        .update({ status: "revoked" })
        .eq("id", body.access_key_id)
        .select("id,label,status")
        .single();
      if (error) throw error;
      await supabase.from("audit_log").insert({
        actor_user_id: user.id,
        action,
        target_type: "access_key",
        target_id: data.id,
        metadata: { role: admin.role, label: data.label },
      });
      return json(request, { ok: true, access_key: data });
    }

    if (action === "update_access_key") {
      const updates: Record<string, unknown> = {};
      for (const field of ["label", "plan", "allowed_devices", "allowed_channels", "max_redemptions", "expires_at", "status"]) {
        if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field];
      }
      if (Object.keys(updates).length === 0) throw new HttpError(400, "no_access_key_updates");
      if (updates.status && !["active", "revoked", "expired"].includes(String(updates.status))) {
        throw new HttpError(400, "invalid_access_key_status");
      }
      const { data, error } = await supabase
        .from("access_keys")
        .update(updates)
        .eq("id", body.access_key_id)
        .select("id,label,plan,allowed_devices,allowed_channels,max_redemptions,status,expires_at,created_at")
        .single();
      if (error) throw error;
      await supabase.from("audit_log").insert({
        actor_user_id: user.id,
        action,
        target_type: "access_key",
        target_id: data.id,
        metadata: { role: admin.role, fields: Object.keys(updates) },
      });
      return json(request, { ok: true, access_key: data });
    }

    if (action === "list_access_keys") {
      const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 500);
      const status = body.status;
      let query = supabase
        .from("access_keys")
        .select("id,label,plan,allowed_devices,allowed_channels,max_redemptions,status,expires_at,created_at,access_key_redemptions(id)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status && status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      const accessKeys = (data ?? []).map(({ access_key_redemptions, ...key }: any) => ({
        ...key,
        redemption_count: Array.isArray(access_key_redemptions) ? access_key_redemptions.length : 0,
      }));
      return json(request, { ok: true, access_keys: accessKeys });
    }

    if (action === "deactivate_device") {
      const { data, error } = await supabase
        .from("device_activations")
        .update({
          active: false,
          deactivated_at: new Date().toISOString(),
          deactivation_reason: body.reason ?? "admin_deactivated",
        })
        .eq("id", body.device_activation_id)
        .select("*")
        .single();
      if (error) throw error;
      await supabase.from("audit_log").insert({
        actor_user_id: user.id,
        action,
        target_type: "device_activation",
        target_id: data.id,
        metadata: { role: admin.role, reason: data.deactivation_reason },
      });
      return json(request, { ok: true, device_activation: data });
    }

    if (action === "inspect_user") {
      const userId = body.user_id;
      const [profile, entitlements, devices, redemptions] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("entitlements").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("device_activations").select("*").eq("user_id", userId).order("first_activated_at", { ascending: false }),
        supabase.from("access_key_redemptions").select("*").eq("user_id", userId).order("redeemed_at", { ascending: false }),
      ]);
      if (profile.error) throw profile.error;
      if (entitlements.error) throw entitlements.error;
      if (devices.error) throw devices.error;
      if (redemptions.error) throw redemptions.error;
      return json(request, {
        ok: true,
        profile: profile.data,
        entitlements: entitlements.data,
        device_activations: devices.data,
        access_key_redemptions: redemptions.data,
      });
    }

    if (action === "list_audit") {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(body.limit ?? 100);
      if (error) throw error;
      return json(request, { ok: true, audit_log: data });
    }

    if (action === "list_payments") {
      const { data, error } = await supabase
        .from("payment_events")
        .select("id,provider,event_type,reference,processed_at,created_at")
        .order("created_at", { ascending: false })
        .limit(body.limit ?? 100);
      if (error) throw error;
      return json(request, { ok: true, payment_events: data });
    }

    throw new HttpError(400, "unknown_admin_action");
  } catch (error) {
    return handleError(request, error);
  }
});
