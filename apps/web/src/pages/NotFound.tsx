import { useAuth } from '../lib/auth';
import { EmptyState, LinkButton } from '../components/ui';
import { homeFor } from '../lib/routes';

/* A dead end should still tell you where you are and offer the way back. */
export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="page-center">
      <div className="notfound">
        <span className="notfound-code t-data">404</span>
        <EmptyState
          title="This page doesn't exist"
          description="The link may be out of date, or the item it pointed to has been removed."
          action={
            <LinkButton to={user ? homeFor(user.role) : '/'} variant="secondary" size="sm">
              Back to {user ? 'your overview' : 'the home page'}
            </LinkButton>
          }
        />
      </div>
    </div>
  );
}
