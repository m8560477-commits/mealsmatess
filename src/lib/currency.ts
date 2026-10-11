// Centralised pricing service. All prices flow through here so a currency
// change instantly propagates everywhere in the UI.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

export type CurrencyCode =
  | "USD" | "ZAR" | "EUR" | "GBP" | "AUD" | "CAD" | "NZD";

export const CURRENCY_META: Record<CurrencyCode, { symbol: string; locale: string; name: string }> = {
  USD: { symbol: "$", locale: "en-US", name: "US Dollar" },
  ZAR: { symbol: "R", locale: "en-ZA", name: "South African Rand" },
  EUR: { symbol: "€", locale: "en-IE", name: "Euro" },
  GBP: { symbol: "£", locale: "en-GB", name: "British Pound" },
  AUD: { symbol: "A$", locale: "en-AU", name: "Australian Dollar" },
  CAD: { symbol: "C$", locale: "en-CA", name: "Canadian Dollar" },
  NZD: { symbol: "NZ$", locale: "en-NZ", name: "New Zealand Dollar" },
};

// Static FX rates from USD. Live rates can replace this map later without
// touching any component code.
const USD_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  ZAR: 18.5,
  EUR: 0.92,
  GBP: 0.79,
  AUD: 1.52,
  CAD: 1.36,
  NZD: 1.65,
};

// Master price list — USD is canonical. RevenueCat / store products map
// to these keys.
export const PRICES_USD = {
  premium_monthly: 9.99,
  premium_annual: 75.0,
  family_monthly: 12.99,
  family_annual: 99.99,
  referral_reward_days: 14,
} as const;
export type PriceKey = keyof typeof PRICES_USD;

export function convertFromUsd(amountUsd: number, to: CurrencyCode): number {
  const rate = USD_RATES[to] ?? 1;
  return amountUsd * rate;
}

export function formatPrice(amountUsd: number, currency: CurrencyCode): string {
  const meta = CURRENCY_META[currency] ?? CURRENCY_META.USD;
  const value = convertFromUsd(amountUsd, currency);
  try {
    return new Intl.NumberFormat(meta.locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${meta.symbol}${value.toFixed(2)}`;
  }
}

export function price(key: PriceKey, currency: CurrencyCode): string {
  return formatPrice(PRICES_USD[key], currency);
}

const REGION_CURRENCY: Record<string, CurrencyCode> = {
  US: "USD", ZA: "ZAR", GB: "GBP",
  IE: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", PT: "EUR",
  AT: "EUR", BE: "EUR", FI: "EUR", GR: "EUR",
  AU: "AUD", CA: "CAD", NZ: "NZD",
};

export function detectCurrency(): CurrencyCode {
  if (typeof navigator === "undefined") return "USD";
  const region =
    Intl.DateTimeFormat().resolvedOptions().locale?.split("-")?.[1]?.toUpperCase() ?? "";
  return REGION_CURRENCY[region] ?? "USD";
}

// ---- Hook: single source of truth for the user's active currency ----
export function useCurrency(): {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => Promise<void>;
} {
  const { user } = useSession();
  const [currency, setCurrencyState] = useState<CurrencyCode>("USD");

  const { data } = useQuery({
    queryKey: ["currency", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("currency")
        .eq("id", user!.id)
        .maybeSingle();
      return (data as { currency?: string } | null)?.currency ?? null;
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("mealmate-currency") as CurrencyCode | null;
    const next = (data as CurrencyCode | null) ?? stored ?? detectCurrency();
    setCurrencyState(next);
  }, [data]);

  async function setCurrency(next: CurrencyCode) {
    setCurrencyState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("mealmate-currency", next);
      window.dispatchEvent(new CustomEvent("mealmate-currency-changed", { detail: next }));
    }
    if (user) {
      await supabase.from("profiles").update({ currency: next } as never).eq("id", user.id);
    }
  }

  // Cross-component reactivity when currency changes without React state.
  useEffect(() => {
    function onChange(e: Event) {
      const d = (e as CustomEvent<CurrencyCode>).detail;
      if (d) setCurrencyState(d);
    }
    window.addEventListener("mealmate-currency-changed", onChange);
    return () => window.removeEventListener("mealmate-currency-changed", onChange);
  }, []);

  return { currency, setCurrency };
}
