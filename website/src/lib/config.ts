import { FALLBACK_PAYMENT_CURRENCY } from "./paystackProducts";

export const SITE_ORIGIN = import.meta.env.VITE_SITE_ORIGIN || "https://www.kanvas-it.com";
export const SITE_URL = import.meta.env.VITE_SITE_URL || SITE_ORIGIN;
export const LICENSE_API_URL = import.meta.env.VITE_LICENSE_API_URL || "https://hzngfqebklzhnwkcmgto.supabase.co/functions/v1";
export const PAYSTACK_TEST_MODE = String(import.meta.env.VITE_PAYSTACK_TEST_MODE ?? "true").toLowerCase() === "true";
export const DOWNLOAD_OWNER_CODE = import.meta.env.VITE_DOWNLOAD_OWNER_CODE || "kaos3";

export const MAX_DEMO_BOOKS = 1;
export const MAX_DEMO_ASSETS = 100;
export const MAX_DEMO_UPLOAD_BYTES = 2 * 1024 * 1024;

export function minorUnitsToMajor(amount: number): number {
  return amount / 100;
}

const FALLBACK_CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  GBP: "£",
  USD: "$",
  ZAR: "R",
};

export type ProductPriceDisplay = {
  currency: string;
  text: string;
};

export function formatProductPrice(amount: number, currency: string, locale = typeof navigator !== "undefined" ? navigator.language : "en-ZA"): string {
  const display = formatProductPriceDisplay(amount, currency, locale);
  return `${display.text} ${display.currency}`;
}

export function formatProductPriceDisplay(amount: number, currency: string, locale = typeof navigator !== "undefined" ? navigator.language : "en-ZA"): ProductPriceDisplay {
  const safeCurrency = currency || FALLBACK_PAYMENT_CURRENCY;
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  try {
    const text = new Intl.NumberFormat(locale || "en-ZA", {
      style: "currency",
      currency: safeCurrency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(minorUnitsToMajor(safeAmount));

    return {
      currency: safeCurrency,
      text: text.replace(/\s+/g, " ").trim(),
    };
  } catch {
    const fallbackCurrency = FALLBACK_PAYMENT_CURRENCY;
    const fallbackSymbol = FALLBACK_CURRENCY_SYMBOLS[fallbackCurrency] || fallbackCurrency;
    return {
      currency: fallbackCurrency,
      text: `${fallbackSymbol}${minorUnitsToMajor(safeAmount).toFixed(0)}`,
    };
  }
}

export { PAYSTACK_CALLBACK_URL, PAYSTACK_PRODUCTS, PAYSTACK_WEBHOOK_URL, type PaystackProductKey } from "./paystackProducts";
