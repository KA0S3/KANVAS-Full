import { requireSupabase } from "./supabaseClient";
import { PAYSTACK_CALLBACK_URL, type PaystackProductKey } from "./config";

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
      callback_url: PAYSTACK_CALLBACK_URL,
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
