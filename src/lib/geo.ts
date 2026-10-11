import { useCallback, useEffect, useState } from "react";

export type Coords = { latitude: number; longitude: number };

const STORAGE_KEY = "mealmate.coords.v1";

/** Great-circle distance in kilometres. */
export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(km: number | null): string {
  if (km === null || !Number.isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

function readCached(): Coords | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Coords;
    if (typeof parsed?.latitude === "number" && typeof parsed?.longitude === "number") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type GeoState = "idle" | "prompting" | "granted" | "denied" | "unsupported";

/**
 * Location is only ever read after the user explicitly asks for it (or when a
 * previous grant was cached in this browser).
 */
export function useUserLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [state, setState] = useState<GeoState>("idle");

  useEffect(() => {
    const cached = readCached();
    if (cached) {
      setCoords(cached);
      setState("granted");
    }
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unsupported");
      return;
    }
    setState("prompting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCoords(next);
        setState("granted");
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      },
      () => setState("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  const clear = useCallback(() => {
    setCoords(null);
    setState("idle");
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { coords, state, request, clear };
}

type Hours = Record<string, { open?: string; close?: string; closed?: boolean } | undefined>;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export const OPENING_DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;

function minutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Is the restaurant open right now, per its opening_hours JSON? */
export function isOpenNow(openingHours: unknown, now = new Date()): boolean | null {
  if (!openingHours || typeof openingHours !== "object") return null;
  const hours = openingHours as Hours;
  const key = DAY_KEYS[now.getDay()]!;
  const today = hours[key];
  if (!today) return null;
  if (today.closed) return false;
  const open = today.open ? minutes(today.open) : null;
  const close = today.close ? minutes(today.close) : null;
  if (open === null || close === null) return null;
  const cur = now.getHours() * 60 + now.getMinutes();
  // Handle past-midnight closing (e.g. 18:00 → 02:00)
  if (close <= open) return cur >= open || cur < close;
  return cur >= open && cur < close;
}
