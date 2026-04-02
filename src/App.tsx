import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginButton from './components/auth/LoginButton';
import HomePage from './pages/HomePage';
import PlannerPage from './pages/PlannerPage';
import LogisticsPage from './pages/LogisticsPage';
import ResourcesPage from './pages/ResourcesPage';
import AdminPage from './pages/AdminPage';
// 🚫 拔除：import { useFirestoreSync } from './hooks/useFirestoreSync';

type Page = 'home' | 'planner' | 'logistics' | 'resources' | 'admin';

function AppInner() {
  const [page, setPage] = useState<Page>('home');
  // ✅ 統一使用 Firestore 字串 ID
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { role, canRead, canWrite, activeTripId, setActiveTripId, tripMeta } = useAuth();

  const plannerWritable = canWrite('planner');
  const logisticsWritable = canWrite('flights') || canWrite('hotels') || canWrite('tickets');
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

  const allNavItems: { key: Page; icon: string; label: string }[] = [
    { key: 'home', icon: '🌍', label: '旅程' },
  ];

  // 只要有 activeTripId 且不是真正無權限的訪客，就顯示基本導航
  if (activeTripId) {
    // 先加入所有可能的導航項目，由子頁面內部的權限判斷顯示內容
    // 這樣可以避免權限載入瞬間導致導航列閃爍或跳轉失敗
    allNavItems.push({ key: 'planner', icon: '🗓️', label: '每日行程' });
    
    // 如果想要更嚴謹一點，可以判斷 canRead，但需確保載入中狀態不會誤判
    if (role === 'admin' || canRead('flights') || canRead('hotels') || canRead('tickets')) {
      allNavItems.push({ key: 'logistics', icon: '📋', label: '準備' });
    }
    if (role === 'admin' || canRead('resources')) {
      allNavItems.push({ key: 'resources', icon: '🔗', label: '連結' });
    }
    if (role === 'admin') {
      allNavItems.push({ key: 'admin', icon: '🔑', label: '授權' });
    }
  }

  useEffect(() => {
    const accessible = allNavItems.some((item) => item.key === page);
    if (!accessible) setPage('home');
  }, [role, activeTripId]);

  return (
    <div className={`app-container ${isOffline ? 'offline-active' : ''}`}>
      <div className="auth-bar" style={{ top: isOffline ? 40 : 12 }}>
        <div className="auth-bar-left">
          {page !== 'home' && activeTripId && tripMeta?.name && (
            <div className="current-trip-label">
              <span className="trip-emoji">✈️</span>
              <span className="trip-name">{tripMeta.name}</span>
            </div>
          )}
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

      <nav className="bottom-nav">
        {allNavItems
          .filter(item => page !== 'home' || item.key === 'home')
          .map(item => (
            <button
              key={item.key}
              className={`nav-item ${page === item.key ? 'active' : ''}`}
              onClick={() => setPage(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
      </nav>
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