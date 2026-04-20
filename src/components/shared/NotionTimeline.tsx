import { useRef, useEffect, useMemo, useCallback } from 'react';
import { FirestoreTripInfo } from '../../hooks/useFirestoreSync';
import { normalizeEmail } from '../../utils/emails';

interface NotionTimelineProps {
  trips: FirestoreTripInfo[];
  activeTripId: string | null;
  userEmailNorm: string;
  isGlobalAdmin: boolean;
  user: any;
  onSelectTrip: (id: string) => void;
}

const DAY_WIDTH = 42;
const ROW_HEIGHT = 50;
const HEADER_HEIGHT = 56;

const COLORS = [
  'var(--accent)',
  '#e87b35',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#10b981',
  '#f59e0b',
  '#6366f1',
];

function toDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function NotionTimeline({
  trips,
  activeTripId,
  userEmailNorm,
  isGlobalAdmin,
  user,
  onSelectTrip,
}: NotionTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { rangeStart, totalDays, monthMarkers, today } = useMemo(() => {
    const validTrips = trips.filter(t => t.startDate && t.endDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (validTrips.length === 0) {
      const rs = addDays(now, -45);
      const re = addDays(now, 45);
      return { rangeStart: rs, totalDays: 90, monthMarkers: [] as { label: string; offset: number; width: number }[], today: now };
    }

    const allStarts = validTrips.map(t => toDate(t.startDate));
    const allEnds = validTrips.map(t => toDate(t.endDate));
    const earliest = new Date(Math.min(...allStarts.map(d => d.getTime()), now.getTime()));
    const latest = new Date(Math.max(...allEnds.map(d => d.getTime()), now.getTime()));

    const targetStart = addDays(earliest, -14);
    const targetEnd = addDays(latest, 21);
    
    // Balance the range so that 'today' is the exact center of the timeline.
    // This allows the horizontal scrollbar's thumb to be centered as well.
    const leftDist = daysBetween(targetStart, now);
    const rightDist = daysBetween(now, targetEnd);
    const maxDist = Math.max(45, leftDist, rightDist); // At least 45 days on each side

    const rangeStart = addDays(now, -maxDist);
    const rangeEnd = addDays(now, maxDist);
    const totalDays = daysBetween(rangeStart, rangeEnd);

    // Month markers with width
    const monthMarkers: { label: string; offset: number; width: number }[] = [];
    const cursor = new Date(rangeStart);
    cursor.setDate(1);
    if (cursor < rangeStart) cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= rangeEnd) {
      const nextMonth = new Date(cursor);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const endBound = nextMonth > rangeEnd ? rangeEnd : nextMonth;
      monthMarkers.push({
        label: cursor.toLocaleDateString('zh-TW', { year: 'numeric', month: 'short' }),
        offset: daysBetween(rangeStart, cursor),
        width: daysBetween(cursor, endBound),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return { rangeStart, totalDays, monthMarkers, today: now };
  }, [trips]);

  const scrollToToday = useCallback(() => {
    if (!scrollRef.current) return;
    const todayOffset = daysBetween(rangeStart, today);
    const scrollTarget = todayOffset * DAY_WIDTH - scrollRef.current.clientWidth / 2;
    scrollRef.current.scrollTo({ left: Math.max(0, scrollTarget), behavior: 'smooth' });
  }, [rangeStart, today]);

  // Scroll to today on mount — defer so DOM is fully painted and clientWidth is real
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const apply = () => {
      const todayOffset = daysBetween(rangeStart, today);
      const scrollTarget = todayOffset * DAY_WIDTH - el.clientWidth / 2;
      el.scrollLeft = Math.max(0, scrollTarget);
    };
    // Run immediately in case the element is already sized, then again after paint
    apply();
    const id = requestAnimationFrame(() => { apply(); });
    return () => cancelAnimationFrame(id);
  }, [rangeStart, today]);

  const todayOffset = daysBetween(rangeStart, today);

  // Day headers
  const dayHeaders: { label: string; offset: number; isWeekend: boolean; isToday: boolean; isFirstOfMonth: boolean }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(rangeStart, i);
    const dow = d.getDay();
    dayHeaders.push({
      label: d.getDate().toString(),
      offset: i,
      isWeekend: dow === 0 || dow === 6,
      isToday: i === todayOffset,
      isFirstOfMonth: d.getDate() === 1,
    });
  }

  const canAccess = (trip: FirestoreTripInfo) => {
    const pub = trip.publicPermissions;
    const hasPublicAccess = pub && typeof pub === 'object' && Object.values(pub).some(v => v !== 'none');
    const isOwner = user?.uid === trip.adminUid || (trip.adminEmail && normalizeEmail(trip.adminEmail) === userEmailNorm);
    const isCollaborator = !!(trip.collaboratorEmails?.includes(userEmailNorm) || trip.memberEmails?.includes(userEmailNorm));
    return !!(isGlobalAdmin || isOwner || isCollaborator || hasPublicAccess);
  };

  return (
    <div className="notion-timeline-wrapper">
      {/* Go to Today button */}
      <button className="notion-timeline-today-btn" onClick={scrollToToday} title="回到今天">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        今天
      </button>

      {/* Scrollable chart */}
      <div className="notion-timeline-scroll" ref={scrollRef}>
        <div
          className="notion-timeline-chart"
          style={{ width: totalDays * DAY_WIDTH, minHeight: trips.length * ROW_HEIGHT + HEADER_HEIGHT }}
        >
          {/* Month row */}
          <div className="notion-timeline-months">
            {monthMarkers.map((m, i) => (
              <div
                key={i}
                className="notion-timeline-month"
                style={{ left: m.offset * DAY_WIDTH, width: m.width * DAY_WIDTH }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Day row */}
          <div className="notion-timeline-days">
            {dayHeaders.map((d, i) => (
              <div
                key={i}
                className={`notion-timeline-day ${d.isWeekend ? 'weekend' : ''} ${d.isToday ? 'today' : ''}`}
                style={{ left: d.offset * DAY_WIDTH, width: DAY_WIDTH }}
              >
                {d.label}
              </div>
            ))}
          </div>

          {/* Weekend background columns */}
          <div className="notion-timeline-grid" style={{ top: HEADER_HEIGHT, height: trips.length * ROW_HEIGHT }}>
            {dayHeaders.filter(d => d.isWeekend).map((d, i) => (
              <div
                key={i}
                className="notion-timeline-grid-col weekend"
                style={{ left: d.offset * DAY_WIDTH, width: DAY_WIDTH, height: '100%' }}
              />
            ))}
            {/* Row dividers */}
            {trips.map((_, idx) => (
              <div
                key={`row-${idx}`}
                className="notion-timeline-row-line"
                style={{ top: (idx + 1) * ROW_HEIGHT }}
              />
            ))}
          </div>

          {/* Today marker line — starts below the date header */}
          {todayOffset >= 0 && todayOffset <= totalDays && (
            <div
              className="notion-timeline-today-line"
              style={{
                left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2,
                top: HEADER_HEIGHT,
                height: trips.length * ROW_HEIGHT
              }}
            />
          )}

          {/* Trip bars */}
          <div className="notion-timeline-bars" style={{ top: HEADER_HEIGHT }}>
            {trips.map((trip, idx) => {
              if (!trip.startDate || !trip.endDate) return null;
              const startOffset = daysBetween(rangeStart, toDate(trip.startDate));
              const duration = daysBetween(toDate(trip.startDate), toDate(trip.endDate)) + 1;
              const color = COLORS[idx % COLORS.length];
              const isActive = trip.firestoreId === activeTripId;
              const totalNights = duration - 1;

              return (
                <div
                  key={trip.firestoreId}
                  className={`notion-timeline-bar ${isActive ? 'active' : ''}`}
                  style={{
                    left: startOffset * DAY_WIDTH + 2,
                    width: Math.max(duration * DAY_WIDTH - 4, DAY_WIDTH),
                    top: idx * ROW_HEIGHT + 8,
                    height: ROW_HEIGHT - 16,
                    background: color,
                  }}
                  onClick={() => canAccess(trip) && onSelectTrip(trip.firestoreId)}
                  title={`${trip.name}\n${trip.startDate} ~ ${trip.endDate}\n${totalNights}晚${duration}天`}
                >
                  <span className="notion-timeline-bar-label">{trip.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
