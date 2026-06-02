import { handleError, HttpError, json, serviceClient } from "../_shared/common.ts";
import { getPaystackProduct } from "../_shared/paystackProducts.ts";

const PAYSTACK_SIGNATURE_HEADER = "x-paystack-signature";

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const verifyPaystackSignature = async (body: string, signature: string | null): Promise<void> => {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) throw new HttpError(500, "paystack_secret_missing");
  if (!signature) throw new HttpError(401, "missing_paystack_signature");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const computed = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  if (computed !== signature) throw new HttpError(401, "invalid_paystack_signature");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: json(request, {}).headers });

  try {
    const rawBody = await request.text();
    await verifyPaystackSignature(rawBody, request.headers.get(PAYSTACK_SIGNATURE_HEADER));

    const payload = JSON.parse(rawBody);
    const data = payload.data ?? {};
    const metadata = data.metadata ?? {};
    const eventType = String(payload.event ?? "unknown");
    const reference = data.reference ? String(data.reference) : null;
    const supabase = serviceClient();

    const eventQuery = supabase
      .from("payment_events")
      .select("id, processed_at")
      .eq("provider", "paystack")
      .eq("event_type", eventType);
    const { data: existingEvent, error: existingEventError } = reference
      ? await eventQuery.eq("reference", reference).maybeSingle()
      : await eventQuery.is("reference", null).maybeSingle();
    if (existingEventError) throw existingEventError;
    if (existingEvent?.processed_at) return json(request, { ok: true, duplicate: true });

    const { data: insertedEvent, error: eventError } = existingEvent
      ? { data: existingEvent, error: null }
      : await supabase
        .from("payment_events")
        .insert({
        provider: "paystack",
        event_type: eventType,
        reference,
        payload,
      })
        .select("id, processed_at")
        .single();

    if (eventError) throw eventError;
    const eventRow = insertedEvent;

    const userId = metadata.user_id;
    const successful = eventType === "charge.success" || data.status === "success";
    const failed = ["charge.failed", "subscription.disable", "refund.processed"].includes(eventType);

    if (userId && successful) {
      const product = getPaystackProduct(String(metadata.product_key ?? ""));
      if (!product || !reference) {
        await supabase.from("audit_log").insert({
          actor_user_id: userId,
          action: "paystack_entitlement_not_granted",
          target_type: "payment_event",
          metadata: { event_type: eventType, reference, reason: product ? "missing_reference" : "unknown_product" },
        });
      } else if (
        Number(data.amount) !== Number(metadata.expected_amount ?? product.amount) ||
        String(data.currency ?? "").toUpperCase() !== String(metadata.expected_currency ?? product.currency).toUpperCase()
      ) {
        await supabase.from("audit_log").insert({
          actor_user_id: userId,
          action: "paystack_entitlement_not_granted",
          target_type: "payment_event",
          metadata: { event_type: eventType, reference, product_key: product.key, reason: "amount_or_currency_mismatch" },
        });
      } else {
        if (product.requires_upgrade_eligibility) {
          const now = new Date().toISOString();
          const { data: eligibleEntitlement, error: eligibilityError } = await supabase
            .from("entitlements")
            .select("id")
            .eq("user_id", userId)
            .eq("stable_upgrade_eligible", true)
            .in("status", ["active", "trial"])
            .lte("starts_at", now)
            .or(`expires_at.is.null,expires_at.gt.${now}`)
            .limit(1)
            .maybeSingle();
          if (eligibilityError) throw eligibilityError;

          if (!eligibleEntitlement) {
            await supabase.from("audit_log").insert({
              actor_user_id: userId,
              action: "paystack_entitlement_not_granted",
              target_type: "payment_event",
              metadata: { event_type: eventType, reference, product_key: product.key, reason: "stable_upgrade_not_eligible" },
            });

            if (eventRow?.id) {
              await supabase.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("id", eventRow.id);
            }

            return json(request, { ok: true, granted: false, reason: "stable_upgrade_not_eligible" });
          }
        }

        const status = "active";
        const { data: existing, error: existingError } = await supabase
          .from("entitlements")
          .select("id")
          .eq("paystack_reference", reference)
          .maybeSingle();
        if (existingError) throw existingError;

        const entitlementPayload = {
          user_id: userId,
          status,
          plan: product.plan,
          allowed_devices: 2,
          allowed_channels: product.allowed_channels,
          source: "paystack",
          product_key: product.key,
          stable_upgrade_eligible: product.grants_upgrade_eligibility,
          paystack_customer_code: data.customer?.customer_code ?? null,
          paystack_reference: reference,
          paystack_subscription_code: null,
          expires_at: null,
        };

        const entitlementRequest = existing
          ? supabase.from("entitlements").update(entitlementPayload).eq("id", existing.id)
          : supabase.from("entitlements").insert(entitlementPayload);

        const { data: entitlement, error } = await entitlementRequest.select("id").single();
        if (error) throw error;

        await supabase.from("audit_log").insert({
          actor_user_id: userId,
          action: "paystack_entitlement_active",
          target_type: "entitlement",
          target_id: entitlement.id,
          metadata: { event_type: eventType, reference, product_key: product.key },
        });
      }
    } else if (userId && failed) {
      await supabase
        .from("entitlements")
        .update({ status: eventType === "refund.processed" ? "refunded" : "past_due" })
        .eq("user_id", userId)
        .eq("source", "paystack");

      await supabase.from("audit_log").insert({
        actor_user_id: userId,
        action: "paystack_entitlement_not_active",
        target_type: "payment_event",
        metadata: { event_type: eventType, reference },
      });
    }

    if (eventRow?.id) {
      await supabase.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("id", eventRow.id);
    }

    return json(request, { ok: true });
  } catch (error) {
    return handleError(request, error);
  }
});
