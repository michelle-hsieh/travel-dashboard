import { useCallback } from 'react';

export interface PlaceLookupResult {
  address: string;
  lat: number;
  lng: number;
  placeLink: string;
}

export function usePlacesLookup() {
  const lookupPlace = useCallback(
    async (name: string): Promise<PlaceLookupResult | null> => {
      if (!name.trim()) return null;

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          new URLSearchParams({
            q: name,
            format: 'json',
            limit: '1',
            addressdetails: '1',
          }),
          { headers: { 'Accept-Language': 'ja,en' } }
        );

        if (!res.ok) return null;
        const data = await res.json();
        if (!data || data.length === 0) return null;

        const place = data[0];
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lon);

        return {
          address: place.display_name || '',
          lat,
          lng,
          placeLink: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
        };
      } catch {
        return null;
      }
    },
    []
  );

  return {
    lookupPlace,
    isReady: true,
  };
}
