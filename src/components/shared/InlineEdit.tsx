import { useState, useEffect, useRef, KeyboardEvent } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  tag?: 'span' | 'h1' | 'h2' | 'h3' | 'p';
  className?: string;
  multiline?: boolean;
  style?: React.CSSProperties;
  readOnly?: boolean;
}

export default function InlineEdit({
  value,
  onSave,
  placeholder = '點擊編輯...',
  tag: Tag = 'span',
  className = '',
  multiline = false,
  style,
  readOnly = false,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) {
      onSave(draft.trim());
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      commit();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing && !readOnly) {
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className={`inline-edit-input ${className}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          rows={3}
          style={{ width: '100%', resize: 'vertical', ...style }}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        className={`inline-edit-input ${className}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        style={style}
      />
    );
  }

  const handleClick = () => {
    if (!readOnly) {
      setEditing(true);
    }
  };

  return (
    <Tag
      className={`inline-edit ${className} ${readOnly ? 'read-only' : ''}`}
      onClick={handleClick}
      tabIndex={readOnly ? -1 : 0}
      onFocus={handleClick}
      style={{
        ...(!value ? { color: 'var(--text-muted)' } : {}),
        ...style,
        cursor: readOnly ? 'default' : 'pointer'
      }}
    >
      {value || placeholder}
    </Tag>
  );
}
