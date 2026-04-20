import { useState, useEffect } from 'react';

// Cache to prevent duplicate API calls for the exact same route
const routingCache = new Map<string, { distanceKm: number; durationMin: number }>();

export function useOsrmRouting(lat1?: number, lon1?: number, lat2?: number, lon2?: number, mode: 'WALKING' | 'DRIVING' | 'TRANSIT' = 'TRANSIT') {
  const [data, setData] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lat1 || !lon1 || !lat2 || !lon2) {
      setData(null);
      return;
    }

    // OSRM supports moving by 'driving', 'foot', and 'bike'.
    // We map 'WALKING' to 'foot'. For both 'DRIVING' and 'TRANSIT' (as fallback proxy), we use 'driving'.
    const osrmMode = mode === 'WALKING' ? 'foot' : 'driving';
    
    // OSRM URL format: {lon},{lat};{lon},{lat}
    const key = `${osrmMode}:${lon1.toFixed(5)},${lat1.toFixed(5)};${lon2.toFixed(5)},${lat2.toFixed(5)}`;
    
    if (routingCache.has(key)) {
      setData(routingCache.get(key)!);
      return;
    }

    setLoading(true);
    const url = `https://router.project-osrm.org/route/v1/${osrmMode}/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    
    let isMounted = true;
    
    fetch(url)
      .then(res => res.json())
      .then(result => {
        if (!isMounted) return;
        if (result.code === 'Ok' && result.routes && result.routes.length > 0) {
          const route = result.routes[0];
          const calculatedData = { 
             distanceKm: route.distance / 1000, 
             durationMin: Math.ceil(route.duration / 60) 
          };
          routingCache.set(key, calculatedData);
          setData(calculatedData);
        } else {
          setData(null);
        }
      })
      .catch((err) => {
        console.error('OSRM fetch error:', err);
        if (isMounted) setData(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
      
    return () => {
      isMounted = false;
    };
  }, [lat1, lon1, lat2, lon2, mode]);

  return { data, loading };
}
