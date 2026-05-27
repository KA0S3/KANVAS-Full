import { requireSupabase } from "./supabaseClient";
import type { PaystackProductKey } from "./config";

export async function startPurchase(productKey: PaystackProductKey): Promise<void> {
  const supabase = requireSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    throw new Error("Sign in before purchasing the desktop app.");
  }

  const { data, error } = await supabase.functions.invoke("paystack-initialize", {
    body: {
      product_key: productKey,
      user_id: user.id,
      email: user.email,
      callback_url: `${window.location.origin}/payment/success`,
      cancel_url: `${window.location.origin}/payment/cancelled`,
    },
  });

  if (error) {
    throw new Error(error.message || "Unable to start payment.");
  }

  const authorizationUrl = data?.data?.authorization_url || data?.authorization_url;
  if (!authorizationUrl) {
    throw new Error("Payment backend did not return a Paystack authorization URL.");
  }

  window.location.assign(authorizationUrl);
}
