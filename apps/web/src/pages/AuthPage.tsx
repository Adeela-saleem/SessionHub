import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError, NetworkError } from '../lib/api';
import { NAME_HINT, NAME_PATTERN, NAME_RULE } from '../lib/limits';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  Banner, Button, PasswordField, Segmented, SelectField, Tabs, TextField,
} from '../components/ui';
import { IconArrowLeft } from '../components/icons';

type Mode = 'login' | 'signup';

const COPY: Record<Mode, { title: string; sub: string; cta: string }> = {
  login: {
    title: 'Welcome back',
    sub: 'Sign in to run or join a live session.',
    cta: 'Log in',
  },
  signup: {
    title: 'Create an account',
    sub: 'Students can join a session straight away. Teaching accounts are verified by an administrator first.',
    cta: 'Create account',
  },
};

const PROMISES = [
  'Join a live session with a six-character code',
  'Answers scored and recorded as they arrive',
  'Attendance and accuracy tracked per course',
];

/** Field-level errors the API reports, mapped back onto inputs. */
function fieldFor(message: string): 'email' | 'password' | null {
  const m = message.toLowerCase();
  if (m.includes('email')) return 'email';
  if (m.includes('password')) return 'password';
  return null;
}

export default function AuthPage() {
  const { login, signup } = useAuth();

  // Signup-intent links across the site arrive as /auth?mode=signup; a bare
  // /auth still lands on login. Read once — switching tabs in-page need not
  // rewrite the URL.
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [role, setRole] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function switchMode(next: Mode) {
    setMode(next); setError(''); setNotice('');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    const f = new FormData(e.currentTarget);

    try {
      if (mode === 'login') {
        await login(String(f.get('email')), String(f.get('password')));
      } else {
        const name = String(f.get('name')).trim();
        if (name.length < 2 || !NAME_RULE.test(name)) {
          setError(NAME_HINT);
          return;
        }
        const res = await signup({
          email: String(f.get('email')),
          name,
          password: String(f.get('password')),
          role,
          department: String(f.get('department') || '') || undefined,
          year: role === 'STUDENT' && f.get('year') ? Number(f.get('year')) : undefined,
        });
        if (res.pendingApproval) {
          // The account exists but cannot sign in yet, so drop the person
          // on the login tab with the reason still on screen.
          setMode('login');
          setNotice(res.message ?? 'Account created. An administrator will review it shortly.');
        }
      }
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof NetworkError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const copy = COPY[mode];
  const inlineField = error ? fieldFor(error) : null;

  return (
    <div className="auth">
      {/* ── Brand panel ─────────────────────────────────── */}
      <aside className="auth-aside">
        <div className="auth-aside-inner">
          <Link to="/" className="auth-aside-logo">
            <span className="brand-mark" aria-hidden="true">S</span>
            <span>SessionHub</span>
          </Link>

          <div>
            <h2 className="auth-aside-title">The lecture hall, finally in sync.</h2>
            <ul className="auth-promises">
              {PROMISES.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
        </div>
      </aside>

      {/* ── Form ────────────────────────────────────────── */}
      <main className="auth-main" id="main">
        <div className="auth-main-top">
          <Link to="/" className="btn btn-tertiary btn-sm">
            <IconArrowLeft size={14} />Back to site
          </Link>
          <ThemeToggle />
        </div>

        <div className="auth-form-wrap">
          <Tabs
            label="Authentication mode"
            value={mode}
            onChange={switchMode}
            items={[{ value: 'login', label: 'Log in' }, { value: 'signup', label: 'Sign up' }]}
          />

          <div className="auth-intro">
            <h1>{copy.title}</h1>
            <p>{copy.sub}</p>
          </div>

          {error && <Banner tone="error" title="Could not continue">{error}</Banner>}
          {notice && <Banner tone="success" title="Account created">{notice}</Banner>}

          <form onSubmit={onSubmit} noValidate className="form auth-form">
            {mode === 'signup' && (
              <>
                <div className="field">
                  <span className="field-label">I am a</span>
                  <Segmented
                    label="Account type"
                    value={role}
                    onChange={setRole}
                    options={[{ value: 'STUDENT', label: 'Student' }, { value: 'TEACHER', label: 'Teacher' }]}
                  />
                </div>

                <TextField
                  label="Full name" name="name" required minLength={2} maxLength={80}
                  pattern={NAME_PATTERN} title={NAME_HINT}
                  autoComplete="name" placeholder="Ayesha Rahman"
                  hint="Letters only, no numbers."
                />
              </>
            )}

            <TextField
              label="Email address" name="email" type="email" required
              autoComplete="email" placeholder="you@university.edu"
              error={inlineField === 'email' ? error : undefined}
            />

            <PasswordField
              label="Password" name="password" required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              hint={mode === 'signup'
                ? 'At least 8 characters, with an uppercase letter, a number and a symbol.'
                : undefined}
              error={inlineField === 'password' ? error : undefined}
            />

            {mode === 'signup' && (
              <div className="form-row">
                <TextField label="Department" name="department" optional placeholder="Computer Science" />
                {role === 'STUDENT' && (
                  <SelectField label="Year of study" name="year" defaultValue="1">
                    {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
                  </SelectField>
                )}
              </div>
            )}

            {mode === 'signup' && role === 'TEACHER' && (
              <Banner tone="info" title="Reviewed before first sign-in">
                An administrator approves teaching accounts before they can sign in.
              </Banner>
            )}

            <Button type="submit" size="lg" block loading={busy}>{copy.cta}</Button>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? "Don't have an account? " : 'Already registered? '}
            <button type="button" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? 'Create one' : 'Log in instead'}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
