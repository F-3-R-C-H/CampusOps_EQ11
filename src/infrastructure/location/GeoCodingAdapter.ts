import type { CourseHttpClient } from '../http/CourseHttpClient';
import { LocationCache, type GeocodingResult } from './LocationCache';

export type GeocodingHttpClient = Pick<CourseHttpClient, 'requestJson'>;

function parseGeocodingResult(input: unknown): GeocodingResult | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;

  const value = input as Record<string, unknown>;
  if (typeof value.label !== 'string' || value.label.trim().length === 0) return null;
  if (
    typeof value.latitude !== 'number'
    || typeof value.longitude !== 'number'
    || !Number.isFinite(value.latitude)
    || !Number.isFinite(value.longitude)
    || value.latitude < -90
    || value.latitude > 90
    || value.longitude < -180
    || value.longitude > 180
  ) {
    return null;
  }

  return {
    label: value.label,
    latitude: value.latitude,
    longitude: value.longitude,
  };
}

export class GeoCodingAdapter {
  constructor(
    private readonly httpClient: GeocodingHttpClient,
    private readonly cache = new LocationCache(),
  ) {}

  async geocode(query: string): Promise<GeocodingResult | null> {
    const requestQuery = query.trim();
    if (requestQuery.length === 0) return null;

    const cached = this.cache.get(query);
    if (cached) return cached;

    try {
      const response = await this.httpClient.requestJson({
        method: 'GET',
        path: `/v1/geocoding?q=${encodeURIComponent(requestQuery)}`,
      });
      if (!response.ok) return null;

      const result = parseGeocodingResult(response.data);
      if (!result) return null;

      this.cache.set(query, result);
      return result;
    } catch {
      return null;
    }
  }
}
