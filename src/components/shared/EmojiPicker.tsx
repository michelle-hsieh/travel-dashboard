import { useState, useRef, useEffect } from 'react';

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: '食事', emojis: ['🍜', '🍣', '🍱', '🍙', '🍛', '🍵', '🍺', '🍰', '🍡', '🍢', '☕', '🧋'] },
  { label: '観光', emojis: ['⛩️', '🏯', '🎎', '🌸', '🗻', '🌊', '🏛️', '🎭', '🖼️', '📸', '🌅', '🌙'] },
  { label: '買物', emojis: ['🛍️', '🎁', '🏪', '🏬', '💊', '👘', '🎋', '🧧', '💎', '🪭', '📦', '🛒'] },
  { label: '交通', emojis: ['🚶', '🚃', '🚌', '🚗', '🚕', '🚢', '🚲', '🛴', '🚠', '⛴️', '🛤️', '🚏'] },
  { label: '娯楽', emojis: ['🎮', '🎪', '🎢', '♨️', '🛁', '🎤', '🎬', '🎵', '🎲', '🏊', '⛷️', '🎳'] },
  { label: '自然', emojis: ['🌳', '🌿', '🦌', '🐒', '🐟', '🦢', '🌺', '🍁', '🍂', '⛰️', '🏞️', '🌾'] },
  { label: 'その他', emojis: ['📍', '⭐', '❤️', '🔥', '✨', '💤', '🎒', '📝', '🏠', '🔔', '🎯', '🚩'] },
];

interface EmojiPickerProps {
  value?: string;
  fallback: string;
  onSelect: (emoji: string | undefined) => void;
  readOnly?: boolean;
}

export default function EmojiPicker({ value, fallback, onSelect, readOnly = false }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => !readOnly && setOpen(!open)}
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          fontSize: '1.4rem',
          fontWeight: 700,
          cursor: readOnly ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          lineHeight: 1,
        }}
        title={readOnly ? undefined : "更換圖示"}
      >
        {value || fallback}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 200,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          padding: '8px',
          width: 280,
          maxHeight: 320,
          overflowY: 'auto',
          marginTop: 4,
        }}>
          {/* Reset to number */}
          <button
            onClick={() => { onSelect(undefined); setOpen(false); }}
            style={{
              width: '100%',
              padding: '4px 8px',
              marginBottom: 4,
              fontSize: '0.75rem',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            重設為 {fallback}
          </button>
          {EMOJI_GROUPS.map(group => (
            <div key={group.label}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 2px 2px', fontWeight: 600 }}>
                {group.label}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {group.emojis.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => { onSelect(emoji); setOpen(false); }}
                    style={{
                      width: 36,
                      height: 36,
                      fontSize: '1.3rem',
                      border: emoji === value ? '2px solid var(--accent)' : '1px solid transparent',
                      borderRadius: 8,
                      background: emoji === value ? 'var(--bg-hover)' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
