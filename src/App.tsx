import { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import PlannerPage from './pages/PlannerPage';
import LogisticsPage from './pages/LogisticsPage';
import ResourcesPage from './pages/ResourcesPage';

type Page = 'home' | 'planner' | 'logistics' | 'resources';

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [activeTripId, setActiveTripId] = useState<number | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

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

  const handleSelectTrip = (tripId: number) => {
    setActiveTripId(tripId);
    setPage('planner');
  };

  const allNavItems: { key: Page; icon: string; label: string }[] = [
    { key: 'home', icon: '🌍', label: '旅程' },
    { key: 'logistics', icon: '📋', label: '準備' },
    { key: 'planner', icon: '🗓️', label: '每日行程' },
    { key: 'resources', icon: '🔗', label: '連結' },
  ];
  const navItems = activeTripId
    ? allNavItems
    : allNavItems.filter(i => i.key === 'home');

  return (
    <div className="app-container">
      {isOffline && (
        <div className="offline-banner">
          📡 離線中 — 變更已儲存在本機
        </div>
      )}

      <main className="main-content" style={isOffline ? { marginTop: 28 } : undefined}>
        {page === 'home' && (
          <HomePage onSelectTrip={handleSelectTrip} activeTripId={activeTripId} />
        )}
        {page === 'planner' && activeTripId ? (
          <PlannerPage tripId={activeTripId} />
        ) : page === 'planner' && (
          <div className="empty-state">
            <p style={{ fontSize: '3rem' }}>🗓️</p>
            <p>請先從旅程頁面選擇一趟旅程</p>
          </div>
        )}
        {page === 'logistics' && activeTripId ? (
          <LogisticsPage tripId={activeTripId} />
        ) : page === 'logistics' && (
          <div className="empty-state">
            <p style={{ fontSize: '3rem' }}>📋</p>
            <p>請先從旅程頁面選擇一趟旅程</p>
          </div>
        )}
        {page === 'resources' && activeTripId ? (
          <ResourcesPage tripId={activeTripId} />
        ) : page === 'resources' && (
          <div className="empty-state">
            <p style={{ fontSize: '3rem' }}>🔗</p>
            <p>請先從旅程頁面選擇一趟旅程</p>
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        {navItems.map(item => (
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
