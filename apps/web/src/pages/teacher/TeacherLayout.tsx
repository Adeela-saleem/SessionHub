import { AppShell } from '../../components/shell/AppShell';
import { LiveSessionProvider, useLiveSession } from '../../features/session/LiveSessionContext';

function Shell() {
  const { session } = useLiveSession();
  return <AppShell role="TEACHER" counts={{ live: session ? 1 : 0 }} />;
}

export default function TeacherLayout() {
  return (
    <LiveSessionProvider role="TEACHER">
      <Shell />
    </LiveSessionProvider>
  );
}
