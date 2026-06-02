export type PaystackProductKey = "BETA_ACCESS" | "BETA_TO_STABLE_UPGRADE" | "STABLE_FULL";

export type PaystackProduct = {
  key: PaystackProductKey;
  amount: number;
  currency: string;
  label: string;
  plan: "beta" | "stable";
  allowed_channels: ("beta" | "stable")[];
  grants_upgrade_eligibility: boolean;
  requires_upgrade_eligibility: boolean;
};

export const PAYSTACK_CALLBACK_URL = "https://kanvas-it.com/payment-success";

export const PAYSTACK_PRODUCTS: Record<PaystackProductKey, PaystackProduct> = {
  BETA_ACCESS: {
    key: "BETA_ACCESS",
    amount: 25000,
    currency: "ZAR",
    label: "KANVAS beta access",
    plan: "beta",
    allowed_channels: ["beta"],
    grants_upgrade_eligibility: true,
    requires_upgrade_eligibility: false,
  },
  BETA_TO_STABLE_UPGRADE: {
    key: "BETA_TO_STABLE_UPGRADE",
    amount: 10000,
    currency: "ZAR",
    label: "KANVAS beta to stable upgrade",
    plan: "stable",
    allowed_channels: ["stable"],
    grants_upgrade_eligibility: false,
    requires_upgrade_eligibility: true,
  },
  STABLE_FULL: {
    key: "STABLE_FULL",
    amount: 50000,
    currency: "ZAR",
    label: "KANVAS stable full license",
    plan: "stable",
    allowed_channels: ["stable"],
    grants_upgrade_eligibility: false,
    requires_upgrade_eligibility: false,
  },
};

export const getPaystackProduct = (key: string | undefined): PaystackProduct | null =>
  key && key in PAYSTACK_PRODUCTS ? PAYSTACK_PRODUCTS[key as PaystackProductKey] : null;
