import { useState, useRef, useEffect, Fragment } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { firestore } from '../firebase';
import InlineEdit from '../components/shared/InlineEdit';
import FileUpload from '../components/shared/FileUpload';
import AttachmentList from '../components/shared/AttachmentList';
import PlaceAutocomplete from '../components/shared/PlaceAutocomplete';
import type { Flight, Hotel, Ticket, ChecklistItem, BudgetItem, Role, PermissionTab, Place } from '../types';
import { useAuth } from '../context/AuthContext';
import { normalizeEmail } from '../utils/emails';
import { useFirestoreQuery } from '../hooks/useFirestoreQuery';
import PageLoader from '../components/shared/PageLoader';

interface LogisticsPageProps {
  tripId: string; // ✅ 改為 string
  role: Role;
  readOnly?: boolean;
}

type LogisticsTab = 'flights' | 'hotels' | 'tickets' | 'checklist' | 'budget';

export default function LogisticsPage({ tripId, role, readOnly = false }: LogisticsPageProps) {
  const { user, tripMeta, permissions } = useAuth(); // ✅ 使用全局 permissions
  const isAdmin = role === 'admin';

  const allTabs: { key: LogisticsTab; label: string; icon: string; permKey: PermissionTab }[] = [
    { key: 'flights', label: '機票', icon: '✈️', permKey: 'flights' },
    { key: 'hotels', label: '住宿', icon: '🏨', permKey: 'hotels' },
    { key: 'tickets', label: '票券', icon: '🎫', permKey: 'tickets' },
    { key: 'checklist', label: '清單', icon: '✅', permKey: 'checklist' },
    { key: 'budget', label: '預算', icon: '💰', permKey: 'budget' },
  ];

  const tabs = allTabs.filter(t => {
    if (isAdmin) return true;
    const p = permissions[t.permKey];
    return p === 'read' || p === 'write';
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
    <div className="logistics-page">
      <div className="page-header">
        <h1>準備 📋</h1>
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
        {activeTab === 'checklist' && <ChecklistSection tripId={tripId} readOnly={readOnly} />}
        {activeTab === 'budget' && <BudgetSection tripId={tripId} isAdmin={isAdmin} readOnly={readOnly} />}
      </fieldset>
    </div>
  );
}

/* ===================== FLIGHTS ===================== */
function FlightsSection({ tripId, readOnly = false }: { tripId: string; readOnly?: boolean }) {
  const flights = useFirestoreQuery<Flight>(tripId, 'flights', 'sortOrder');

  if (flights === undefined) return <PageLoader />;

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
                <InlineEdit value={f.amount != null ? `${f.amount}` : ''} onSave={v => update(f.id!, { amount: v ? parseFloat(v) || 0 : undefined })} placeholder="💰 金額" />
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

  if (hotels === undefined) return <PageLoader />;

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
          <div className="form-row" style={{ fontSize: '0.85rem', marginTop: 'var(--sp-xs)', gap: 'var(--sp-md)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>入住</span>
              <input
                type="date"
                value={hotel.checkIn}
                onChange={e => onUpdate({ checkIn: e.target.value })}
                style={{ fontSize: '0.85rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>退房</span>
              <input
                type="date"
                value={hotel.checkOut}
                onChange={e => onUpdate({ checkOut: e.target.value })}
                style={{ fontSize: '0.85rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'inherit' }}
              />
            </div>
          </div>
          <div className="form-row" style={{ fontSize: '0.85rem' }}>
            <InlineEdit value={hotel.confirmNo || ''} onSave={v => onUpdate({ confirmNo: v })} placeholder="確認編號" />
            <InlineEdit value={hotel.amount != null ? `${hotel.amount}` : ''} onSave={v => onUpdate({ amount: v ? parseFloat(v) || 0 : undefined })} placeholder="💰 金額" />
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
  const places = useFirestoreQuery<Place>(tripId, 'places', 'sortOrder'); // ✅ 獲取景點列表

  if (tickets === undefined || places === undefined) return <PageLoader />;

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
              <div className="form-row" style={{ fontSize: '0.85rem', marginTop: 'var(--sp-xs)', gap: 'var(--sp-md)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>📅 日期</span>
                  <input
                    type="date"
                    value={t.date || ''}
                    onChange={e => update(t.id!, { date: e.target.value })}
                    disabled={readOnly}
                    style={{ fontSize: '0.85rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'inherit' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>📍 地點</span>
                  <select
                    value={t.venue || ''}
                    onChange={(e) => update(t.id!, { venue: e.target.value })}
                    disabled={readOnly}
                    style={{ fontSize: '0.85rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'inherit', height: '34px' }}
                  >
                    <option value="">選擇景點...</option>
                    {places?.filter(p => p.name).map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row" style={{ fontSize: '0.85rem' }}>
                <InlineEdit value={t.confirmNo || ''} onSave={v => update(t.id!, { confirmNo: v })} placeholder="確認編號" />
                <InlineEdit value={t.amount != null ? `${t.amount}` : ''} onSave={v => update(t.id!, { amount: v ? parseFloat(v) || 0 : undefined })} placeholder="💰 金額" />
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
  const places = useFirestoreQuery<Place>(tripId, 'places', 'sortOrder');
  const [newCategory, setNewCategory] = useState('行前準備');
  const [souvenirFilter, setSouvenirFilter] = useState<string>('all');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  if (items === undefined || places === undefined) return <PageLoader />;

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

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

  const removeCategory = async (category: string) => {
    if (readOnly || !tripId) return;
    if (!window.confirm(`確定要移除「${category}」類別及其所有項目嗎？`)) return;
    const catItems = items?.filter(i => i.category === category) ?? [];
    for (const item of catItems) {
      if (item.id) {
        await deleteDoc(doc(firestore, 'trips', String(tripId), 'checklistItems', String(item.id)));
      }
    }
  };

  return (
    <div>
      {categories.map(cat => {
        const catItems = items?.filter(i => i.category === cat) ?? [];
        const isSouvenir = cat === '伴手禮';

        if (isSouvenir) {
          const recipients = ['all', ...new Set(catItems.map(i => i.recipient || '未設定').filter(Boolean))];
          const filteredItems = souvenirFilter === 'all'
            ? catItems
            : catItems.filter(i => (i.recipient || '未設定') === souvenirFilter);

          const totalsByCurrency = filteredItems.reduce((acc, i) => {
            const cur = i.currency || 'TWD';
            acc[cur] = (acc[cur] || 0) + (i.amount || 0);
            return acc;
          }, {} as Record<string, number>);
          const checkedCount = filteredItems.filter(i => i.checked).length;

          return (
            <div key={cat} style={{ marginBottom: 'var(--sp-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-md)', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                  <div className="section-title" style={{ margin: 0 }}>
                    🎁 {cat}
                    {!readOnly && (
                      <button className="btn-icon btn-danger" style={{ fontSize: '0.8rem', marginLeft: '8px' }} onClick={() => removeCategory(cat)} title="移除此類別">🗑️</button>
                    )}
                  </div>
                  <select
                    value={souvenirFilter}
                    onChange={(e) => setSouvenirFilter(e.target.value)}
                    style={{
                      width: 'auto',
                      fontSize: '0.75rem',
                      padding: '2px 10px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-card)',
                      color: 'var(--accent)',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="all">所有人</option>
                    {recipients.filter(r => r !== 'all').map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <span className="badge">{checkedCount}/{filteredItems.length}</span>
              </div>

              <div className="card" style={{ padding: 0, border: 'none', background: 'transparent', backdropFilter: 'none' }}>
                <table className="responsive-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(var(--accent-rgb, 176,141,122), 0.05)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ width: 40, padding: '12px 8px' }}></th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', minWidth: '100px' }}>項目</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', minWidth: '90px' }}>對象</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', minWidth: '110px' }}>地點</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', minWidth: '120px' }}>金額</th>
                      <th style={{ width: 40, padding: '12px 8px' }}></th>
                    </tr>
                  </thead>
                  {filteredItems.map(item => (
                    <tbody key={item.id} className="responsive-card-group">
                      <tr key={item.id} className="main-row" style={{ borderBottom: expandedItems[item.id!] ? 'none' : '1px solid var(--border)', opacity: item.checked ? 0.6 : 1 }}>
                        <td className="td-checkbox" data-label="" style={{ textAlign: 'center', padding: '8px' }}>
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={e => update(item.id!, { checked: e.target.checked })}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
                          />
                        </td>
                        <td data-label="項目" style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <InlineEdit
                              value={item.text}
                              onSave={v => update(item.id!, { text: v })}
                              placeholder="商品名稱..."
                              style={{ textDecoration: item.checked ? 'line-through' : 'none', fontWeight: 500 }}
                            />
                            <button className="btn-icon" style={{ fontSize: '0.8rem', opacity: 0.6 }} onClick={() => toggleExpand(item.id!)}>
                              {expandedItems[item.id!] ? '▾' : '📝'}
                            </button>
                          </div>
                        </td>
                        <td data-label="對象" style={{ padding: '8px' }}>
                          <InlineEdit
                            value={item.recipient || ''}
                            onSave={v => update(item.id!, { recipient: v })}
                            placeholder="誰要的?"
                          />
                        </td>
                        <td data-label="地點" style={{ padding: '8px' }}>
                          <select
                            value={item.location || ''}
                            onChange={(e) => update(item.id!, { location: e.target.value })}
                            style={{ width: 'auto', maxWidth: '100%', fontSize: '0.8rem', background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none' }}
                          >
                            <option value="">選擇景點...</option>
                            {places?.filter(p => p.name).map(p => (
                              <option key={p.id} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                        </td>
                        <td data-label="金額" style={{ padding: '8px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                            <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>$</span>
                            <InlineEdit
                              value={item.amount != null ? `${item.amount}` : ''}
                              onSave={v => update(item.id!, { amount: v ? parseFloat(v) || 0 : undefined })}
                              placeholder="0"
                              style={{ textAlign: 'right', width: '70px', fontWeight: 600 }}
                            />
                            <InlineEdit
                              value={item.currency || 'TWD'}
                              onSave={v => update(item.id!, { currency: v })}
                              placeholder="TWD"
                              style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-primary)', minWidth: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '4px' }}
                            />
                          </div>
                        </td>
                        <td className="td-action" data-label="" style={{ padding: '8px', textAlign: 'center' }}>
                          <button className="btn-icon btn-danger" style={{ fontSize: '0.65rem' }} onClick={() => remove(item.id!)}>✕</button>
                        </td>
                      </tr>
                      {expandedItems[item.id!] && (
                        <tr className="notes-row" style={{ background: 'rgba(0,0,0,0.01)' }}>
                          <td data-label="" style={{ display: 'none' }}></td>
                          <td colSpan={5} style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <InlineEdit
                                value={item.notes || ''}
                                onSave={v => update(item.id!, { notes: v })}
                                readOnly={readOnly}
                                multiline
                                markdown
                                placeholder="新增備註 (支援 Markdown 語法)..."
                                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', minHeight: '60px' }}
                              />
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <FileUpload tripId={tripId} parentId={item.id!} parentType="checklistItem" />
                                <div style={{ flex: 1 }}><AttachmentList tripId={tripId} parentId={item.id!} parentType="checklistItem" /></div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  ))}
                  <tfoot>
                    <tr style={{ background: 'rgba(var(--accent-rgb, 176,141,122), 0.1)', fontWeight: 'bold' }}>
                      <td data-label="總計" colSpan={6} style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--accent)' }}>
                        {Object.keys(totalsByCurrency).length === 0 ? '$0' : Object.entries(totalsByCurrency).map(([cur, val]) => (
                          <div key={cur} style={{ display: 'inline-block', marginLeft: '12px' }}>
                            {val.toLocaleString()} <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>{cur}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button className="btn btn-secondary" onClick={() => addItem(cat)} style={{ marginTop: 'var(--sp-sm)', fontSize: '0.8rem' }}>＋ 新增商品</button>
            </div>
          );
        }

        const checked = catItems.filter(i => i.checked).length;
        return (
          <div key={cat} style={{ marginBottom: 'var(--sp-lg)' }}>
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              {cat}
              <span className="badge">{checked}/{catItems.length}</span>
              {!readOnly && (
                <button className="btn-icon btn-danger" style={{ fontSize: '0.8rem', marginLeft: '4px' }} onClick={() => removeCategory(cat)} title="移除此類別">🗑️</button>
              )}
            </div>
            {catItems.map(item => (
              <div key={item.id} className={`checklist-row ${item.checked ? 'checked' : ''}`} style={{
                display: 'flex',
                flexDirection: 'column',
                padding: 'var(--sp-sm)',
                borderBottom: '1px solid var(--border)',
                background: item.checked ? 'rgba(0,0,0,0.02)' : 'transparent',
                transition: 'background 0.2s'
              }}>
                <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={e => update(item.id!, { checked: e.target.checked })}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)' }}
                  />
                  <div style={{ flex: 1 }}>
                    <InlineEdit
                      value={item.text}
                      onSave={v => update(item.id!, { text: v })}
                      placeholder="輸入項目名稱..."
                      className="checklist-text"
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: 500,
                        color: item.checked ? 'var(--text-muted)' : 'inherit',
                        textDecoration: item.checked ? 'line-through' : 'none'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--sp-xs)', alignItems: 'center' }}>
                    <button className="btn-icon" style={{ fontSize: '0.8rem', opacity: 0.6 }} onClick={() => toggleExpand(item.id!)}>
                      {expandedItems[item.id!] ? '▾' : '📝'}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '2px 6px' }}>
                      <span style={{ fontSize: '0.7rem', opacity: 0.5, marginRight: 4 }}>$</span>
                      <InlineEdit value={item.amount != null ? `${item.amount}` : ''} onSave={v => update(item.id!, { amount: v ? parseFloat(v) || 0 : undefined })} placeholder="0" style={{ fontSize: '0.8rem', width: 'auto' }} />
                      <InlineEdit value={item.currency || 'TWD'} onSave={v => update(item.id!, { currency: v })} placeholder="TWD" style={{ fontSize: '0.75rem', marginLeft: 4, fontWeight: 800, color: 'var(--text-primary)', background: 'rgba(255,255,255,0.15)', padding: '0 4px', borderRadius: '4px' }} />
                    </div>
                    <button className="btn-icon btn-danger" style={{ fontSize: '0.7rem', opacity: 0.9, fontWeight: 'bold' }} onClick={() => remove(item.id!)}>✕</button>
                  </div>
                </div>
                {expandedItems[item.id!] && (
                  <div style={{ padding: 'var(--sp-sm) 0 var(--sp-xs) 26px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <InlineEdit
                      value={item.notes || ''}
                      onSave={v => update(item.id!, { notes: v })}
                      readOnly={readOnly}
                      multiline
                      markdown
                      placeholder="新增備註 (支援 Markdown 語法)..."
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', minHeight: '60px' }}
                    />
                    <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', marginTop: 'var(--sp-xs)' }}>
                      <FileUpload tripId={tripId} parentId={item.id!} parentType="checklistItem" />
                      <AttachmentList tripId={tripId} parentId={item.id!} parentType="checklistItem" />
                    </div>
                  </div>
                )}
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

  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (navigator.onLine) {
      fetch('https://open.er-api.com/v6/latest/TWD')
        .then(res => res.json())
        .then(data => { if (data && data.rates) setExchangeRates(data.rates); })
        .catch(() => { });
    }
  }, []);

  if (budgetItems === undefined || flights === undefined || hotels === undefined || tickets === undefined || places === undefined || checklistItems === undefined) return <PageLoader />;

  const addItem = async () => {
    if (readOnly || !tripId) return;
    await addDoc(collection(firestore, 'trips', String(tripId), 'budgetItems'), {
      tripId: String(tripId),
      category: '',
      description: '',
      amount: 0,
      currency: 'TWD',
      sortOrder: budgetItems.length,
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
        <div key={b.id} className="card" style={{ marginBottom: 'var(--sp-sm)', padding: 'var(--sp-sm) var(--sp-md)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
            <InlineEdit value={b.category} onSave={v => update(b.id!, { category: v })} placeholder="項目" readOnly={readOnly} />
            <InlineEdit value={b.description} onSave={v => update(b.id!, { description: v })} placeholder="說明" readOnly={readOnly} style={{ flex: 1, minWidth: '100px' }} />
            <InlineEdit value={`${b.amount}`} onSave={v => update(b.id!, { amount: parseFloat(v) || 0 })} placeholder="0" readOnly={readOnly} style={{ textAlign: 'right', fontWeight: 600 }} />
            <InlineEdit value={b.currency} onSave={v => update(b.id!, { currency: v })} placeholder="TWD" readOnly={readOnly} style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-primary)', background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '4px' }} />
            {!readOnly && (
              <button className="btn-icon btn-danger" style={{ fontSize: '0.7rem', marginLeft: 'auto', opacity: 0.9, fontWeight: 'bold' }} onClick={() => window.confirm('確定刪除此預算項目嗎？') && remove(b.id!)}>✕</button>
            )}
          </div>
        </div>
      ))}
      {!readOnly && (
        <button className="btn btn-primary" onClick={addItem}>＋ 新增預算項目</button>
      )}
    </div>
  );
}
