export type PaystackProductKey = "BETA_ACCESS" | "BETA_TO_STABLE_UPGRADE" | "STABLE_FULL";

export type PaystackProduct = {
  key: PaystackProductKey;
  amount: number;
  currency: string;
  name: string;
  description: string;
};

export const FALLBACK_PAYMENT_CURRENCY = "ZAR";

export const PAYSTACK_CALLBACK_URL = "https://kanvas-it.com/payment-success";
export const PAYSTACK_WEBHOOK_URL = "https://hzngfqebklzhnwkcmgto.supabase.co/functions/v1/paystack-webhook";

export const PAYSTACK_PRODUCTS: Record<PaystackProductKey, PaystackProduct> = {
  BETA_ACCESS: {
    key: "BETA_ACCESS",
    amount: 25000,
    currency: FALLBACK_PAYMENT_CURRENCY,
    name: "KANVAS beta access",
    description: "Discounted early-supporter beta access for the current desktop build. Requires an upgrade purchase when the full version is released.",
  },
  BETA_TO_STABLE_UPGRADE: {
    key: "BETA_TO_STABLE_UPGRADE",
    amount: 10000,
    currency: FALLBACK_PAYMENT_CURRENCY,
    name: "Beta to stable upgrade",
    description: "For beta supporters with stable upgrade eligibility.",
  },
  STABLE_FULL: {
    key: "STABLE_FULL",
    amount: 50000,
    currency: FALLBACK_PAYMENT_CURRENCY,
    name: "KANVAS stable full license",
    description: "Full stable desktop access for new buyers.",
  },
};
