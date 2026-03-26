import { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import InlineEdit from '../components/shared/InlineEdit';
import FileUpload from '../components/shared/FileUpload';
import AttachmentList from '../components/shared/AttachmentList';
import PlaceAutocomplete from '../components/shared/PlaceAutocomplete';
import { parseFlightPdf } from '../utils/parseFlightPdf';
import type { Flight, Hotel, Ticket, ChecklistItem, BudgetItem } from '../types';

interface LogisticsPageProps {
  tripId: number;
}

type LogisticsTab = 'flights' | 'hotels' | 'tickets' | 'checklist' | 'budget';

export default function LogisticsPage({ tripId }: LogisticsPageProps) {
  const [activeTab, setActiveTab] = useState<LogisticsTab>('flights');

  const tabs: { key: LogisticsTab; label: string; icon: string }[] = [
    { key: 'flights', label: '機票', icon: '✈️' },
    { key: 'hotels', label: '住宿', icon: '🏨' },
    { key: 'tickets', label: '票券', icon: '🎫' },
    { key: 'checklist', label: '清單', icon: '✅' },
    { key: 'budget', label: '預算', icon: '💰' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>行程準備 📋</h1>
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'flights' && <FlightsSection tripId={tripId} />}
      {activeTab === 'hotels' && <HotelsSection tripId={tripId} />}
      {activeTab === 'tickets' && <TicketsSection tripId={tripId} />}
      {activeTab === 'checklist' && <ChecklistSection tripId={tripId} />}
      {activeTab === 'budget' && <BudgetSection tripId={tripId} />}
    </div>
  );
}

/* ===================== FLIGHTS ===================== */
function FlightsSection({ tripId }: { tripId: number }) {
  const flights = useLiveQuery(
    () => db.flights.where('tripId').equals(tripId).sortBy('sortOrder'),
    [tripId]
  );
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState('');

  const addFlight = async () => {
    await db.flights.add({
      tripId,
      airline: '',
      flightNo: '',
      departureTime: '',
      departureAirport: '',
      arrivalTime: '',
      arrivalAirport: '',
      sortOrder: flights?.length ?? 0,
    });
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseMsg('');
    try {
      const parsed = await parseFlightPdf(file);
      if (parsed.length === 0) {
        setParseMsg('未能從 PDF 中辨識航班資訊，請手動填寫。');
      } else {
        const base = flights?.length ?? 0;
        for (let i = 0; i < parsed.length; i++) {
          const p = parsed[i];
          await db.flights.add({
            tripId,
            airline: p.airline,
            flightNo: p.flightNo,
            departureAirport: p.departureAirport,
            departureTime: p.departureTime,
            arrivalAirport: p.arrivalAirport,
            arrivalTime: p.arrivalTime,
            confirmNo: p.confirmNo,
            amount: p.amount,
            currency: p.currency,
            sortOrder: base + i,
          });
        }
        setParseMsg(`已匯入 ${parsed.length} 筆航班資訊！`);
      }
    } catch {
      setParseMsg('PDF 解析失敗，請手動填寫。');
    } finally {
      setParsing(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const update = (id: number, data: Partial<Flight>) => db.flights.update(id, data);
  const remove = async (id: number) => {
    await db.attachments.filter(a => a.parentType === 'flight' && a.parentId === id).delete();
    await db.flights.delete(id);
  };

  return (
    <div>
      {/* PDF import */}
      <div className="card" style={{ marginBottom: 'var(--sp-md)', padding: 'var(--sp-sm) var(--sp-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf"
            style={{ display: 'none' }}
            onChange={handlePdfUpload}
          />
          <button
            className="btn btn-secondary"
            onClick={() => pdfInputRef.current?.click()}
            disabled={parsing}
            style={{ fontSize: '0.85rem' }}
          >
            {parsing ? '⏳ 解析中...' : '📄 匯入機票 PDF'}
          </button>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            上傳機票確認信 PDF，自動填入航班資訊
          </span>
        </div>
        {parseMsg && (
          <div style={{ marginTop: 'var(--sp-xs)', fontSize: '0.82rem', color: parseMsg.includes('失敗') || parseMsg.includes('未能') ? 'var(--danger)' : 'var(--success)' }}>
            {parseMsg}
          </div>
        )}
      </div>

      {flights?.map(f => (
        <div key={f.id} className="card" style={{ marginBottom: 'var(--sp-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="form-row">
                <InlineEdit value={f.airline} onSave={v => update(f.id!, { airline: v })} placeholder="航空公司" tag="span" />
                <InlineEdit value={f.flightNo} onSave={v => update(f.id!, { flightNo: v })} placeholder="航班號" tag="span" />
              </div>
              <div className="form-row" style={{ fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>出發</span>
                  <InlineEdit value={f.departureAirport} onSave={v => update(f.id!, { departureAirport: v })} placeholder="機場" />
                  <InlineEdit value={f.departureTime} onSave={v => update(f.id!, { departureTime: v })} placeholder="日期時間" />
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>抵達</span>
                  <InlineEdit value={f.arrivalAirport} onSave={v => update(f.id!, { arrivalAirport: v })} placeholder="機場" />
                  <InlineEdit value={f.arrivalTime} onSave={v => update(f.id!, { arrivalTime: v })} placeholder="日期時間" />
                </div>
              </div>
              <div className="form-row" style={{ fontSize: '0.85rem' }}>
                <InlineEdit value={f.confirmNo || ''} onSave={v => update(f.id!, { confirmNo: v })} placeholder="確認編號" />
                <InlineEdit value={f.amount != null ? `${f.amount}` : ''} onSave={v => update(f.id!, { amount: parseFloat(v) || undefined })} placeholder="💰 金額" />
                <InlineEdit value={f.currency || ''} onSave={v => update(f.id!, { currency: v })} placeholder="幣別" />
              </div>
              <AttachmentList parentId={f.id!} parentType="flight" />
              <div style={{ marginTop: 'var(--sp-sm)' }}>
                <FileUpload parentId={f.id!} parentType="flight" />
              </div>
            </div>
            <button className="btn-icon btn-danger" onClick={() => remove(f.id!)}>🗑️</button>
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={addFlight}>＋ 新增航班</button>
    </div>
  );
}

/* ===================== HOTELS ===================== */
function HotelsSection({ tripId }: { tripId: number }) {
  const hotels = useLiveQuery(
    () => db.hotels.where('tripId').equals(tripId).sortBy('sortOrder'),
    [tripId]
  );

  const addHotel = async () => {
    await db.hotels.add({
      tripId,
      name: '',
      address: '',
      checkIn: '',
      checkOut: '',
      sortOrder: hotels?.length ?? 0,
    });
  };

  const update = (id: number, data: Partial<Hotel>) => db.hotels.update(id, data);
  const remove = async (id: number) => {
    await db.attachments.filter(a => a.parentType === 'hotel' && a.parentId === id).delete();
    await db.hotels.delete(id);
  };

  return (
    <div>
      {hotels?.map(h => (
        <HotelCard key={h.id} hotel={h} onUpdate={(data) => update(h.id!, data)} onRemove={() => remove(h.id!)} />
      ))}
      <button className="btn btn-primary" onClick={addHotel}>＋ 新增住宿</button>
    </div>
  );
}

function HotelCard({ hotel, onUpdate, onRemove }: { hotel: Hotel; onUpdate: (data: Partial<Hotel>) => void; onRemove: () => void }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--sp-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <PlaceAutocomplete
            value={hotel.name}
            onSelect={(r) => onUpdate({ name: r.name, address: r.address, lat: r.lat, lng: r.lng, placeLink: r.placeLink })}
            placeholder="搜尋住宿..."
          />
          {hotel.address && (
            <div style={{ fontSize: '0.85rem', marginTop: 'var(--sp-xs)', color: 'var(--text-muted)' }}>
              📍 {hotel.address}
            </div>
          )}
          {hotel.placeLink && (
            <div style={{ fontSize: '0.8rem' }}>
              <a href={hotel.placeLink} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent-light)' }}>
                🔗 在 Google Maps 查看
              </a>
            </div>
          )}
          <div className="form-row" style={{ fontSize: '0.85rem', marginTop: 'var(--sp-xs)' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>入住</span>
              <InlineEdit value={hotel.checkIn} onSave={v => onUpdate({ checkIn: v })} placeholder="日期" />
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>退房</span>
              <InlineEdit value={hotel.checkOut} onSave={v => onUpdate({ checkOut: v })} placeholder="日期" />
            </div>
          </div>
          <div className="form-row" style={{ fontSize: '0.85rem' }}>
            <InlineEdit value={hotel.confirmNo || ''} onSave={v => onUpdate({ confirmNo: v })} placeholder="確認編號" />
            <InlineEdit value={hotel.amount != null ? `${hotel.amount}` : ''} onSave={v => onUpdate({ amount: parseFloat(v) || undefined })} placeholder="💰 金額" />
            <InlineEdit value={hotel.currency || ''} onSave={v => onUpdate({ currency: v })} placeholder="幣別" />
          </div>
          <AttachmentList parentId={hotel.id!} parentType="hotel" />
          <div style={{ marginTop: 'var(--sp-sm)' }}>
            <FileUpload parentId={hotel.id!} parentType="hotel" />
          </div>
        </div>
        <button className="btn-icon btn-danger" onClick={onRemove}>🗑️</button>
      </div>
    </div>
  );
}

/* ===================== TICKETS ===================== */
function TicketsSection({ tripId }: { tripId: number }) {
  const tickets = useLiveQuery(
    () => db.tickets.where('tripId').equals(tripId).sortBy('sortOrder'),
    [tripId]
  );

  const addTicket = async () => {
    await db.tickets.add({
      tripId,
      title: '',
      sortOrder: tickets?.length ?? 0,
    });
  };

  const update = (id: number, data: Partial<Ticket>) => db.tickets.update(id, data);
  const remove = async (id: number) => {
    await db.attachments.filter(a => a.parentType === 'ticket' && a.parentId === id).delete();
    await db.tickets.delete(id);
  };

  return (
    <div>
      {tickets?.map(t => (
        <div key={t.id} className="card" style={{ marginBottom: 'var(--sp-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <InlineEdit value={t.title} onSave={v => update(t.id!, { title: v })} placeholder="票券名稱" tag="h3" />
              <div className="form-row" style={{ fontSize: '0.85rem', marginTop: 'var(--sp-xs)' }}>
                <InlineEdit value={t.date || ''} onSave={v => update(t.id!, { date: v })} placeholder="📅 日期" />
                <InlineEdit value={t.venue || ''} onSave={v => update(t.id!, { venue: v })} placeholder="📍 地點" />
              </div>
              <div className="form-row" style={{ fontSize: '0.85rem' }}>
                <InlineEdit value={t.confirmNo || ''} onSave={v => update(t.id!, { confirmNo: v })} placeholder="確認編號" />
                <InlineEdit value={t.amount != null ? `${t.amount}` : ''} onSave={v => update(t.id!, { amount: parseFloat(v) || undefined })} placeholder="💰 金額" />
                <InlineEdit value={t.currency || ''} onSave={v => update(t.id!, { currency: v })} placeholder="幣別" />
              </div>
              <AttachmentList parentId={t.id!} parentType="ticket" />
              <div style={{ marginTop: 'var(--sp-sm)' }}>
                <FileUpload parentId={t.id!} parentType="ticket" />
              </div>
            </div>
            <button className="btn-icon btn-danger" onClick={() => remove(t.id!)}>🗑️</button>
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={addTicket}>＋ 新增票券</button>
    </div>
  );
}

/* ===================== CHECKLIST ===================== */
function ChecklistSection({ tripId }: { tripId: number }) {
  const items = useLiveQuery(
    () => db.checklistItems.where('tripId').equals(tripId).sortBy('sortOrder'),
    [tripId]
  );
  const [newCategory, setNewCategory] = useState('行前準備');

  const categories = [...new Set(items?.map(i => i.category) ?? [])];
  if (categories.length === 0) categories.push('行前準備', '伴手禮');

  const addItem = async (category: string) => {
    const catItems = items?.filter(i => i.category === category) ?? [];
    await db.checklistItems.add({
      tripId,
      category,
      text: '',
      checked: false,
      currency: 'TWD',
      sortOrder: catItems.length,
    });
  };

  const update = (id: number, data: Partial<ChecklistItem>) => db.checklistItems.update(id, data);
  const remove = (id: number) => db.checklistItems.delete(id);

  return (
    <div>
      {categories.map(cat => {
        const catItems = items?.filter(i => i.category === cat) ?? [];
        const checked = catItems.filter(i => i.checked).length;
        return (
          <div key={cat} style={{ marginBottom: 'var(--sp-lg)' }}>
            <div className="section-title">
              {cat} <span className="badge">{checked}/{catItems.length}</span>
            </div>
            {catItems.map(item => (
              <div key={item.id} className={`checklist-item ${item.checked ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={e => update(item.id!, { checked: e.target.checked })}
                />
                <InlineEdit
                  value={item.text}
                  onSave={v => update(item.id!, { text: v })}
                  placeholder="項目..."
                  className="checklist-text"
                />
                <InlineEdit
                  value={item.amount != null ? `${item.amount}` : ''}
                  onSave={v => update(item.id!, { amount: v ? parseFloat(v) || 0 : undefined })}
                  placeholder="金額"
                  className="checklist-amount"
                />
                <InlineEdit
                  value={item.currency || 'TWD'}
                  onSave={v => update(item.id!, { currency: v })}
                  placeholder="TWD"
                  className="checklist-currency"
                />
                <button className="btn-icon" style={{ fontSize: '0.65rem', width: 20, height: 20, color: 'var(--text-muted)' }} onClick={() => remove(item.id!)}>✕</button>
              </div>
            ))}
            {(() => {
              const subtotals: Record<string, number> = {};
              catItems.forEach(i => { if (i.amount) { const c = i.currency || 'TWD'; subtotals[c] = (subtotals[c] || 0) + i.amount; } });
              const entries = Object.entries(subtotals);
              return entries.length > 0 ? (
                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 'var(--sp-xs)' }}>
                  小計: {entries.map(([cur, amt]) => `${cur} ${amt.toLocaleString()}`).join(' ＋ ')}
                </div>
              ) : null;
            })()}
            <button className="btn btn-secondary" onClick={() => addItem(cat)} style={{ marginTop: 'var(--sp-xs)', fontSize: '0.8rem' }}>＋ 新增項目</button>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', marginTop: 'var(--sp-md)' }}>
        <input
          value={newCategory}
          onChange={e => setNewCategory(e.target.value)}
          placeholder="新類別名稱"
          style={{ maxWidth: 200 }}
        />
        <button className="btn btn-primary" onClick={() => { if (newCategory.trim()) { addItem(newCategory.trim()); } }}>
          ＋ 新增類別
        </button>
      </div>
    </div>
  );
}

/* ===================== BUDGET ===================== */
function BudgetSection({ tripId }: { tripId: number }) {
  const budgetItems = useLiveQuery(
    () => db.budgetItems.where('tripId').equals(tripId).sortBy('sortOrder'),
    [tripId]
  );

  // Also gather costs from flights, hotels, tickets, places
  const flights = useLiveQuery(() => db.flights.where('tripId').equals(tripId).toArray(), [tripId]);
  const hotels = useLiveQuery(() => db.hotels.where('tripId').equals(tripId).toArray(), [tripId]);
  const tickets = useLiveQuery(() => db.tickets.where('tripId').equals(tripId).toArray(), [tripId]);
  const places = useLiveQuery(() => db.places.where('tripId').equals(tripId).toArray(), [tripId]);
  const checklistItems = useLiveQuery(() => db.checklistItems.where('tripId').equals(tripId).toArray(), [tripId]);

  const addItem = async () => {
    await db.budgetItems.add({
      tripId,
      category: '',
      description: '',
      amount: 0,
      currency: 'TWD',
      sortOrder: budgetItems?.length ?? 0,
    });
  };

  const update = (id: number, data: Partial<BudgetItem>) => db.budgetItems.update(id, data);
  const remove = (id: number) => db.budgetItems.delete(id);

  // Approximate exchange rates to TWD fallback
  const fallbackToTWD: Record<string, number> = {
    TWD: 1,
    JPY: 0.22,
    USD: 32.5,
    EUR: 35,
    KRW: 0.024,
    CNY: 4.5,
    HKD: 4.15,
    GBP: 41,
    THB: 0.92,
  };

  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (navigator.onLine) {
      fetch('https://open.er-api.com/v6/latest/TWD')
        .then(res => res.json())
        .then(data => {
          if (data && data.rates) {
            setExchangeRates(data.rates);
          }
        })
        .catch(err => console.error('Failed to fetch exchange rates:', err));
    }
  }, []);

  const convertToTWD = (amount: number, currency: string) => {
    if (exchangeRates && exchangeRates[currency]) {
      // 1 TWD = exchangeRates[currency] (e.g., 4.97 JPY)
      return Math.round(amount / exchangeRates[currency]);
    }
    const rate = fallbackToTWD[currency];
    return rate ? Math.round(amount * rate) : null;
  };

  // Calculate totals by currency
  const allCosts: { amount: number; currency: string; source: string }[] = [];
  budgetItems?.forEach(b => { if (b.amount) allCosts.push({ amount: b.amount, currency: b.currency, source: '預算' }); });
  flights?.forEach(f => { if (f.amount) allCosts.push({ amount: f.amount, currency: f.currency || 'TWD', source: '機票' }); });
  hotels?.forEach(h => { if (h.amount) allCosts.push({ amount: h.amount, currency: h.currency || 'TWD', source: '住宿' }); });
  tickets?.forEach(t => { if (t.amount) allCosts.push({ amount: t.amount, currency: t.currency || 'TWD', source: '票券' }); });
  places?.forEach(p => { if (p.amount) allCosts.push({ amount: p.amount, currency: p.currency || 'JPY', source: '景點' }); });
  checklistItems?.forEach(c => { if (c.amount) allCosts.push({ amount: c.amount, currency: c.currency || 'TWD', source: '清單' }); });

  const totalsByCurrency: Record<string, number> = {};
  allCosts.forEach(c => {
    totalsByCurrency[c.currency] = (totalsByCurrency[c.currency] || 0) + c.amount;
  });

  // Total converted to TWD
  let totalTWD = 0;
  allCosts.forEach(c => {
    const twd = convertToTWD(c.amount, c.currency);
    if (twd != null) totalTWD += twd;
  });

  return (
    <div>
      {/* Summary */}
      <div className="budget-summary">
        <div>
          <div className="total-label">總花費</div>
          <div className="total-amount">
            {totalTWD > 0
              ? `TWD ${totalTWD.toLocaleString()}`
              : '—'}
          </div>
          {Object.keys(totalsByCurrency).length > 1 && (
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: 4 }}>
              {Object.entries(totalsByCurrency).map(([cur, amt]) => `${cur} ${amt.toLocaleString()}`).join(' ＋ ')}
            </div>
          )}
        </div>
      </div>

      {/* Cost sources overview */}
      {allCosts.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--sp-md)', fontSize: '0.85rem' }}>
          <div className="section-title">費用明細</div>
          {['機票', '住宿', '票券', '景點', '清單', '預算'].map(source => {
            const items = allCosts.filter(c => c.source === source);
            if (items.length === 0) return null;
            const subtotals: Record<string, number> = {};
            items.forEach(i => { subtotals[i.currency] = (subtotals[i.currency] || 0) + i.amount; });
            const twdTotal = items.reduce((sum, i) => sum + (convertToTWD(i.amount, i.currency) ?? 0), 0);
            return (
              <div key={source} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--sp-xs) 0', borderBottom: '1px solid var(--border)' }}>
                <span>{source}</span>
                <span style={{ color: 'var(--accent-light)' }}>
                  {Object.entries(subtotals).map(([c, a]) => `${c} ${a.toLocaleString()}`).join(' + ')}
                  {twdTotal > 0 && Object.keys(subtotals).some(c => c !== 'TWD') ? ` ≈ TWD ${twdTotal.toLocaleString()}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual budget items */}
      <div className="section-title">自訂預算項目</div>
      {budgetItems?.map(b => (
        <div key={b.id} className="card" style={{ marginBottom: 'var(--sp-sm)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
            <InlineEdit value={b.category} onSave={v => update(b.id!, { category: v })} placeholder="類別" />
            <InlineEdit value={b.description} onSave={v => update(b.id!, { description: v })} placeholder="說明" />
            <InlineEdit
              value={`${b.amount}`}
              onSave={v => update(b.id!, { amount: parseFloat(v) || 0 })}
              placeholder="0"
            />
            <InlineEdit value={b.currency} onSave={v => update(b.id!, { currency: v })} placeholder="TWD" />
            <button className="btn-icon btn-danger" style={{ fontSize: '0.7rem' }} onClick={() => remove(b.id!)}>✕</button>
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={addItem}>＋ 新增預算項目</button>
    </div>
  );
}
