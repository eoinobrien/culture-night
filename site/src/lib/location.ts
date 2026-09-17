import type { Geocode } from "../interfaces/geocode";

export type UserLocation = Geocode & { accuracy: number };
export type MapViewportRequest = { location?: UserLocation };

export class LocationDataError extends Error {}

export function readLocation(coords: Pick<GeolocationCoordinates, "latitude" | "longitude" | "accuracy">): UserLocation {
  const { latitude: lat, longitude: lng, accuracy } = coords;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180 ||
      !Number.isFinite(accuracy) || accuracy < 0) {
    throw new LocationDataError("The browser returned an invalid location.");
  }
  return { lat, lng, accuracy };
}

export function locationErrorMessage(code: number): string {
  if (code === 1) return "Location permission was denied. Allow it in your browser or search by town instead.";
  if (code === 3) return "Finding your location timed out. Try again or search by town instead.";
  return "Your location could not be found. Try again or search by town instead.";
}
