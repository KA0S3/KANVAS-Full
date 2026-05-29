export const SITE_ORIGIN = import.meta.env.VITE_SITE_ORIGIN || "https://kanvas-it.com";
export const SITE_URL = import.meta.env.VITE_SITE_URL || SITE_ORIGIN;
export const LICENSE_API_URL = import.meta.env.VITE_LICENSE_API_URL || "https://<project-ref>.supabase.co/functions/v1";

export const MAX_DEMO_BOOKS = 1;
export const MAX_DEMO_ASSETS = 100;
export const MAX_DEMO_UPLOAD_BYTES = 2 * 1024 * 1024;

export function formatRandPrice(amount: number, locale = typeof navigator !== "undefined" ? navigator.language : "en-ZA"): string {
  return new Intl.NumberFormat(locale || "en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export { centsToRand, PAYSTACK_CALLBACK_URL, PAYSTACK_PRODUCTS, PAYSTACK_WEBHOOK_URL, type PaystackProductKey } from "./paystackProducts";
