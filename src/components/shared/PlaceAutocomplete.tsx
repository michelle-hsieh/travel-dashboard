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
  onSelect: (result: { name: string; address: string; lat: number; lng: number; placeLink: string }) => void;
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        handleSelect(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setEditing(false);
      setResults([]);
      setQuery(value);
    }
  };

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
      {(results.length > 0 || loading) && (
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
          maxHeight: 260,
          overflowY: 'auto',
          marginTop: 2,
        }}>
          {loading && results.length === 0 && (
            <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              搜尋中...
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
        </div>
      )}
    </div>
  );
}
