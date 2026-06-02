import { minorUnitsToMajor, PAYSTACK_PRODUCTS, type PaystackProductKey } from "./config";

type ExchangeRatesResponse = {
  rates?: Record<string, number>;
};

type CountryLookupResponse = {
  country_code?: string;
  currency?: string;
};

export type ApproximatePricing = {
  currency: string;
  products: Partial<Record<PaystackProductKey, string>>;
  betaSupporterTotal: string;
};

const COUNTRY_LOOKUP_TIMEOUT_MS = 1800;

const withTimeout = async <T>(request: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("country_lookup_timeout")), timeoutMs);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const formatApproximatePrice = (majorAmount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat(typeof navigator !== "undefined" ? navigator.language : "en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(majorAmount).replace(/\s+/g, " ").trim();
  } catch {
    return `${majorAmount.toFixed(0)} ${currency}`;
  }
};

const getLikelyCurrency = async (): Promise<string | null> => {
  try {
    const response = await withTimeout(fetch("https://ipapi.co/json/"), COUNTRY_LOOKUP_TIMEOUT_MS);
    if (!response.ok) {
      return null;
    }

    const data = await response.json() as CountryLookupResponse;
    const currency = data.currency?.trim().toUpperCase();
    if (!currency || data.country_code?.trim().toUpperCase() === "ZA") {
      return null;
    }

    return currency;
  } catch {
    return null;
  }
};

export async function getApproximatePricing(): Promise<ApproximatePricing | null> {
  const currency = await getLikelyCurrency();
  if (!currency || currency === "ZAR") {
    return null;
  }

  try {
    const response = await fetch("https://api.exchangerate-api.com/v4/latest/ZAR");
    if (!response.ok) {
      return null;
    }

    const data = await response.json() as ExchangeRatesResponse;
    const rate = data.rates?.[currency];
    if (!Number.isFinite(rate) || !rate) {
      return null;
    }

    const productKeys = Object.keys(PAYSTACK_PRODUCTS) as PaystackProductKey[];
    const betaSupporterTotalAmount = PAYSTACK_PRODUCTS.BETA_ACCESS.amount + PAYSTACK_PRODUCTS.BETA_TO_STABLE_UPGRADE.amount;
    return {
      currency,
      products: Object.fromEntries(
        productKeys.map((key) => {
          const product = PAYSTACK_PRODUCTS[key];
          const approximateMajor = minorUnitsToMajor(product.amount) * rate;
          return [key, formatApproximatePrice(approximateMajor, currency)];
        }),
      ),
      betaSupporterTotal: formatApproximatePrice(minorUnitsToMajor(betaSupporterTotalAmount) * rate, currency),
    };
  } catch {
    return null;
  }
}
