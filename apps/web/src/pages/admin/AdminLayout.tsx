import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../../components/shell/AppShell';
import { api } from '../../lib/api';
import type { PlatformStats } from '../../lib/types';

export default function AdminLayout() {
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<PlatformStats>('/users/stats'),
    refetchInterval: 120_000,
  });
  return <AppShell role="ADMIN" counts={{ pending: stats.data?.pending, live: stats.data?.liveSessions }} />;
}
