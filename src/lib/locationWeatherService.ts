/**
 * Location + Weather Service
 *
 * Captures ambient context (city, weather) at the time of writing a journal entry.
 * Privacy notes:
 * - Browser Geolocation API provides coordinates; only city/region is stored.
 * - Coordinates are sent to Open-Meteo (weather) and Nominatim (reverse geocoding)
 *   — both are free, open services; no API key required.
 * - This feature is opt-in (journal.autoLocationWeather = false by default).
 */

import { fetch } from '@tauri-apps/plugin-http';
import type { LocationWeather } from '../types/journal';

// WMO weather interpretation codes → human-readable label
const WMO_CONDITIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Freezing drizzle', 57: 'Heavy freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

/** Emoji for a WMO weather code, for display in the writing view. */
export function getWeatherEmoji(code: number | undefined): string {
  if (code === undefined) return '🌡';
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫';
  if (code <= 57) return '🌦';
  if (code <= 67) return '🌧';
  if (code <= 77) return '🌨';
  if (code <= 82) return '🌦';
  if (code <= 86) return '🌨';
  return '⛈';
}

/**
 * Format a temperature in Celsius for display, converting to °F if the user's
 * temperatureUnit preference is 'F'. Defaults to Celsius if unit is omitted.
 */
export function displayTemp(celsius: number, unit: 'C' | 'F' = 'C'): string {
  if (unit === 'F') {
    return `${Math.round(celsius * 9 / 5 + 32)}°F`;
  }
  return `${Math.round(celsius)}°C`;
}

interface OpenMeteoResponse {
  current_weather?: {
    temperature: number;
    weathercode: number;
  };
}

interface NominatimResponse {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
  };
}

/**
 * Capture current location + weather context.
 *
 * Returns a LocationWeather object on success, or null if geolocation is
 * denied, unavailable, or any network request fails.
 *
 * Never throws — all errors are handled internally.
 */
export async function captureLocationWeather(): Promise<LocationWeather | null> {
  try {
    // 1. Get device location (requires user permission)
    const position = await getGeolocation();
    const { latitude, longitude } = position.coords;

    // 2. Fetch weather + reverse geocode in parallel
    const [weatherResult, geoResult] = await Promise.allSettled([
      fetchWeather(latitude, longitude),
      fetchReverseGeocode(latitude, longitude),
    ]);

    const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
    const geo = geoResult.status === 'fulfilled' ? geoResult.value : null;

    // Need at least some data to be useful
    if (!weather && !geo) return null;

    const addr = geo?.address ?? {};
    const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality;
    const region = addr.state;
    const cw = weather?.current_weather;

    return {
      city,
      region,
      condition: cw ? (WMO_CONDITIONS[cw.weathercode] ?? 'Unknown') : undefined,
      temperature: cw ? Math.round(cw.temperature * 10) / 10 : undefined,
      weatherCode: cw?.weathercode,
      capturedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function getGeolocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 6000,
      maximumAge: 5 * 60 * 1000, // Accept cached position up to 5 minutes old
    });
  });
}

async function fetchWeather(
  lat: number,
  lon: number
): Promise<OpenMeteoResponse> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current_weather=true&forecast_days=1`;
  const resp = await fetch(url);
  return resp.json() as Promise<OpenMeteoResponse>;
}

async function fetchReverseGeocode(
  lat: number,
  lon: number
): Promise<NominatimResponse> {
  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=json&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&zoom=10`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'MoodBloom/1.0 (personal journal app)',
      'Accept-Language': 'en',
    },
  });
  return resp.json() as Promise<NominatimResponse>;
}
