export const SITE_ORIGIN = import.meta.env.VITE_SITE_ORIGIN || "https://kanvas-it.com";
export const SITE_URL = import.meta.env.VITE_SITE_URL || SITE_ORIGIN;
export const LICENSE_API_URL = import.meta.env.VITE_LICENSE_API_URL || "https://<project-ref>.supabase.co/functions/v1";
export const STABLE_DOWNLOAD_URL = import.meta.env.VITE_STABLE_DOWNLOAD_URL || "";
export const BETA_DOWNLOAD_URL = import.meta.env.VITE_BETA_DOWNLOAD_URL || "";

export const MAX_DEMO_BOOKS = 1;
export const MAX_DEMO_ASSETS = 100;
export const MAX_DEMO_UPLOAD_BYTES = 2 * 1024 * 1024;

export const PAYSTACK_PRODUCTS = {
  PRO_SUBSCRIPTION: {
    key: "PRO_SUBSCRIPTION",
    name: "Pro Subscription",
    priceLabel: "R100 / month",
    description: "Desktop access while your subscription is active.",
  },
  LIFETIME: {
    key: "LIFETIME",
    name: "Lifetime",
    priceLabel: "R1500 once",
    description: "One-time desktop access purchase.",
  },
} as const;

export type PaystackProductKey = keyof typeof PAYSTACK_PRODUCTS;
