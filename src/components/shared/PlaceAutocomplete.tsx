import { useState, useEffect, useRef, useCallback } from 'react';
import { OpenStreetMapProvider } from 'leaflet-geosearch';

interface PlaceResult {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
}

interface PlaceAutocompleteProps {
  value: string;
  onSelect: (result: { name: string; address: string; lat: number; lng: number; placeLink: string; icon?: string }) => void;
  placeholder?: string;
}

export default function PlaceAutocomplete({ value, onSelect, placeholder = '搜尋地點...' }: PlaceAutocompleteProps) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
        setResults([]);
        setQuery(value); // revert
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editing, value]);

  const search = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); return; }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const provider = new OpenStreetMapProvider({
          params: {
            'accept-language': 'zh-TW,ja,en',
            countrycodes: 'jp,tw',
            addressdetails: 1,
            limit: 6
          }
        });
        const res = await provider.search({ query: q });
        setResults(
          res.map((item: any) => {
            const raw = item.raw || {};
            const name = raw.address?.name || raw.address?.poi || raw.display_name?.split(',')[0] || item.label.split(',')[0];
            return {
              name,
              displayName: item.label,
              lng: item.x,
              lat: item.y,
            };
          })
        );
        setActiveIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  const handleSelect = (r: PlaceResult) => {
    onSelect({
      name: r.name,
      address: r.displayName,
      lat: r.lat,
      lng: r.lng,
      placeLink: `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`,
    });
    setQuery(r.name);
    setEditing(false);
    setResults([]);
  };

  const extractCoords = (q: string) => {
    // 1. Priority: Extract precise pin from !3d and !4d parameters (Google's True Marker)
    const pinMatch = q.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (pinMatch) return { lat: parseFloat(pinMatch[1]), lng: parseFloat(pinMatch[2]) };

    // 2. Secondary: Raw lat,lng (e.g., 34.985, 135.758)
    const rawMatch = q.match(/^([-+]?([1-8]?\d(\.\d+)?|90(\.0+)?)),\s*([-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?))$/);
    if (rawMatch) return { lat: parseFloat(rawMatch[1]), lng: parseFloat(rawMatch[5]) };

    // 3. Fallback: Google Maps URL map camera center (@)
    const urlMatch = q.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (urlMatch) return { lat: parseFloat(urlMatch[1]), lng: parseFloat(urlMatch[2]) };

    // 4. Simple comma split if it looks like coordinates
    const simpleParts = q.split(',').map(s => s.trim());
    if (simpleParts.length === 2) {
      const lat = parseFloat(simpleParts[0]);
      const lng = parseFloat(simpleParts[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }

    return null;
  };

  const extractName = (q: string) => {
    // Extract name from /place/NAME/... or /search/NAME/...
    const nameMatch = q.match(/\/(?:place|search)\/([^/@?]+)/);
    if (nameMatch) {
      try {
        return decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      } catch {
        return nameMatch[1].replace(/\+/g, ' ');
      }
    }
    return null;
  };

  const handleMapImport = async (lat: number, lng: number, manualName?: string | null) => {
    setLoading(true);
    try {
      // ✅ Use Reverse Geocoding (Nominatim /reverse) to get the address
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=zh-TW,ja,en`);
      const data = await res.json();

      const geoName = data.address?.name || data.address?.poi || data.display_name?.split(',')[0];
      const finalName = manualName || geoName || `座標地點 (${lat.toFixed(4)})`;

      onSelect({
        name: finalName,
        address: data.display_name || `(座標: ${lat}, ${lng})`,
        lat,
        lng,
        placeLink: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      });
      setQuery(finalName);
    } catch {
      const finalName = manualName || `座標地點 (${lat.toFixed(4)})`;
      onSelect({
        name: finalName,
        address: `(座標: ${lat}, ${lng})`,
        lat,
        lng,
        placeLink: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      });
      setQuery(finalName);
    } finally {
      setEditing(false);
      setResults([]);
      setLoading(false);
    }
  };

  const handleManualEntry = async () => {
    if (!query.trim()) return;
    const coords = extractCoords(query);
    const manualName = extractName(query);
    if (coords) {
      return handleMapImport(coords.lat, coords.lng, manualName);
    }

    setLoading(true);
    try {
      const provider = new OpenStreetMapProvider({
        params: { 'accept-language': 'zh-TW,ja,en', limit: 1 }
      });
      const res = await provider.search({ query: query });
      if (res && res.length > 0) {
        const first = res[0];
        onSelect({
          name: query,
          address: first.label,
          lat: first.y,
          lng: first.x,
          placeLink: `https://www.google.com/maps/search/?api=1&query=${first.y},${first.x}`,
        });
      }
    } catch {
      // Ignore
    } finally {
      setQuery(query);
      setEditing(false);
      setResults([]);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // +1 to results for the map import option if found
      setActiveIndex(i => Math.min(i + 1, results.length + (coordsFound ? 0 : -1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) {
        handleSelect(results[activeIndex]);
      } else if (coordsFound && (activeIndex === results.length || results.length === 0)) {
        handleMapImport(coordsFound.lat, coordsFound.lng, extractName(query));
      }
    } else if (e.key === 'Escape') {
      setEditing(false);
      setResults([]);
      setQuery(value);
    }
  };

  const coordsFound = extractCoords(query);

  if (!editing) {
    return (
      <h3
        className="inline-edit"
        onClick={() => setEditing(true)}
        tabIndex={0}
        onFocus={() => setEditing(true)}
        style={!value ? { color: 'var(--text-muted)' } : undefined}
      >
        {value || placeholder}
      </h3>
    );
  }

  const showDropdown = editing && (loading || results.length > 0 || (query.trim() && !loading));

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        className="inline-edit-input"
        value={query}
        onChange={e => { setQuery(e.target.value); search(e.target.value); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxHeight: 300,
          overflowY: 'auto',
          marginTop: 2,
        }}>
          {loading && results.length === 0 && (
            <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              搜尋中...
            </div>
          )}

          {!loading && results.length === 0 && query.trim() && !coordsFound && (
            <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <div>找不到地點 🤷‍♀️</div>
              <div style={{ marginTop: 4, fontSize: '0.7rem' }}>試試貼上 Google Maps 網址 (非短網址)</div>
            </div>
          )}

          {/* Special Option: Parse Link/Coords */}
          {coordsFound && (
            <div
              onClick={() => handleMapImport(coordsFound.lat, coordsFound.lng, extractName(query))}
              style={{
                padding: '12px',
                cursor: 'pointer',
                background: activeIndex === results.length ? 'var(--accent)' : 'rgba(var(--accent-rgb, 176,141,122), 0.1)',
                color: activeIndex === results.length ? '#fff' : 'var(--accent)',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderBottom: results.length > 0 ? '1px solid var(--border)' : 'none'
              }}
              onMouseEnter={() => setActiveIndex(results.length)}
            >
              <span style={{ fontSize: '1.2rem' }}>📍</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.8rem' }}>從連結/座標解析位置</span>
                {extractName(query) && (
                  <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>名稱: {extractName(query)}</span>
                )}
              </div>
            </div>
          )}

          {results.map((r, i) => (
            <div
              key={`${r.lat}-${r.lng}-${i}`}
              onClick={() => handleSelect(r)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: i === activeIndex ? 'var(--accent)' : 'transparent',
                color: i === activeIndex ? '#fff' : 'inherit',
                borderBottom: i < results.length - 1 ? '1px solid var(--border)' : undefined,
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.name}</div>
              <div style={{ fontSize: '0.75rem', color: i === activeIndex ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)', marginTop: 2 }}>
                {r.displayName}
              </div>
            </div>
          ))}

          {/* Persistent Tip at the bottom */}
          {!loading && (
            <div style={{
              padding: '12px',
              borderTop: results.length > 0 ? '1px solid var(--border)' : 'none',
              background: 'rgba(var(--accent-rgb, 176,141,122), 0.04)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span>💡</span>
                <span>找不到或不夠精確？貼上 Google Maps 網址 (非短網址) 即可定位</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
