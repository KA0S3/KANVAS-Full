import { handleError, HttpError, json, readJson, requireUser, serviceClient } from "../_shared/common.ts";
import { getPaystackProduct, PAYSTACK_CALLBACK_URL } from "../_shared/paystackProducts.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: json(request, {}).headers });

  try {
    const { user } = await requireUser(request);
    const body = await readJson<{ locale?: string; product_key?: string; time_zone?: string }>(request);
    const product = getPaystackProduct(body.product_key);
    if (!product) throw new HttpError(400, "unknown_product");
    if (!user.email) throw new HttpError(400, "user_email_required");

    if (product.requires_upgrade_eligibility) {
      const now = new Date().toISOString();
      const { data: eligibleEntitlement, error: eligibilityError } = await serviceClient()
        .from("entitlements")
        .select("id")
        .eq("user_id", user.id)
        .eq("stable_upgrade_eligible", true)
        .in("status", ["active", "trial"])
        .lte("starts_at", now)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .limit(1)
        .maybeSingle();
      if (eligibilityError) throw eligibilityError;
      if (!eligibleEntitlement) throw new HttpError(403, "stable_upgrade_not_eligible");
    }

    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecret) throw new HttpError(500, "paystack_secret_missing");

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        authorization: `Bearer ${paystackSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: product.amount,
        currency: product.currency,
        callback_url: PAYSTACK_CALLBACK_URL,
        metadata: {
          user_id: user.id,
          product_key: product.key,
          expected_amount: product.amount,
          expected_currency: product.currency,
          allowed_channels: product.allowed_channels,
          label: product.label,
        },
      }),
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new HttpError(502, "paystack_initialize_failed", { paystack: result });
    }

    return json(request, {
      authorization_url: result.data.authorization_url,
      access_code: result.data.access_code,
      reference: result.data.reference,
    });
  } catch (error) {
    return handleError(request, error);
  }
});
