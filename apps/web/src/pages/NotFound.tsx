import { useAuth } from '../lib/auth';
import { EmptyState, LinkButton } from '../components/ui';
import { IconHelp } from '../components/icons';
import { homeFor } from '../lib/routes';

/* A dead end should still tell you where you are and offer the way back. */
export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="page-center">
      <EmptyState
        icon={<IconHelp size={20} />}
        title="This page doesn't exist"
        description="The link may be out of date, or the item it pointed to has been removed."
        action={<LinkButton to={user ? homeFor(user.role) : '/'}>Back to {user ? 'your dashboard' : 'the home page'}</LinkButton>}
      />
    </div>
  );
}
