import { useState, useEffect, useCallback } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { firestore } from './firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginButton from './components/auth/LoginButton';
import HomePage from './pages/HomePage';
import PlannerPage from './pages/PlannerPage';
import LogisticsPage from './pages/LogisticsPage';
import ResourcesPage from './pages/ResourcesPage';
import AdminPage from './pages/AdminPage';
import ChatWidget from './components/chat/ChatWidget';
import ScrollToTop from './components/shared/ScrollToTop';
import { importTrip, geocodeTripPlaces } from './utils/tripIO';
// 🚫 拔除：import { useFirestoreSync } from './hooks/useFirestoreSync';

type Page = 'home' | 'planner' | 'logistics' | 'resources' | 'admin';

function AppInner() {
  const [page, setPage] = useState<Page>('home');
  // ✅ 統一使用 Firestore 字串 ID
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { role, user, canRead, canWrite, activeTripId, setActiveTripId, tripMeta } = useAuth();

  const plannerWritable = canWrite('planner');
  const logisticsWritable =
    canWrite('flights') ||
    canWrite('hotels') ||
    canWrite('tickets') ||
    canWrite('checklist') ||
    canWrite('budget');
  const resourcesWritable = canWrite('resources');

  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    const onOnline = () => setIsOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // ✅ 現在我們只在乎 Firebase 的字串 ID
  const handleSelectTrip = (firebaseId: string) => {
    setActiveTripId(firebaseId);
    // 直接跳轉到行程頁面，不需檢查 role (權限會由子頁面自行判斷)
    setPage('planner');
  };

  // ── AI 助理操作回調 ──
  const handleAiNavigate = useCallback((p: Page) => {
    setPage(p);
  }, []);

  const handleAiAddFlight = useCallback(async (data: any) => {
    if (!activeTripId) throw new Error('沒有選取行程');
    await addDoc(collection(firestore, 'trips', activeTripId, 'flights'), {
      tripId: activeTripId,
      airline: data.airline || '',
      flightNo: data.flightNo || '',
      departureAirport: data.departureAirport || '',
      departureTime: data.departureTime || '',
      arrivalAirport: data.arrivalAirport || '',
      arrivalTime: data.arrivalTime || '',
      confirmNo: data.confirmNo || '',
      amount: typeof data.amount === 'number' ? data.amount : null,
      currency: data.currency || null,
      sortOrder: Date.now(),
    });
  }, [activeTripId]);

  const handleAiAddHotel = useCallback(async (data: any) => {
    if (!activeTripId) throw new Error('沒有選取行程');
    await addDoc(collection(firestore, 'trips', activeTripId, 'hotels'), {
      tripId: activeTripId,
      name: data.name || '',
      address: data.address || '',
      checkIn: data.checkIn || '',
      checkOut: data.checkOut || '',
      confirmNo: data.confirmNo || '',
      amount: typeof data.amount === 'number' ? data.amount : null,
      currency: data.currency || null,
      sortOrder: Date.now(),
    });
  }, [activeTripId]);

  const handleAiAddChecklistItem = useCallback(async (data: any) => {
    if (!activeTripId) throw new Error('沒有選取行程');
    await addDoc(collection(firestore, 'trips', activeTripId, 'checklistItems'), {
      tripId: activeTripId,
      category: data.category || '行前準備',
      text: data.text || '',
      checked: false,
      recipient: data.recipient || '',
      amount: typeof data.amount === 'number' ? data.amount : null,
      currency: data.currency || 'TWD',
      sortOrder: Date.now(),
    });
  }, [activeTripId]);

  const handleAiImportTrip = useCallback(async (tripData: any) => {
    if (!user) throw new Error('請先登入');
    const jsonStr = JSON.stringify(tripData);
    const newId = await importTrip(jsonStr, user.uid, user.email || '');
    setActiveTripId(newId);
    setPage('planner');
    return newId;
  }, [user, setActiveTripId]);

  const handleAiGeocodeTrip = useCallback(async (tripId: string) => {
    // Run in background without blocking
    geocodeTripPlaces(tripId, (msg) => {
      // We could use a global toast or status bar here. 
      // For now, let's log to console or provide feedback via AI if possible.
      console.log('Geocoding progress:', msg);
    }).catch(err => {
      console.error('Geocoding background error:', err);
    });
  }, []);

  const leftTabs: { key: Page; icon: string; label: string }[] = [];
  const rightTabs: { key: Page; icon: string; label: string }[] = [];

  if (activeTripId) {
    leftTabs.push({ key: 'planner', icon: '🗓️', label: '行程' });
    if (
      role === 'admin' ||
      canRead('flights') ||
      canRead('hotels') ||
      canRead('tickets') ||
      canRead('checklist') ||
      canRead('budget')
    ) {
      leftTabs.push({ key: 'logistics', icon: '📋', label: '準備' });
    }
    if (role === 'admin' || canRead('resources')) {
      rightTabs.push({ key: 'resources', icon: '🔗', label: '連結' });
    }
    if (role === 'admin') {
      rightTabs.push({ key: 'admin', icon: '🔑', label: '授權' });
    }
  }

  const allNavItems = [...leftTabs, { key: 'home', icon: '🌍', label: '旅程' } as const, ...rightTabs];

  useEffect(() => {
    const accessible = allNavItems.some((item) => item.key === page);
    if (!accessible) setPage('home');
  }, [role, activeTripId]);

  return (
    <div className={`app-container ${isOffline ? 'offline-active' : ''}`}>
      <div className="auth-bar" style={{ top: isOffline ? 40 : 12 }}>
        <div className="auth-bar-left">
          {page !== 'home' && activeTripId && tripMeta?.name && (() => {
            const currentTab = allNavItems.find(item => item.key === page);
            return (
              <div className="current-trip-label">
                <span className="trip-emoji" style={{ fontSize: '0.9rem' }}>✈️</span>
                <span className="trip-name-text">{tripMeta.name}</span>
                <span className="breadcrumb-sep">›</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="tab-emoji" style={{ fontSize: '0.85rem' }}>{currentTab?.icon}</span>
                  <span className="tab-name-text">{currentTab?.label}</span>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="auth-bar-right">
          {role !== 'guest' && (
            <span className="auth-role-badge">
              {role === 'admin' ? '管理者' : '成員'}
            </span>
          )}
          <LoginButton />
        </div>
      </div>

      {/* ✅ 在新架構下，離線時依然可以順暢使用 */}
      {isOffline && (
        <div className="offline-banner" style={{ background: '#f59e0b' }}>
          📡 離線中 — 變更將自動保存在本機，並於連線時同步
        </div>
      )}

      <main className="main-content" style={isOffline ? { marginTop: 28 } : undefined}>
        {page === 'home' && (
          <HomePage onSelectTrip={handleSelectTrip} activeTripId={activeTripId} role={role} />
        )}
        {/* 注意：這裡的 activeTripId 已經變成字串了 */}
        {page === 'planner' && activeTripId ? (
          <PlannerPage tripId={activeTripId} readOnly={!plannerWritable} />
        ) : page === 'planner' && (
          <div className="empty-state">
            <p style={{ fontSize: '3rem' }}>🗓️</p>
            <p>請先從旅程頁面選擇一趟旅程</p>
          </div>
        )}
        {page === 'logistics' && activeTripId ? (
          <LogisticsPage tripId={activeTripId} role={role} readOnly={!logisticsWritable} />
        ) : page === 'logistics' && (
          <div className="empty-state">
            <p style={{ fontSize: '3rem' }}>📋</p>
            <p>請先從旅程頁面選擇一趟旅程</p>
          </div>
        )}
        {page === 'resources' && activeTripId ? (
          <ResourcesPage tripId={activeTripId} readOnly={!resourcesWritable} />
        ) : page === 'resources' && (
          <div className="empty-state">
            <p style={{ fontSize: '3rem' }}>🔗</p>
            <p>請先從旅程頁面選擇一趟旅程</p>
          </div>
        )}
        {page === 'admin' && role === 'admin' && activeTripId && (
          <AdminPage tripId={activeTripId} />
        )}
      </main>

      <ChatWidget
        tripContext={tripMeta ? { name: tripMeta.name, startDate: tripMeta.startDate, endDate: tripMeta.endDate } : undefined}
        activeTripId={activeTripId}
        onNavigate={handleAiNavigate}
        onAddFlight={handleAiAddFlight}
        onAddHotel={handleAiAddHotel}
        onAddChecklistItem={handleAiAddChecklistItem}
        onImportTrip={handleAiImportTrip}
        onGeocodeTrip={handleAiGeocodeTrip}
      />

      <nav className="bottom-nav">
        {allNavItems
          .filter(item => page !== 'home' || item.key === 'home')
          .map(item => (
            <button
              key={item.key}
              className={`nav-item ${page === item.key ? 'active' : ''} ${item.key === 'home' ? 'nav-home' : ''}`}
              onClick={() => setPage(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
      </nav>
      <ScrollToTop />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
