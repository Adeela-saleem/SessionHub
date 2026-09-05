import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { tokens } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { NAME_HINT, NAME_PATTERN, NAME_RULE } from '../../lib/limits';
import type { User } from '../../lib/types';
import {
  applyRail, applyTheme, clearTheme, storedRail, storedTheme, type Rail, type Theme,
} from '../../lib/theme';
import {
  Avatar, Badge, Banner, Button, ConfirmDialog, PageHeader, PasswordField,
  Segmented, Tabs, TextField, useToast,
} from '../../components/ui';
import { IconLogout, IconMoon, IconSun } from '../../components/icons';
import { formatDate } from '../../lib/format';

/* ============================================================
   Settings
   A form column, not a grid of cards. Three groups, most-changed
   first: who you are, how the app looks, and the account itself.
   ============================================================ */
const ROLE_COPY: Record<string, string> = {
  STUDENT: 'Join live sessions with a room code and track your own progress.',
  TEACHER: 'Run live sessions, manage course rosters and generate quizzes.',
  ADMIN: 'Manage every account and course on the platform.',
};

function SettingsSection({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <h2 className="section-title">{title}</h2>
        {sub && <p className="t-caption t-muted">{sub}</p>}
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<'profile' | 'security'>('profile');
  const [theme, setTheme] = useState<Theme | 'system'>(() => storedTheme() ?? 'system');
  const [rail, setRail] = useState<Rail>(() => storedRail());
  const [error, setError] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState(false);
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

  /**
   * The server revokes every refresh token when a password changes and
   * returns a fresh pair. Storing it here keeps this device signed in
   * while every other session is ended.
   */
  const changePassword = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post<{ accessToken: string; refreshToken: string }>('/auth/change-password', body),
    onSuccess: (data) => {
      tokens.set(data.accessToken, data.refreshToken);
      setPwError('');
      setPwDone(true);
      toast.success('Password changed', 'Other devices have been signed out.');
    },
    onError: (e) => {
      setPwDone(false);
      setPwError(e instanceof ApiError ? e.message : 'Could not change your password.');
    },
  });

  if (!user) return null;

  return (
    <div className="container-form">
      <PageHeader title="Settings" lede="Your profile, how SessionHub looks, and your account." />

      <Tabs
        label="Settings sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'profile', label: 'Profile' },
          { value: 'security', label: 'Security' },
        ]}
      />

      {tab === 'security' ? (
        <>
          <SettingsSection title="Change password" sub="Signs out every other device. This one stays signed in.">
            {pwError && <Banner tone="error" title="Could not change your password">{pwError}</Banner>}
            {pwDone && (
              <Banner tone="success" title="Password changed">
                Any other browser or device signed into this account has been signed out.
              </Banner>
            )}
            <form
              id="password-form"
              className="form"
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const next = String(f.get('newPassword'));
                if (next !== String(f.get('confirmPassword'))) {
                  setPwDone(false);
                  setPwError('The two new passwords do not match.');
                  return;
                }
                setPwError('');
                changePassword.mutate({
                  currentPassword: String(f.get('currentPassword')),
                  newPassword: next,
                });
                e.currentTarget.reset();
              }}
            >
              <PasswordField
                label="Current password" name="currentPassword" required autoComplete="current-password"
              />
              <PasswordField
                label="New password" name="newPassword" required autoComplete="new-password"
                hint="At least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol."
              />
              <PasswordField label="Confirm new password" name="confirmPassword" required autoComplete="new-password" />
              <div className="form-actions">
                <span className="t-caption t-muted grow">Stored as an Argon2 hash, never in plain text.</span>
                <Button type="submit" loading={changePassword.isPending}>Change password</Button>
              </div>
            </form>
          </SettingsSection>

          <SettingsSection title="Sessions" sub="How access to this account is held">
            <dl className="kv">
              <div><dt>Sign-in</dt><dd>Email and password</dd></div>
              <div><dt>Access token</dt><dd>Short-lived, refreshed automatically</dd></div>
              <div><dt>On password change</dt><dd>All other devices signed out</dd></div>
            </dl>
            <div className="form-actions">
              <span className="t-caption t-muted grow">Signing out ends this session on this device only.</span>
              <Button variant="secondary" onClick={() => setConfirmOut(true)}>
                <IconLogout size={15} />Log out
              </Button>
            </div>
          </SettingsSection>
        </>
      ) : (
        <>
          <SettingsSection title="Profile" sub="How your name appears to teachers and classmates">
            {error && <Banner tone="error" title="Could not save">{error}</Banner>}
            <div className="settings-identity">
              <Avatar name={user.name} size="lg" accent />
              <div>
                <div className="t-sm" style={{ fontWeight: 500, color: 'var(--text)' }}>{user.name}</div>
                <div className="t-caption t-muted">{user.email}</div>
              </div>
            </div>
            <form
              id="profile-form"
              className="form"
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const name = String(f.get('name')).trim();
                if (name.length < 2 || !NAME_RULE.test(name)) {
                  setError(NAME_HINT);
                  return;
                }
                save.mutate({
                  name,
                  department: String(f.get('department') || '') || undefined,
                });
              }}
            >
              <div className="form-row">
                <TextField
                  label="Full name" name="name" required minLength={2} maxLength={80}
                  pattern={NAME_PATTERN} title={NAME_HINT}
                  defaultValue={user.name}
                  hint="Letters only, no numbers."
                />
                <TextField
                  label="Department" name="department" optional maxLength={80}
                  defaultValue={user.department ?? ''}
                  placeholder="Computer Science"
                />
              </div>
              <div className="form-actions">
                <span className="t-caption t-muted grow">Your email address cannot be changed here.</span>
                <Button type="submit" loading={save.isPending}>Save changes</Button>
              </div>
            </form>
          </SettingsSection>

          <SettingsSection title="Appearance" sub="Applies to this browser only">
            <div className="form">
              <div className="field">
                <span className="field-label">Theme</span>
                <Segmented
                  label="Theme"
                  value={theme}
                  onChange={(v) => {
                    setTheme(v);
                    if (v === 'system') clearTheme();
                    else applyTheme(v as Theme);
                  }}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: <span className="row-tight"><IconSun size={13} />Light</span> },
                    { value: 'dark', label: <span className="row-tight"><IconMoon size={13} />Dark</span> },
                  ]}
                />
                <span className="field-hint">System follows your device; a choice here pins one look.</span>
              </div>
              <div className="field">
                <span className="field-label">Navigation rail</span>
                <Segmented
                  label="Navigation rail"
                  value={rail}
                  onChange={(v) => { setRail(v); applyRail(v); }}
                  options={[
                    { value: 'navy', label: 'Navy' },
                    { value: 'light', label: 'Light' },
                  ]}
                />
                <span className="field-hint">Navy is the SessionHub foundation colour; light is a quieter panel.</span>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Account" sub="Role, status and access">
            <dl className="kv">
              <div>
                <dt>Role</dt>
                <dd><Badge tone={user.role === 'ADMIN' ? 'solid' : user.role === 'TEACHER' ? 'accent' : 'info'}>
                  {user.role[0] + user.role.slice(1).toLowerCase()}
                </Badge></dd>
              </div>
              <div><dt>What this allows</dt><dd style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>{ROLE_COPY[user.role]}</dd></div>
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              {user.createdAt && <div><dt>Member since</dt><dd>{formatDate(user.createdAt)}</dd></div>}
            </dl>
            <div className="form-actions">
              <span className="t-caption t-muted grow">Signing out ends this session on this device only.</span>
              <Button variant="secondary" onClick={() => setConfirmOut(true)}>
                <IconLogout size={15} />Log out
              </Button>
            </div>
          </SettingsSection>
        </>
      )}

      <ConfirmDialog
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={() => void logout()}
        title="Log out of SessionHub?"
        description="You will need your email and password to sign back in. Any session you are in will be left."
        confirmLabel="Log out"
      />
    </div>
  );
}
