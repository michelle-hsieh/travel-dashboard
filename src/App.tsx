import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginButton from './components/auth/LoginButton';
import HomePage from './pages/HomePage';
import PlannerPage from './pages/PlannerPage';
import LogisticsPage from './pages/LogisticsPage';
import ResourcesPage from './pages/ResourcesPage';
import AdminPage from './pages/AdminPage';
import { useFirestoreSync } from './hooks/useFirestoreSync';

type Page = 'home' | 'planner' | 'logistics' | 'resources' | 'admin';

function AppInner() {
  const [page, setPage] = useState<Page>('home');
  const [activeTripId, setActiveTripId] = useState<number | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { role, user, canRead, canWrite, activeTripId: firestoreTripId, setActiveTripId: setAuthTripId } = useAuth();

  // Pre-compute write permissions (never call hooks conditionally)
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

  const handleSelectTrip = (tripId: number, firebaseId?: string) => {
    setActiveTripId(tripId);
    // Prefer firebaseId for Firestore doc access; fallback to local numeric id
    setAuthTripId(firebaseId ?? String(tripId));
    // Guests can only see the trip list, not enter details
    if (role !== 'guest') {
      setPage('planner');
    }
  };

  // Auto sync: admin uploads; member subscribes
  useFirestoreSync(activeTripId, firestoreTripId, role, user, setAuthTripId);

  // Build nav items based on role and permissions
  const allNavItems: { key: Page; icon: string; label: string }[] = [
    { key: 'home', icon: '🌍', label: '旅程' },
  ];

  if (activeTripId && role !== 'guest') {
    if (canRead('planner')) {
      allNavItems.push({ key: 'planner', icon: '🗓️', label: '每日行程' });
    }
    if (canRead('flights') || canRead('hotels') || canRead('tickets')) {
      allNavItems.push({ key: 'logistics', icon: '📋', label: '準備' });
    }
    if (canRead('resources')) {
      allNavItems.push({ key: 'resources', icon: '🔗', label: '連結' });
    }
    if (role === 'admin') {
      allNavItems.push({ key: 'admin', icon: '🔑', label: '授權' });
    }
  }

  // Reset to home if current page is not accessible
  useEffect(() => {
    const accessible = allNavItems.some((item) => item.key === page);
    if (!accessible) setPage('home');
  }, [role, activeTripId]);

  return (
    <div className="app-container">
      {/* Top auth bar */}
      <div className="auth-bar">
        <LoginButton />
        {role !== 'guest' && (
          <span className="auth-role-badge">
            {role === 'admin' ? '管理者' : '成員'}
          </span>
        )}
      </div>

      {isOffline && (
        <div className="offline-banner">
          📡 離線中 — 變更已儲存在本機
        </div>
      )}

      <main className="main-content" style={isOffline ? { marginTop: 28 } : undefined}>
        {page === 'home' && (
          <HomePage onSelectTrip={handleSelectTrip} activeTripId={activeTripId} role={role} />
        )}
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
        {page === 'admin' && role === 'admin' && firestoreTripId && (
          <AdminPage tripId={firestoreTripId} />
        )}
      </main>

      <nav className="bottom-nav">
        {allNavItems.map(item => (
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
