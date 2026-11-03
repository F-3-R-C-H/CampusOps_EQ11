export type GeocodingResult = Readonly<{
  label: string;
  latitude: number;
  longitude: number;
}>;

export type LocationCacheOptions = Readonly<{
  ttlMs?: number;
  now?: () => number;
}>;

type CacheEntry = Readonly<{
  value: GeocodingResult;
  storedAt: number;
}>;

export const DEFAULT_LOCATION_CACHE_TTL_MS = 300_000;

export function normalizeLocationQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function copyResult(result: GeocodingResult): GeocodingResult {
  return {
    label: result.label,
    latitude: result.latitude,
    longitude: result.longitude,
  };
}

/** In-memory cache. Invalid TTL values are rejected instead of silently disabling expiry. */
export class LocationCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: LocationCacheOptions = {}) {
    const ttlMs = options.ttlMs ?? DEFAULT_LOCATION_CACHE_TTL_MS;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError('Location cache TTL must be a positive finite number');
    }
    this.ttlMs = ttlMs;
    this.now = options.now ?? Date.now;
  }

  get(query: string): GeocodingResult | null {
    const key = normalizeLocationQuery(query);
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (this.now() - entry.storedAt >= this.ttlMs) {
      this.entries.delete(key);
      return null;
    }

    return copyResult(entry.value);
  }

  set(query: string, result: GeocodingResult): void {
    this.entries.set(normalizeLocationQuery(query), {
      value: copyResult(result),
      storedAt: this.now(),
    });
  }
}
