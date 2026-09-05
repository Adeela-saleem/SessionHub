import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { AppNotification, Page } from '../../lib/types';
import { Menu } from '../ui';
import { IconBell } from '../icons';
import { relativeTime } from '../../lib/format';

/* ============================================================
   Notification bell.
   The count polls quietly; the list is fetched when the panel
   opens. Clicking an item marks it read and follows its link.
   ============================================================ */
export function NotificationsBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const count = useQuery({
    queryKey: ['notif-count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
  });

  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Page<AppNotification>>('/notifications?take=12'),
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notif-count'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: invalidate,
  });

  const unread = count.data?.count ?? 0;
  const items = list.data?.items ?? [];

  return (
    <Menu
      label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      triggerClassName="icon-btn notif-btn"
      trigger={
        <>
          <IconBell size={17} />
          {unread > 0 && <span className="notif-dot">{unread > 9 ? '9+' : unread}</span>}
        </>
      }
    >
      {(close) => (
        <div className="notif-panel">
          <div className="notif-head">
            <span className="t-sm" style={{ fontWeight: 600 }}>Notifications</span>
            {unread > 0 && (
              <button type="button" className="notif-clear" onClick={() => markAll.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="notif-empty">Nothing yet. Announcements, grades and live classes will land here.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notif-item ${n.readAt ? '' : 'is-unread'}`.trim()}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate(n.id);
                      close();
                      if (n.link) navigate(n.link);
                    }}
                  >
                    <span className="notif-title">{n.title}</span>
                    {n.body && <span className="notif-body t-clamp-1">{n.body}</span>}
                    <span className="notif-when">{relativeTime(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Menu>
  );
}
