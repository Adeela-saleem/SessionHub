import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../../components/shell/AppShell';
import { LiveSessionProvider, useLiveSession } from '../../features/session/LiveSessionContext';
import { api } from '../../lib/api';
import type { ClassSession } from '../../lib/types';

/** Counts feed the sidebar markers, so they live above the shell. */
function Shell() {
  const { session } = useLiveSession();
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<ClassSession[]>('/sessions'),
    refetchInterval: 60_000,
  });
  const liveCount = sessions.data?.filter((s) => s.status === 'LIVE').length ?? 0;
  return <AppShell role="STUDENT" counts={{ live: session ? 1 : liveCount }} />;
}

export default function StudentLayout() {
  return (
    <LiveSessionProvider role="STUDENT">
      <Shell />
    </LiveSessionProvider>
  );
}
