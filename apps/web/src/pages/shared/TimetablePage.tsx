import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Slot } from '../../lib/types';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui';
import { IconCalendar } from '../../components/icons';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HOUR_PX = 56;                    // one hour of board height
const PX_PER_MIN = HOUR_PX / 60;

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Greedy lane assignment so overlapping classes sit side by side
 *  instead of on top of each other. Returns lane index + lane count
 *  shared by everything in the same overlap cluster. */
function layoutDay(slots: Slot[]): { slot: Slot; lane: number; lanes: number }[] {
  const sorted = [...slots].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
  const laneEnds: number[] = [];               // end minute of the last slot in each lane
  const placed = sorted.map((slot) => {
    const start = toMin(slot.startTime);
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = toMin(slot.endTime);
    return { slot, lane, lanes: 1 };
  });
  // Everything in a connected overlap cluster shares the widest lane count.
  let clusterStart = 0; let clusterEnd = -1; let maxLane = 0;
  const closeCluster = (upTo: number) => {
    for (let i = clusterStart; i < upTo; i++) placed[i]!.lanes = maxLane + 1;
  };
  placed.forEach((p, i) => {
    const start = toMin(p.slot.startTime);
    if (start >= clusterEnd && i > clusterStart) { closeCluster(i); clusterStart = i; maxLane = 0; clusterEnd = -1; }
    maxLane = Math.max(maxLane, p.lane);
    clusterEnd = Math.max(clusterEnd, toMin(p.slot.endTime));
  });
  closeCluster(placed.length);
  return placed;
}

/* ============================================================
   Timetable board — a real weekly roster. The hour axis runs
   down the side; each class is drawn at its actual time with a
   height proportional to its length. Today is highlighted and
   carries a live "now" line.
   ============================================================ */
export function TimetableGrid({ slots, onSlotClick }: {
  slots: Slot[];
  onSlotClick?: (slot: Slot) => void;
}) {
  const today = new Date().getDay();

  // Re-render the now-line each minute while mounted.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Mon–Fri always; weekend columns only when something is scheduled there.
  const days = [1, 2, 3, 4, 5, 6, 0].filter(
    (d) => (d >= 1 && d <= 5) || slots.some((s) => s.dayOfWeek === d),
  );

  // Hour range: 08–18 by default, stretched to fit whatever is scheduled.
  const startMins = slots.map((s) => toMin(s.startTime));
  const endMins = slots.map((s) => toMin(s.endTime));
  const dayStart = Math.min(8 * 60, ...(startMins.length ? [Math.floor(Math.min(...startMins) / 60) * 60] : []));
  const dayEnd = Math.max(18 * 60, ...(endMins.length ? [Math.ceil(Math.max(...endMins) / 60) * 60] : []));
  const hours: number[] = [];
  for (let h = dayStart / 60; h <= dayEnd / 60; h++) hours.push(h);
  const boardH = (dayEnd - dayStart) * PX_PER_MIN;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = days.includes(today) && nowMin >= dayStart && nowMin <= dayEnd;

  return (
    <div className="ttb-scroll">
      <div className="ttb" style={{ ['--ttb-cols' as never]: days.length }}>
        {/* Header row */}
        <div className="ttb-corner" aria-hidden="true" />
        {days.map((d) => (
          <div key={`h${d}`} className={`ttb-head ${d === today ? 'is-today' : ''}`.trim()}>
            <span className="ttb-head-name">{DAY_SHORT[d]}</span>
            {d === today && <span className="ttb-today-tag">Today</span>}
          </div>
        ))}

        {/* Hour gutter */}
        <div className="ttb-gutter" style={{ height: boardH }} aria-hidden="true">
          {hours.map((h) => (
            <span key={h} className="ttb-hour" style={{ top: (h * 60 - dayStart) * PX_PER_MIN }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d) => {
          const placed = layoutDay(slots.filter((s) => s.dayOfWeek === d));
          return (
            <div
              key={d}
              className={`ttb-col ${d === today ? 'is-today' : ''}`.trim()}
              style={{ height: boardH }}
              role="list"
              aria-label={DAY_NAMES[d]}
            >
              {hours.slice(0, -1).map((h) => (
                <span key={h} className="ttb-line" style={{ top: (h * 60 - dayStart) * PX_PER_MIN }} aria-hidden="true" />
              ))}

              {placed.map(({ slot: s, lane, lanes }) => {
                const top = (toMin(s.startTime) - dayStart) * PX_PER_MIN;
                const height = Math.max((toMin(s.endTime) - toMin(s.startTime)) * PX_PER_MIN, 28);
                const width = 100 / lanes;
                const Tag = onSlotClick ? 'button' : 'div';
                return (
                  <Tag
                    key={s.id}
                    type={onSlotClick ? 'button' : undefined}
                    className="ttb-event"
                    role="listitem"
                    style={{
                      top, height,
                      left: `calc(${lane * width}% + 3px)`,
                      width: `calc(${width}% - 6px)`,
                    }}
                    onClick={onSlotClick ? () => onSlotClick(s) : undefined}
                    aria-label={`${s.course?.code ?? 'Class'} ${DAY_NAMES[s.dayOfWeek]} ${s.startTime} to ${s.endTime}${s.room ? ` in ${s.room}` : ''}`}
                  >
                    <span className="ttb-event-time">{s.startTime}–{s.endTime}</span>
                    <span className="ttb-event-course">{s.course?.code}</span>
                    {height >= 48 && (
                      <span className="ttb-event-meta t-clamp-1">
                        {s.course?.name}{s.room ? ` · ${s.room}` : ''}
                      </span>
                    )}
                  </Tag>
                );
              })}

              {showNow && d === today && (
                <span
                  className="ttb-now"
                  style={{ top: (nowMin - dayStart) * PX_PER_MIN }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TimetablePage() {
  const timetable = useQuery({
    queryKey: ['my-timetable'],
    queryFn: () => api.get<Slot[]>('/me/timetable'),
  });

  return (
    <>
      <PageHeader
        title="Schedule"
        lede={timetable.data ? `${timetable.data.length} weekly ${timetable.data.length === 1 ? 'class' : 'classes'} across your courses` : 'Your weekly class schedule across every course.'}
      />
      {timetable.isLoading ? (
        <Skeleton h={420} className="sk-block" />
      ) : timetable.isError ? (
        <ErrorState title="Could not load your timetable" onRetry={() => timetable.refetch()} />
      ) : !timetable.data?.length ? (
        <EmptyState
          icon={<IconCalendar size={18} />}
          title="No classes scheduled"
          description="When classes are added to your courses' schedules, your week appears here."
        />
      ) : (
        <div className="ttb-frame"><TimetableGrid slots={timetable.data} /></div>
      )}
    </>
  );
}
