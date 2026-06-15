// Trademark data provider.
//
// USPTO's own search backend (tmsearch.uspto.gov) sits behind Akamai
// bot-protection and resets server-side connections, so we can't call it
// directly from a website. Instead we use the RapidAPI "uspto-trademark"
// bridge, which serves the same live USPTO records over a clean JSON API.
//
// This module is the only place that knows about the upstream API. Swap the
// implementation here (e.g. for a different provider or a cached datastore)
// without touching the route or the UI.

export type TrademarkStatus =
  | "live"
  | "dead"
  | "pending"
  | "unknown";

export interface TrademarkOwner {
  name: string;
  address?: string;
}

export interface TrademarkRecord {
  wordmark: string;
  serialNumber?: string;
  registrationNumber?: string;
  status: TrademarkStatus;
  statusLabel: string;
  filingDate?: string;
  registrationDate?: string;
  description?: string;
  owners: TrademarkOwner[];
}

export interface SearchResult {
  query: string;
  exactConflict: boolean; // true if a LIVE mark exactly matches the query
  total: number;
  records: TrademarkRecord[];
}

import { getCached, setCached } from "@/lib/cache";

// Trademark registrations change slowly; a day-long cache is safe and saves a
// large share of the monthly API quota on repeated searches.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const RAPIDAPI_HOST = "uspto-trademark.p.rapidapi.com";

// Map the upstream status label to a coarse, UI-friendly status.
function normalizeStatus(label: string | undefined): TrademarkStatus {
  if (!label) return "unknown";
  const l = label.toLowerCase();
  if (l.includes("dead") || l.includes("abandon") || l.includes("cancel") || l.includes("expired")) {
    return "dead";
  }
  if (l.includes("pending") || l.includes("opposition") || l.includes("examination") || l.includes("published")) {
    return "pending";
  }
  if (l.includes("live") || l.includes("registered") || l.includes("renewed")) {
    return "live";
  }
  return "unknown";
}

interface UpstreamOwner {
  name?: string;
  address1?: string;
  city?: string;
  state?: string;
  postcode?: string;
}

interface UpstreamItem {
  keyword?: string;
  serial_number?: string;
  registration_number?: string;
  status_label?: string;
  status_code?: string;
  filing_date?: number | string;
  registration_date?: number | string;
  description?: string;
  owners?: UpstreamOwner[];
}

function toDate(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null || value === "" || value === 0) return undefined;
  // Upstream sometimes returns a unix timestamp (seconds), sometimes a string.
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
}

function mapItem(item: UpstreamItem): TrademarkRecord {
  const owners: TrademarkOwner[] = (item.owners ?? []).map((o) => ({
    name: o.name ?? "Unknown owner",
    address: [o.address1, o.city, o.state, o.postcode].filter(Boolean).join(", ") || undefined,
  }));

  return {
    wordmark: item.keyword ?? "(no word mark)",
    serialNumber: item.serial_number || undefined,
    registrationNumber: item.registration_number || undefined,
    status: normalizeStatus(item.status_label),
    statusLabel: item.status_label ?? "Unknown",
    filingDate: toDate(item.filing_date),
    registrationDate: toDate(item.registration_date),
    description: item.description || undefined,
    owners,
  };
}

/**
 * Search live + dead US trademarks whose word mark matches `term`.
 * Throws ProviderError on configuration or upstream failures.
 */
export async function searchTrademarks(term: string): Promise<SearchResult> {
  const query = term.trim();
  if (!query) {
    return { query, exactConflict: false, total: 0, records: [] };
  }

  // Serve identical searches from cache so they don't spend the API quota.
  const cacheKey = query.toLowerCase();
  const cached = getCached<SearchResult>(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    throw new ProviderError(
      "Trademark API is not configured. Set RAPIDAPI_KEY in .env.local (see README).",
      503,
    );
  }

  // "active" would hide dead marks; "all" lets us show the full history so the
  // user can judge whether a lapsed mark is relevant.
  const url = `https://${RAPIDAPI_HOST}/v1/trademarkSearch/${encodeURIComponent(query)}/all`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": apiKey,
      },
      // Don't let a slow upstream hang the request forever.
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch (err) {
    throw new ProviderError(
      `Could not reach the trademark service: ${(err as Error).message}`,
      502,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new ProviderError("Trademark API rejected the API key (401/403). Check RAPIDAPI_KEY.", 502);
  }
  if (res.status === 429) {
    throw new ProviderError("Trademark API rate limit reached. Try again shortly.", 429);
  }
  if (!res.ok) {
    throw new ProviderError(`Trademark service returned HTTP ${res.status}.`, 502);
  }

  const data = (await res.json()) as { count?: number; items?: UpstreamItem[] };
  const items = data.items ?? [];
  const records = items.map(mapItem);

  const exactConflict = records.some(
    (r) => r.status === "live" && r.wordmark.trim().toLowerCase() === query.toLowerCase(),
  );

  const result: SearchResult = {
    query,
    exactConflict,
    total: typeof data.count === "number" ? data.count : records.length,
    records,
  };

  setCached(cacheKey, result, CACHE_TTL_MS);
  return result;
}
