export type PaystackProductKey = "BETA_ACCESS" | "BETA_TO_STABLE_UPGRADE" | "STABLE_FULL";

export type PaystackProduct = {
  key: PaystackProductKey;
  amount: number;
  currency: "ZAR";
  name: string;
  description: string;
};

export const PAYSTACK_CALLBACK_URL = "https://kanvas-it.com/payment-success";
export const PAYSTACK_WEBHOOK_URL = "https://hzngfqebklzhnwkcmgto.supabase.co/functions/v1/paystack-webhook";

export const PAYSTACK_PRODUCTS: Record<PaystackProductKey, PaystackProduct> = {
  BETA_ACCESS: {
    key: "BETA_ACCESS",
    amount: 25000,
    currency: "ZAR",
    name: "KANVAS beta access",
    description: "Unlock beta desktop access and keep your stable upgrade discount.",
  },
  BETA_TO_STABLE_UPGRADE: {
    key: "BETA_TO_STABLE_UPGRADE",
    amount: 10000,
    currency: "ZAR",
    name: "Beta to stable upgrade",
    description: "For beta supporters with stable upgrade eligibility.",
  },
  STABLE_FULL: {
    key: "STABLE_FULL",
    amount: 50000,
    currency: "ZAR",
    name: "KANVAS stable full license",
    description: "Full stable desktop access for new buyers.",
  },
};

export const centsToRand = (amount: number): number => amount / 100;
