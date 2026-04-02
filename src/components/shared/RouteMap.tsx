import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons (Leaflet + bundlers issue)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function createLabelIcon(label: string) {
  const isEmoji = /^\p{Emoji}/u.test(label);
  const size = isEmoji ? 42 : 38;
  return L.divIcon({
    className: 'numbered-marker',
    html: `<div style="
      background: ${isEmoji ? 'transparent' : 'var(--accent, #4361ee)'};
      color: ${isEmoji ? 'inherit' : '#fff'};
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: ${isEmoji ? '32px' : '17px'};
      ${isEmoji ? '' : 'border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.35);'}
    ">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

interface RouteMapProps {
  places: { name: string; lat: number; lng: number; label?: string }[];
}

function FitBounds({ places }: { places: { lat: number; lng: number }[] }) {
  const map = useMap();
  const prevKey = useRef('');

  useEffect(() => {
    if (!map || places.length === 0) return;
    const key = places.map(p => `${p.lat},${p.lng}`).join(';');
    if (key === prevKey.current) return;
    prevKey.current = key;

    try {
      const bounds = L.latLngBounds(places.map(p => [p.lat, p.lng]));
      // ✅ 停用動畫 (animate: false) 以避免切換頁面時的 Leaflet 內部競態條件
      map.fitBounds(bounds, { 
        padding: [40, 40], 
        maxZoom: 15,
        animate: false 
      });
    } catch (e) {
      console.warn('Map fitBounds failed:', e);
    }
  }, [places, map]);

  return null;
}

export function RouteMap({ places }: RouteMapProps) {
  if (places.length === 0) return null;

  const center: [number, number] = [places[0].lat, places[0].lng];

  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ width: '100%', height: '100%' }}
      scrollWheelZoom={true}
    >
      <TileLayer
        url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        maxZoom={20}
      />
      <FitBounds places={places} />
      {places.map((p, i) => (
        <Marker key={`${p.lat}-${p.lng}-${i}`} position={[p.lat, p.lng]} icon={createLabelIcon(p.label || `${i + 1}`)}>
          <Popup>{`#${i + 1} ${p.name}`}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export default RouteMap;
