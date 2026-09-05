import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { User } from '../../lib/types';
import { applyTheme, currentTheme, type Theme } from '../../lib/theme';
import {
  Avatar, Badge, Banner, Button, Card, CardBody, CardFoot, CardHead,
  ConfirmDialog, PageHeader, Segmented, TextField, useToast,
} from '../../components/ui';
import { IconLogout, IconMail, IconMoon, IconSun } from '../../components/icons';
import { formatDate } from '../../lib/format';

/* ============================================================
   Settings
   Three groups, most-changed first: who you are, how the app
   looks, and the account itself.
   ============================================================ */
const ROLE_COPY: Record<string, string> = {
  STUDENT: 'You can join live sessions with a room code and track your own progress.',
  TEACHER: 'You can run live sessions, manage your course rosters and generate quizzes.',
  ADMIN: 'You can manage every account and course on the platform.',
};

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const toast = useToast();

  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const [error, setError] = useState('');
  const [confirmOut, setConfirmOut] = useState(false);

  const save = useMutation({
    mutationFn: (body: { name: string; department?: string }) =>
      api.patch<User>(`/users/${user!.id}`, body),
    onSuccess: (updated) => {
      updateUser({ name: updated.name, department: updated.department });
      setError('');
      toast.success('Profile saved');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not save your profile.'),
  });

  if (!user) return null;

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Settings"
        lede="Your profile, how SessionHub looks, and your account details."
      />

      <div className="settings-grid">
        {/* ── Profile ───────────────────────────────────── */}
        <Card>
          <CardHead title="Profile" sub="How your name appears to teachers and classmates" />
          <CardBody>
            {error && <Banner tone="error" title="Could not save">{error}</Banner>}
            <div className="settings-identity">
              <Avatar name={user.name} size="xl" accent />
              <div>
                <h3>{user.name}</h3>
                <p className="row-tight t-sm"><IconMail size={14} />{user.email}</p>
              </div>
            </div>
            <form
              id="profile-form"
              className="col"
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                save.mutate({
                  name: String(f.get('name')),
                  department: String(f.get('department') || '') || undefined,
                });
              }}
            >
              <TextField
                label="Full name" name="name" required minLength={2} maxLength={80}
                defaultValue={user.name}
                hint="Shown on rosters, question results and the Q&A panel."
              />
              <TextField
                label="Department" name="department" optional maxLength={80}
                defaultValue={user.department ?? ''}
                placeholder="Computer Science"
              />
            </form>
          </CardBody>
          <CardFoot>
            <div className="row-between">
              <span className="t-caption t-muted">Your email address cannot be changed here.</span>
              <Button form="profile-form" type="submit" loading={save.isPending}>Save changes</Button>
            </div>
          </CardFoot>
        </Card>

        {/* ── Appearance ────────────────────────────────── */}
        <Card>
          <CardHead title="Appearance" sub="Applies to this browser only" />
          <CardBody>
            <div className="field">
              <span className="field-label">Theme</span>
              <Segmented
                label="Theme"
                value={theme}
                onChange={(v) => { setTheme(v); applyTheme(v); }}
                options={[
                  { value: 'light', label: <span className="row-tight"><IconSun size={14} />Light</span> },
                  { value: 'dark', label: <span className="row-tight"><IconMoon size={14} />Dark</span> },
                ]}
              />
              <span className="field-hint">
                SessionHub follows your system setting until you choose one here.
              </span>
            </div>
          </CardBody>
        </Card>

        {/* ── Account ───────────────────────────────────── */}
        <Card>
          <CardHead title="Account" sub="Role, status and access" />
          <CardBody>
            <dl className="detail-list">
              <div>
                <dt>Role</dt>
                <dd><Badge tone={user.role === 'ADMIN' ? 'solid' : user.role === 'TEACHER' ? 'accent' : 'info'}>
                  {user.role[0] + user.role.slice(1).toLowerCase()}
                </Badge></dd>
              </div>
              <div><dt>What this allows</dt><dd className="t-sm">{ROLE_COPY[user.role]}</dd></div>
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>Member since</dt><dd>{user.createdAt ? formatDate(user.createdAt) : 'Not recorded'}</dd></div>
            </dl>
          </CardBody>
          <CardFoot>
            <div className="row-between">
              <span className="t-caption t-muted">Signing out ends this session on this device only.</span>
              <Button variant="secondary" onClick={() => setConfirmOut(true)}>
                <IconLogout size={15} />Log out
              </Button>
            </div>
          </CardFoot>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={() => void logout()}
        title="Log out of SessionHub?"
        description="You will need your email and password to sign back in. Any session you are in will be left."
        confirmLabel="Log out"
      />
    </>
  );
}
