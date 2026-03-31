import { useState, useRef, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { firestore } from '../firebase';
import InlineEdit from '../components/shared/InlineEdit';
import FileUpload from '../components/shared/FileUpload';
import AttachmentList from '../components/shared/AttachmentList';
import PlaceAutocomplete from '../components/shared/PlaceAutocomplete';
import { parseFlightPdf } from '../utils/parseFlightPdf';
import type { Flight, Hotel, Ticket, ChecklistItem, BudgetItem, Role, PermissionTab, Place } from '../types';
import { useAuth } from '../context/AuthContext';
import { normalizeEmail } from '../utils/emails';
import { useFirestoreQuery } from '../hooks/useFirestoreQuery';

interface LogisticsPageProps {
  tripId: string; // ✅ 改為 string
  role: Role;
  readOnly?: boolean;
}

type LogisticsTab = 'flights' | 'hotels' | 'tickets' | 'checklist' | 'budget';

export default function LogisticsPage({ tripId, role, readOnly = false }: LogisticsPageProps) {
  const { user, tripMeta } = useAuth();
  const isAdmin = role === 'admin';
  const myEmail = user?.email ? normalizeEmail(user.email) : '';
  const collabs = tripMeta?.collaborators || {};
  const myCollab = collabs[myEmail] || Object.values(collabs).find((c: any) => normalizeEmail(c.email) === myEmail);
  const perms = myCollab?.permissions || {};

  const allTabs: { key: LogisticsTab; label: string; icon: string }[] = [
    { key: 'flights', label: '機票', icon: '✈️' },
    { key: 'hotels', label: '住宿', icon: '🏨' },
    { key: 'tickets', label: '票券', icon: '🎫' },
    { key: 'checklist', label: '清單', icon: '✅' },
    { key: 'budget', label: '預算', icon: '💰' },
  ];

  const tabs = allTabs.filter(t => {
    if (isAdmin) return true;
    if (t.key === 'checklist') return false;
    if (t.key === 'budget') return true;
    return perms[t.key as PermissionTab] && perms[t.key as PermissionTab] !== 'none';
  });

  const initialTab = tabs.length > 0 ? tabs[0].key : null;
  const [activeTab, setActiveTab] = useState<LogisticsTab | null>(initialTab);

  useEffect(() => {
    if (tabs.length > 0 && (!activeTab || !tabs.find(t => t.key === activeTab))) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  if (tabs.length === 0) {
    return (
      <div className="empty-state">
        <p style={{ fontSize: '3rem' }}>🚫</p>
        <p>您沒有權限檢視此頁面的任何內容</p>
      </div>
    );
  }

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

      <fieldset disabled={readOnly} style={readOnly ? { opacity: 0.8 } : undefined}>
        {activeTab === 'flights' && <FlightsSection tripId={tripId} readOnly={readOnly} />}
        {activeTab === 'hotels' && <HotelsSection tripId={tripId} readOnly={readOnly} />}
        {activeTab === 'tickets' && <TicketsSection tripId={tripId} readOnly={readOnly} />}
        {activeTab === 'checklist' && isAdmin && <ChecklistSection tripId={tripId} readOnly={readOnly} />}
        {activeTab === 'budget' && <BudgetSection tripId={tripId} isAdmin={isAdmin} readOnly={readOnly} />}
      </fieldset>
    </div>
  );
}

/* ===================== FLIGHTS ===================== */
function FlightsSection({ tripId, readOnly = false }: { tripId: string; readOnly?: boolean }) {
  const flights = useFirestoreQuery<Flight>(tripId, 'flights', 'sortOrder');
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState('');

  const addFlight = async () => {
    if (readOnly || !tripId) return;
    await addDoc(collection(firestore, 'trips', String(tripId), 'flights'), {
      tripId: String(tripId),
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
    if (readOnly) return;
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
          await addDoc(collection(firestore, 'trips', String(tripId), 'flights'), {
            tripId: String(tripId),
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

  const update = async (id: string, data: Partial<Flight>) => {
    if (readOnly || !tripId || !id) return;
    await updateDoc(doc(firestore, 'trips', String(tripId), 'flights', String(id)), data);
  };
  const remove = async (id: string) => {
    if (readOnly || !tripId || !id) return;
    await deleteDoc(doc(firestore, 'trips', String(tripId), 'flights', String(id)));
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 'var(--sp-md)', padding: 'var(--sp-sm) var(--sp-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfUpload} />
          <button className="btn btn-secondary" onClick={() => pdfInputRef.current?.click()} disabled={parsing} style={{ fontSize: '0.85rem' }}>
            {parsing ? '⏳ 解析中...' : '📄 匯入機票 PDF'}
          </button>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>上傳機票確認信 PDF，自動填入航班資訊</span>
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
function HotelsSection({ tripId, readOnly = false }: { tripId: string; readOnly?: boolean }) {
  const hotels = useFirestoreQuery<Hotel>(tripId, 'hotels', 'sortOrder');

  const addHotel = async () => {
    if (readOnly || !tripId) return;
    await addDoc(collection(firestore, 'trips', String(tripId), 'hotels'), {
      tripId: String(tripId),
      name: '',
      address: '',
      checkIn: '',
      checkOut: '',
      sortOrder: hotels?.length ?? 0,
    });
  };

  const update = async (id: string, data: Partial<Hotel>) => {
    if (readOnly || !tripId || !id) return;
    await updateDoc(doc(firestore, 'trips', String(tripId), 'hotels', String(id)), data);
  };
  const remove = async (id: string) => {
    if (readOnly || !tripId || !id) return;
    await deleteDoc(doc(firestore, 'trips', String(tripId), 'hotels', String(id)));
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
          {hotel.address && <div style={{ fontSize: '0.85rem', marginTop: 'var(--sp-xs)', color: 'var(--text-muted)' }}>📍 {hotel.address}</div>}
          {hotel.placeLink && (
            <div style={{ fontSize: '0.8rem' }}>
              <a href={hotel.placeLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-light)' }}>🔗 在 Google Maps 查看</a>
            </div>
          )}
          <div className="form-row" style={{ fontSize: '0.85rem', marginTop: 'var(--sp-xs)' }}>
            <div><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>入住</span><InlineEdit value={hotel.checkIn} onSave={v => onUpdate({ checkIn: v })} placeholder="日期" /></div>
            <div><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>退房</span><InlineEdit value={hotel.checkOut} onSave={v => onUpdate({ checkOut: v })} placeholder="日期" /></div>
          </div>
          <div className="form-row" style={{ fontSize: '0.85rem' }}>
            <InlineEdit value={hotel.confirmNo || ''} onSave={v => onUpdate({ confirmNo: v })} placeholder="確認編號" />
            <InlineEdit value={hotel.amount != null ? `${hotel.amount}` : ''} onSave={v => onUpdate({ amount: parseFloat(v) || undefined })} placeholder="💰 金額" />
            <InlineEdit value={hotel.currency || ''} onSave={v => onUpdate({ currency: v })} placeholder="幣別" />
          </div>
        </div>
        <button className="btn-icon btn-danger" onClick={onRemove}>🗑️</button>
      </div>
    </div>
  );
}

/* ===================== TICKETS ===================== */
function TicketsSection({ tripId, readOnly = false }: { tripId: string; readOnly?: boolean }) {
  const tickets = useFirestoreQuery<Ticket>(tripId, 'tickets', 'sortOrder');

  const addTicket = async () => {
    if (readOnly || !tripId) return;
    await addDoc(collection(firestore, 'trips', String(tripId), 'tickets'), {
      tripId: String(tripId),
      title: '',
      sortOrder: tickets?.length ?? 0,
    });
  };

  const update = async (id: string, data: Partial<Ticket>) => {
    if (readOnly || !tripId || !id) return;
    await updateDoc(doc(firestore, 'trips', String(tripId), 'tickets', String(id)), data);
  };
  const remove = async (id: string) => {
    if (readOnly || !tripId || !id) return;
    await deleteDoc(doc(firestore, 'trips', String(tripId), 'tickets', String(id)));
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
function ChecklistSection({ tripId, readOnly = false }: { tripId: string; readOnly?: boolean }) {
  const items = useFirestoreQuery<ChecklistItem>(tripId, 'checklistItems', 'sortOrder');
  const [newCategory, setNewCategory] = useState('行前準備');

  const categories = [...new Set(items?.map(i => i.category) ?? [])];
  if (categories.length === 0) categories.push('行前準備', '伴手禮');

  const addItem = async (category: string) => {
    if (readOnly || !tripId) return;
    const catItems = items?.filter(i => i.category === category) ?? [];
    await addDoc(collection(firestore, 'trips', String(tripId), 'checklistItems'), {
      tripId: String(tripId),
      category,
      text: '',
      checked: false,
      currency: 'TWD',
      sortOrder: catItems.length,
    });
  };

  const update = async (id: string, data: Partial<ChecklistItem>) => {
    if (readOnly || !tripId || !id) return;
    await updateDoc(doc(firestore, 'trips', String(tripId), 'checklistItems', String(id)), data);
  };
  const remove = async (id: string) => {
    if (readOnly || !tripId || !id) return;
    await deleteDoc(doc(firestore, 'trips', String(tripId), 'checklistItems', String(id)));
  };

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
                <input type="checkbox" checked={item.checked} onChange={e => update(item.id!, { checked: e.target.checked })} />
                <InlineEdit value={item.text} onSave={v => update(item.id!, { text: v })} placeholder="項目..." className="checklist-text" />
                <InlineEdit value={item.amount != null ? `${item.amount}` : ''} onSave={v => update(item.id!, { amount: v ? parseFloat(v) || 0 : undefined })} placeholder="金額" className="checklist-amount" />
                <InlineEdit value={item.currency || 'TWD'} onSave={v => update(item.id!, { currency: v })} placeholder="TWD" className="checklist-currency" />
                <button className="btn-icon" style={{ fontSize: '0.65rem', width: 20, height: 20, color: 'var(--text-muted)' }} onClick={() => remove(item.id!)}>✕</button>
              </div>
            ))}
            <button className="btn btn-secondary" onClick={() => addItem(cat)} style={{ marginTop: 'var(--sp-xs)', fontSize: '0.8rem' }}>＋ 新增項目</button>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', marginTop: 'var(--sp-md)' }}>
        <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="新類別名稱" style={{ maxWidth: 200 }} />
        <button className="btn btn-primary" onClick={() => { if (newCategory.trim()) { addItem(newCategory.trim()); } }}>
          ＋ 新增類別
        </button>
      </div>
    </div>
  );
}

/* ===================== BUDGET ===================== */
function BudgetSection({ tripId, isAdmin, readOnly = false }: { tripId: string; isAdmin: boolean; readOnly?: boolean }) {
  const budgetItems = useFirestoreQuery<BudgetItem>(tripId, 'budgetItems', 'sortOrder');
  const flights = useFirestoreQuery<Flight>(tripId, 'flights');
  const hotels = useFirestoreQuery<Hotel>(tripId, 'hotels');
  const tickets = useFirestoreQuery<Ticket>(tripId, 'tickets');
  const places = useFirestoreQuery<Place>(tripId, 'places');
  const checklistItems = useFirestoreQuery<ChecklistItem>(tripId, 'checklistItems');

  const addItem = async () => {
    if (readOnly || !tripId) return;
    await addDoc(collection(firestore, 'trips', String(tripId), 'budgetItems'), {
      tripId: String(tripId),
      category: '',
      description: '',
      amount: 0,
      currency: 'TWD',
      sortOrder: budgetItems?.length ?? 0,
    });
  };

  const update = async (id: string, data: Partial<BudgetItem>) => {
    if (readOnly || !tripId || !id) return;
    await updateDoc(doc(firestore, 'trips', String(tripId), 'budgetItems', String(id)), data);
  };
  const remove = async (id: string) => {
    if (readOnly || !tripId || !id) return;
    await deleteDoc(doc(firestore, 'trips', String(tripId), 'budgetItems', String(id)));
  };

  const fallbackToTWD: Record<string, number> = { TWD: 1, JPY: 0.22, USD: 32.5, EUR: 35 };
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (navigator.onLine) {
      fetch('https://open.er-api.com/v6/latest/TWD')
        .then(res => res.json())
        .then(data => { if (data && data.rates) setExchangeRates(data.rates); })
        .catch(() => { });
    }
  }, []);

  const convertToTWD = (amount: number, currency: string) => {
    if (exchangeRates && exchangeRates[currency]) return Math.round(amount / exchangeRates[currency]);
    const rate = fallbackToTWD[currency];
    return rate ? Math.round(amount * rate) : null;
  };

  const allCosts: { amount: number; currency: string; source: string }[] = [];
  budgetItems?.forEach(b => { if (b.amount) allCosts.push({ amount: b.amount, currency: b.currency, source: '預算' }); });
  flights?.forEach(f => { if (f.amount) allCosts.push({ amount: f.amount, currency: f.currency || 'TWD', source: '機票' }); });
  hotels?.forEach(h => { if (h.amount) allCosts.push({ amount: h.amount, currency: h.currency || 'TWD', source: '住宿' }); });
  tickets?.forEach(t => { if (t.amount) allCosts.push({ amount: t.amount, currency: t.currency || 'TWD', source: '票券' }); });
  places?.forEach(p => { if (p.amount) allCosts.push({ amount: p.amount, currency: p.currency || 'JPY', source: '景點' }); });

  if (isAdmin) {
    checklistItems?.forEach(c => { if (c.amount) allCosts.push({ amount: c.amount, currency: c.currency || 'TWD', source: '清單' }); });
  }

  const totalsByCurrency: Record<string, number> = {};
  let totalTWD = 0;
  allCosts.forEach(c => {
    totalsByCurrency[c.currency] = (totalsByCurrency[c.currency] || 0) + c.amount;
    const twd = convertToTWD(c.amount, c.currency);
    if (twd != null) totalTWD += twd;
  });

  return (
    <div>
      <div className="budget-summary">
        <div>
          <div className="total-label">總花費</div>
          <div className="total-amount">{totalTWD > 0 ? `TWD ${totalTWD.toLocaleString()}` : '—'}</div>
        </div>
      </div>

      <div className="section-title">自訂預算項目</div>
      {budgetItems?.map(b => (
        <div key={b.id} className="card" style={{ marginBottom: 'var(--sp-sm)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
            <InlineEdit value={b.category} onSave={v => update(b.id!, { category: v })} placeholder="類別" />
            <InlineEdit value={b.description} onSave={v => update(b.id!, { description: v })} placeholder="說明" />
            <InlineEdit value={`${b.amount}`} onSave={v => update(b.id!, { amount: parseFloat(v) || 0 })} placeholder="0" />
            <InlineEdit value={b.currency} onSave={v => update(b.id!, { currency: v })} placeholder="TWD" />
            <button className="btn-icon btn-danger" style={{ fontSize: '0.7rem' }} onClick={() => remove(b.id!)}>✕</button>
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={addItem}>＋ 新增預算項目</button>
    </div>
  );
}