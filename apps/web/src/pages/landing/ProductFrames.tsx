import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { NAV, SECONDARY_NAV } from '../../components/shell/nav';
import { ICONS } from '../../components/icons';
import type { Role } from '../../lib/types';

/* ============================================================
   Product frames
   Faithful, marketing-scale reproductions of screens that ship
   in this application, drawn with the same structure the shell
   uses: the rail is generated from the real NAV data, the KPI
   row is ruled not boxed, lists are tables. Nothing below
   depicts a feature the product does not have; every number is
   a demonstration value inside a product frame.
   ============================================================ */

const ROLE_WORD: Record<Role, string> = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Administrator' };
const ROLE_NAME: Record<Role, string> = { STUDENT: 'Ada Lovelace', TEACHER: 'Rabia Ahmed', ADMIN: 'Super Admin' };

export function ProductWindow({
  role, active, path, title, children, className = '', chromeless, sidebar = true, live,
}: {
  role: Role;
  /** Route of the nav item to show as current. */
  active: string;
  path: string;
  title: string;
  children: ReactNode;
  className?: string;
  chromeless?: boolean;
  /** Cropped compositions drop the rail rather than hiding it. */
  sidebar?: boolean;
  /** Shows the header's live pill. */
  live?: boolean;
}) {
  const section = [...NAV[role].flatMap((g) => g.items), ...SECONDARY_NAV[role]]
    .find((i) => i.to === active)?.label ?? 'Overview';
  return (
    <figure className={`pf ${className}`.trim()} aria-labelledby={`pf-${path.replace(/\W/g, '')}`}>
      {!chromeless && (
        <div className="pf-chrome">
          <span className="pf-lights" aria-hidden="true"><i /><i /><i /></span>
          <span className="pf-url">
            <span className="pf-url-lock" aria-hidden="true" />
            sessionhub.edu<span>{path}</span>
          </span>
        </div>
      )}
      <div className={`pf-body ${sidebar ? '' : 'is-solo'}`.trim()}>
        {sidebar && <ProductSidebar role={role} active={active} />}
        <div className="pf-main">
          <div className="pf-top" aria-hidden="true">
            <span className="pf-crumbs">{section}</span>
            <span className="pf-top-end">
              {live && <span className="pf-pill is-live"><i />Live</span>}
              <span className="pf-find">Search<kbd>⌘K</kbd></span>
              <span className="pf-icon" />
              <span className="pf-icon" />
            </span>
          </div>
          {children}
        </div>
      </div>
      <figcaption id={`pf-${path.replace(/\W/g, '')}`} className="sr-only">{title}</figcaption>
    </figure>
  );
}

function ProductSidebar({ role, active }: { role: Role; active: string }) {
  const initials = ROLE_NAME[role].split(' ').map((n) => n[0]).join('');
  return (
    <div className="pf-side" aria-hidden="true">
      <div className="pf-brand"><span>S</span>SessionHub</div>
      <div className="pf-context">
        <span className="pf-av">{initials}</span>
        <span className="pf-context-id">Computer Science<em>{ROLE_WORD[role]}</em></span>
      </div>
      {NAV[role].map((group, gi) => (
        <div className="pf-navgroup" key={group.label ?? gi}>
          {group.label && <span className="pf-navlabel">{group.label}</span>}
          {group.items.map((item) => {
            const Ico = ICONS[item.icon];
            return (
              <span key={item.to} className={`pf-navitem ${item.to === active ? 'is-active' : ''}`.trim()}>
                <Ico size={12} />{item.label}
              </span>
            );
          })}
        </div>
      ))}
      <div className="pf-side-foot">
        {SECONDARY_NAV[role].map((item) => {
          const Ico = ICONS[item.icon];
          return <span key={item.to} className="pf-navitem"><Ico size={12} />{item.label}</span>;
        })}
        <span className="pf-user"><span className="pf-av">{initials}</span><span className="pf-context-id">{ROLE_NAME[role]}<em>{ROLE_WORD[role].toLowerCase()}@sessionhub.edu</em></span></span>
      </div>
    </div>
  );
}

function PfHead({ title, lede, action }: { title: string; lede?: string; action?: ReactNode }) {
  return (
    <div className="pf-head" aria-hidden="true">
      <div>
        <h4>{title}</h4>
        {lede && <span className="pf-lede">{lede}</span>}
      </div>
      {action}
    </div>
  );
}

function PfSection({ title, sub, link, children }: { title: string; sub?: string; link?: string; children: ReactNode }) {
  return (
    <div className="pf-section" aria-hidden="true">
      <div className="pf-section-head">
        <span>{title}{sub && <em>{sub}</em>}</span>
        {link && <span className="pf-link">{link} →</span>}
      </div>
      {children}
    </div>
  );
}

/* ============================================================
   Teacher — live classroom. The signature screen: status bar,
   the open question on the stage, the queue, and the controls.
   ============================================================ */
function useLivePulse(enabled = true) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % 8), 2600);
    return () => window.clearInterval(id);
  }, [enabled]);
  return tick;
}

export function TeacherLiveScreen() {
  const tick = useLivePulse();
  // Demonstration values only — nothing here is a claim about usage.
  const answered = 26 + tick * 2;
  const queue = [
    { n: 1, prompt: 'Which normal form removes transitive dependencies?', state: 'closed', answers: 38 },
    { n: 2, prompt: 'A relation in 2NF must already satisfy which condition?', state: 'open', answers: answered },
    { n: 3, prompt: 'Name one anomaly that normalisation is designed to prevent.', state: 'pending', answers: 0 },
  ];
  const options = ['Being in first normal form', 'Having no transitive dependencies', 'Having a composite key', 'Being in Boyce–Codd form'];
  return (
    <ProductWindow role="TEACHER" active="/teacher/live" path="/teacher/live" live title="Teacher live classroom — status bar, open question and queue">
      <div className="pf-pad">
        <div className="pf-livebar" aria-hidden="true">
          <span className="pf-livebar-id"><i />Database Systems<code>CS-204</code></span>
          <span className="pf-livebar-code"><em>Room</em><span className="pf-code">{'DBMS7K'.split('').map((c, i) => <span key={i}>{c}</span>)}</span></span>
          <dl className="pf-livebar-facts">
            <div><dt>In the room</dt><dd>42</dd></div>
            <div><dt>Answered</dt><dd className="pf-tick">{answered}/42</dd></div>
            <div><dt>Questions</dt><dd>1/8</dd></div>
            <div><dt>Elapsed</dt><dd><code>24:13</code></dd></div>
          </dl>
          <span className="pf-livebar-actions"><span className="pf-btn is-sm">Add questions</span><span className="pf-btn is-sm is-danger">End session</span></span>
        </div>

        <div className="pf-stage" aria-hidden="true">
          <div className="pf-stage-head">
            <span><span className="pf-pill is-open">Open</span>Question 2 of 8 · 2 marks</span>
            <span className="pf-muted">{answered} of 42 answered</span>
          </div>
          <span className="pf-track pf-track-thin"><i className="is-accent" style={{ width: `${(answered / 42) * 100}%` }} /></span>
          <p className="pf-question">A relation in 2NF must already satisfy which condition?</p>
          <ul className="pf-options is-compact">
            {options.map((o, i) => (
              <li key={o} className={i === 0 ? 'is-correct' : ''}>
                <span className="pf-key">{String.fromCharCode(65 + i)}</span>{o}
                {i === 0 && <em>Key</em>}
              </li>
            ))}
          </ul>
        </div>

        <PfSection title="Question queue" sub="1 of 8 done">
          <table className="pf-table is-bare">
            <thead><tr><th>#</th><th>Question</th><th className="is-num">Answers</th><th>State</th></tr></thead>
            <tbody>
              {queue.map((q) => (
                <tr key={q.n}>
                  <td><code>{q.n}</code></td>
                  <td className={q.state === 'closed' ? 'pf-muted' : 'is-primary'}>{q.prompt}</td>
                  <td className="is-num">{q.answers}</td>
                  <td><span className={`pf-pill is-${q.state}`}>{q.state === 'open' ? 'Open' : q.state === 'closed' ? 'Closed' : 'Pending'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </PfSection>

        <div className="pf-controls" aria-hidden="true">
          <span>Q2 open<em> · 1/8 done</em></span>
          <span className="pf-controls-end">
            <span className="pf-btn is-sm">Launch poll<kbd>P</kbd></span>
            <span className="pf-btn is-sm is-primary">Close &amp; reveal<kbd>C</kbd></span>
          </span>
        </div>
      </div>
    </ProductWindow>
  );
}

/* ============================================================
   Student — overview
   ============================================================ */
export function StudentHomeScreen({ chromeless }: { chromeless?: boolean } = {}) {
  const today = [
    { time: '09:00–10:30', course: 'Database Systems', code: 'CS-204', room: 'LT-4', state: 'live' },
    { time: '11:00–12:00', course: 'Linear Algebra', code: 'MA-118', room: 'B-210', state: 'next' },
    { time: '14:00–15:30', course: 'Classical Mechanics', code: 'PH-102', room: 'Lab 2', state: '' },
  ];
  const courses = [
    { code: 'CS-204', name: 'Database Systems', teacher: 'Rabia Ahmed', rate: 92 },
    { code: 'MA-118', name: 'Linear Algebra', teacher: 'Daniel Okafor', rate: 78 },
    { code: 'PH-102', name: 'Classical Mechanics', teacher: 'Mariam Haddad', rate: 61 },
  ];
  return (
    <ProductWindow
      role="STUDENT" active="/student" path="/student" chromeless={chromeless} live
      title="Student overview — today, standing and courses"
    >
      <div className="pf-pad">
        <PfHead title="Overview" lede="Tuesday, 14 October" action={<span className="pf-btn is-primary">Join a session</span>} />

        <div className="pf-now" aria-hidden="true">
          <i />
          <span><strong>A class is live now</strong>Database Systems — ask your teacher for the room code.</span>
          <span className="pf-btn is-sm is-primary">Join now</span>
        </div>

        <div className="pf-stats" aria-hidden="true">
          <div><span>Answer accuracy</span><b>78%</b><em>124 answered</em></div>
          <div><span>Attendance</span><b>91%</b><em>31 sessions</em></div>
          <div><span>Marks earned</span><b>248</b><em>All courses</em></div>
          <div><span>Due</span><b>2</b><em>Not yet submitted</em></div>
          <div><span>Courses</span><b>4</b><em>Enrolled</em></div>
        </div>

        <PfSection title="Today" sub="Next: MA-118 at 11:00" link="Full schedule">
          <table className="pf-table is-bare">
            <thead><tr><th>Time</th><th>Course</th><th>Code</th><th>Room</th><th /></tr></thead>
            <tbody>
              {today.map((t) => (
                <tr key={t.code}>
                  <td><code>{t.time}</code></td>
                  <td className="is-primary">{t.course}</td>
                  <td><code>{t.code}</code></td>
                  <td className="pf-muted">{t.room}</td>
                  <td className="is-num">
                    {t.state === 'live' ? <span className="pf-pill is-live"><i />Live</span> : t.state === 'next' ? <span className="pf-pill is-accent">Next</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PfSection>

        <PfSection title="My courses" link="View all">
          <table className="pf-table is-bare">
            <thead><tr><th>Code</th><th>Course</th><th>Teacher</th><th>Attendance</th></tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.code}>
                  <td><code>{c.code}</code></td>
                  <td className="is-primary">{c.name}</td>
                  <td className="pf-muted">{c.teacher}</td>
                  <td>
                    <span className="pf-cell-progress">
                      <span className="pf-track"><i className={c.rate >= 75 ? 'is-good' : c.rate >= 45 ? 'is-warn' : 'is-bad'} style={{ width: `${c.rate}%` }} /></span>
                      <span>{c.rate}%</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PfSection>
      </div>
    </ProductWindow>
  );
}

/* ============================================================
   Student — the live room, mid-question
   ============================================================ */
export function StudentLiveScreen({ chromeless }: { chromeless?: boolean }) {
  const options = ['Third normal form', 'Second normal form', 'Boyce-Codd normal form', 'First normal form'];
  return (
    <ProductWindow
      role="STUDENT" active="/student/live" path="/student/live" chromeless={chromeless} live
      title="Student live session — answering an open question"
    >
      <div className="pf-pad">
        <div className="pf-livebar" aria-hidden="true">
          <span className="pf-livebar-id"><i />Database Systems<code>CS-204</code></span>
          <span className="pf-livebar-code"><em>Room</em><span className="pf-code is-sm">{'DBMS7K'.split('').map((c, i) => <span key={i}>{c}</span>)}</span></span>
          <dl className="pf-livebar-facts"><div><dt>In the room</dt><dd>42</dd></div></dl>
          <span className="pf-livebar-actions"><span className="pf-btn is-sm is-danger">Leave</span></span>
        </div>
        <div className="pf-stage" aria-hidden="true">
          <div className="pf-stage-head">
            <span>Question 2<span className="pf-muted"> · 2 marks</span></span>
            <span className="pf-timer">18s</span>
          </div>
          <span className="pf-track pf-track-thin"><i className="is-accent" style={{ width: '46%' }} /></span>
          <p className="pf-question">Which normal form removes transitive dependencies?</p>
          <ul className="pf-options">
            {options.map((o, i) => (
              <li key={o} className={i === 0 ? 'is-selected' : ''}>
                <span className="pf-key">{String.fromCharCode(65 + i)}</span>{o}
              </li>
            ))}
          </ul>
          <div className="pf-stage-actions"><span className="pf-muted">Choose one option, then submit.</span><span className="pf-btn is-primary">Submit answer</span></div>
        </div>
      </div>
    </ProductWindow>
  );
}

/* ============================================================
   Teacher — analytics. Hand-drawn SVG: the landing page ships
   no chart library.
   ============================================================ */
const TREND = [34, 41, 38, 52, 49, 63, 58, 71, 68, 76];

export function TeacherAnalyticsScreen({ chromeless, sidebar }: { chromeless?: boolean; sidebar?: boolean } = {}) {
  const w = 260, h = 72;
  const pts = TREND.map((v, i) => [(i / (TREND.length - 1)) * w, h - (v / 100) * h] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;

  const weak = [
    { label: 'Q3', prompt: 'What isolation level prevents phantom reads?', answers: 38, pct: 34 },
    { label: 'Q6', prompt: 'Which index type suits range queries best?', answers: 41, pct: 52 },
    { label: 'Q2', prompt: 'Define a functional dependency.', answers: 40, pct: 66 },
  ];

  return (
    <ProductWindow
      role="TEACHER" active="/teacher/analytics" path="/teacher/analytics"
      chromeless={chromeless} sidebar={sidebar}
      title="Teaching analytics — participation and question difficulty"
    >
      <div className="pf-pad">
        <PfHead title="Analytics" lede="Participation and comprehension across every session you have run." />
        <div className="pf-stats" aria-hidden="true">
          <div><span>Sessions run</span><b>34</b><em>None live</em></div>
          <div><span>Questions asked</span><b>212</b><em>All sessions</em></div>
          <div><span>Answers received</span><b>4,180</b><em>19.7 per question</em></div>
          <div><span>Average accuracy</span><b>68%</b><em>Every question</em></div>
        </div>

        <PfSection title="Participation over time" sub="Joined and answers, per session">
          <div className="pf-chart">
            <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="presentation">
              <defs>
                <linearGradient id="pf-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--navy-500)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="var(--navy-500)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1={h * 0.33} x2={w} y2={h * 0.33} className="pf-grid" />
              <line x1="0" y1={h * 0.66} x2={w} y2={h * 0.66} className="pf-grid" />
              <path d={area} fill="url(#pf-fill)" />
              <path d={line} className="pf-line" />
              <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r="2.6" className="pf-dot" />
            </svg>
          </div>
        </PfSection>

        <PfSection title="Needs re-teaching" sub="Questions the room answered worst">
          <table className="pf-table is-bare">
            <thead><tr><th>Question</th><th /><th className="is-num">Answers</th><th>Correct</th></tr></thead>
            <tbody>
              {weak.map((q) => (
                <tr key={q.label}>
                  <td className="is-primary">{q.prompt}</td>
                  <td><code>{q.label}</code></td>
                  <td className="is-num">{q.answers}</td>
                  <td>
                    <span className="pf-cell-progress">
                      <span className="pf-track"><i className={q.pct >= 70 ? 'is-good' : q.pct >= 40 ? 'is-warn' : 'is-bad'} style={{ width: `${q.pct}%` }} /></span>
                      <span>{q.pct}%</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PfSection>
      </div>
    </ProductWindow>
  );
}

/* ============================================================
   Administrator — people
   ============================================================ */
export function AdminPeopleScreen({ chromeless }: { chromeless?: boolean } = {}) {
  const people = [
    { name: 'Ayesha Rahman', email: 'a.rahman@university.edu', role: 'Teacher', status: 'Pending', dept: 'Computer Science', joined: '2 hours ago' },
    { name: 'Daniel Okafor', email: 'd.okafor@university.edu', role: 'Teacher', status: 'Approved', dept: 'Physics', joined: '3 days ago' },
    { name: 'Ada Lovelace', email: 'ada@university.edu', role: 'Student', status: 'Approved', dept: 'Computer Science', joined: '5 days ago' },
    { name: 'Mariam Haddad', email: 'm.haddad@university.edu', role: 'Student', status: 'Approved', dept: 'Mathematics', joined: '5 days ago' },
    { name: 'Jonas Weber', email: 'j.weber@university.edu', role: 'Student', status: 'Approved', dept: 'Mathematics', joined: '1 week ago' },
  ];
  return (
    <ProductWindow
      role="ADMIN" active="/admin/users" path="/admin/users" chromeless={chromeless}
      title="Administrator — people management table"
    >
      <div className="pf-pad">
        <PfHead title="People" lede="Every account on the platform." action={<span className="pf-btn is-primary">Invite</span>} />

        <div className="pf-toolbar" aria-hidden="true">
          <span className="pf-search">Search name, email or department</span>
          <span className="pf-seg"><i className="is-on">All</i><i>Students</i><i>Teachers</i><i>Admins</i></span>
          <span className="pf-seg"><i className="is-on">Any status</i><i>Approved</i><i>Pending</i></span>
          <span className="pf-btn is-sm" style={{ marginLeft: 'auto' }}>Export CSV</span>
        </div>
        <div className="pf-tableframe" aria-hidden="true">
          <table className="pf-table">
            <thead>
              <tr><th /><th>Name</th><th>Role</th><th>Status</th><th>Department</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.email}>
                  <td><span className="pf-check" /></td>
                  <td>
                    <span className="pf-person">
                      <span className="pf-av">{p.name.split(' ').map((n) => n[0]).join('')}</span>
                      <span>{p.name}<em>{p.email}</em></span>
                    </span>
                  </td>
                  <td><span className={`pf-pill ${p.role === 'Teacher' ? 'is-accent' : 'is-info'}`}>{p.role}</span></td>
                  <td><span className={`pf-pill ${p.status === 'Pending' ? 'is-warn' : 'is-ok'}`}>{p.status}</span></td>
                  <td className="pf-muted">{p.dept}</td>
                  <td className="pf-muted">{p.joined}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pf-pagination"><span>Showing 1–5 of 1,284</span><span className="pf-pages"><i>‹</i><i className="is-on">1</i><i>2</i><i>3</i><i>…</i><i>257</i><i>›</i></span></div>
        </div>
      </div>
    </ProductWindow>
  );
}

/* ============================================================
   Teacher — quiz studio, mid-review
   ============================================================ */
export function QuizStudioScreen({ chromeless }: { chromeless?: boolean }) {
  const options = ['Third normal form', 'Second normal form', 'First normal form'];
  return (
    <ProductWindow
      role="TEACHER" active="/teacher/studio" path="/teacher/studio" chromeless={chromeless}
      title="Quiz studio — reviewing generated questions before broadcast"
    >
      <div className="pf-pad">
        <PfHead title="Quiz studio" lede="Draft with AI, review every answer key, then broadcast." action={<span className="pf-btn is-primary">Broadcast 5 questions</span>} />
        <PfSection title="Drafts" sub="5 questions · correct answers marked">
          <div className="pf-draft" aria-hidden="true">
            <div className="pf-draft-head"><code>1</code>Which normal form removes transitive dependencies?<span className="pf-muted">2 marks</span></div>
            <ul className="pf-options is-compact">
              {options.map((o, i) => (
                <li key={o} className={i === 0 ? 'is-correct' : ''}>
                  <span className="pf-key">{String.fromCharCode(65 + i)}</span>{o}
                  {i === 0 && <em>Correct</em>}
                </li>
              ))}
            </ul>
            <span className="pf-draft-explain">Explanation · 3NF requires that no non-key attribute depends on another non-key attribute.</span>
          </div>
          <div className="pf-draft is-dim" aria-hidden="true">
            <div className="pf-draft-head"><code>2</code>A relation in 2NF must already satisfy which condition?<span className="pf-muted">2 marks</span></div>
          </div>
          <div className="pf-draft is-dim" aria-hidden="true">
            <div className="pf-draft-head"><code>3</code>Name one anomaly that normalisation prevents.<span className="pf-muted">Written · 2 marks</span></div>
          </div>
        </PfSection>
      </div>
    </ProductWindow>
  );
}

/* ============================================================
   Phone — the same live session as a student actually sees it.
   ============================================================ */
export function PhoneFrame() {
  const options = ['Third normal form', 'Second normal form', 'Boyce-Codd normal form'];
  return (
    <div className="phone" aria-hidden="true">
      <div className="phone-screen">
        <div className="phone-top">
          <span className="phone-course">CS-204</span>
          <span className="pf-pill is-live"><i />Live</span>
        </div>

        <div className="phone-meta">
          <span>Question 2 · 2 marks</span>
          <span className="phone-timer">18s</span>
        </div>
        <span className="pf-track pf-track-thin"><i className="is-accent" style={{ width: '46%' }} /></span>

        <p className="phone-question">Which normal form removes transitive dependencies?</p>

        <ul className="phone-options">
          {options.map((o, i) => (
            <li key={o} className={i === 0 ? 'is-selected' : ''}>
              <span className="pf-key">{String.fromCharCode(65 + i)}</span>{o}
            </li>
          ))}
        </ul>

        <span className="phone-submit">Submit answer</span>
      </div>
    </div>
  );
}

/* ============================================================
   Fragments — single pieces of interface, lifted out.
   ============================================================ */

export function ApprovalsFragment() {
  const waiting = [
    { name: 'Ayesha Rahman', dept: 'Computer Science' },
    { name: 'Jonas Weber', dept: 'Mathematics' },
  ];
  return (
    <div className="frag" aria-hidden="true">
      {waiting.map((p) => (
        <div className="frag-row" key={p.name}>
          <span className="pf-av">{p.name.split(' ').map((n) => n[0]).join('')}</span>
          <span className="frag-row-main">
            {p.name}<em>{p.dept}</em>
          </span>
          <span className="pf-pill is-warn">Pending</span>
        </div>
      ))}
      <div className="frag-row frag-row-action">
        <span className="pf-btn is-sm is-primary">Approve</span>
        <span className="pf-btn is-sm">Reject</span>
      </div>
    </div>
  );
}

const ATTENDANCE = [38, 44, 41, 52, 48, 57, 61, 58, 66, 71, 69, 76];

export function TrendFragment() {
  const w = 300, h = 96;
  const pts = ATTENDANCE.map((v, i) => [(i / (ATTENDANCE.length - 1)) * w, h - (v / 100) * h] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <div className="frag frag-chart" aria-hidden="true">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="presentation">
        <defs>
          <linearGradient id="frag-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--navy-500)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--navy-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#frag-fill)" />
        <path d={line} className="pf-line" />
        <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r="3" className="pf-dot" />
      </svg>
    </div>
  );
}

export function AuditFragment() {
  const rows = [
    { when: '10:42', actor: 'Super Admin', action: 'user.approve', summary: 'Approved Ayesha Rahman as a teacher' },
    { when: '10:38', actor: 'Rabia Ahmed', action: 'session.close', summary: 'Closed CS-204 · 42 attended' },
    { when: '09:05', actor: 'Rabia Ahmed', action: 'slot.create', summary: 'Scheduled CS-204 on Tue 09:00–10:30' },
  ];
  return (
    <div className="frag" aria-hidden="true">
      <table className="pf-table is-bare">
        <tbody>
          {rows.map((r) => (
            <tr key={r.when}>
              <td><code>{r.when}</code></td>
              <td className="is-primary">{r.summary}</td>
              <td><code>{r.action}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DepartmentsFragment() {
  const departments = [
    { name: 'Computer Science', pct: 92 },
    { name: 'Mathematics', pct: 64 },
    { name: 'Physics', pct: 47 },
  ];
  return (
    <div className="frag frag-bars" aria-hidden="true">
      {departments.map((d) => (
        <div key={d.name}>
          <span>{d.name}</span>
          <span className="pf-track"><i style={{ width: `${d.pct}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Process visuals — one compact fragment per step of a session.
   ============================================================ */

export function StepOpen() {
  return (
    <div className="sv" aria-hidden="true">
      <div className="sv-bar">
        <span className="sv-course">CS-204 · Database Systems</span>
        <span className="pf-pill is-live"><i />Live</span>
      </div>
      <div className="sv-body sv-open">
        <span className="sv-label">Room code</span>
        <div className="sv-code">
          {'DBMS7K'.split('').map((c, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties}>{c}</span>
          ))}
        </div>
        <span className="sv-note">Session started · attendance recording</span>
      </div>
    </div>
  );
}

export function StepJoin() {
  return (
    <div className="sv sv-centred" aria-hidden="true">
      <div className="sv-phone">
        <div className="sv-phone-screen">
          <span className="sv-label">Join a session</span>
          <div className="sv-entry">
            {['D', 'B', 'M', 'S', '7', ''].map((c, i) => (
              <span key={i} className={c ? 'is-filled' : 'is-caret'}>{c}</span>
            ))}
          </div>
          <span className="sv-cta">Join session</span>
        </div>
      </div>
    </div>
  );
}

export function StepAsk() {
  const options = ['Third normal form', 'Second normal form', 'First normal form'];
  return (
    <div className="sv" aria-hidden="true">
      <div className="sv-bar">
        <span className="sv-course">Quiz studio · draft</span>
        <span className="sv-approve">Review</span>
      </div>
      <div className="sv-body">
        <p className="sv-question">Which normal form removes transitive dependencies?</p>
        <ul className="sv-options">
          {options.map((o, i) => (
            <li key={o} className={i === 0 ? 'is-correct' : ''}>
              <span className="pf-key">{String.fromCharCode(65 + i)}</span>{o}
              {i === 0 && <em>Correct</em>}
            </li>
          ))}
        </ul>
        <span className="sv-note">AI drafted · the teacher approves before it broadcasts</span>
      </div>
    </div>
  );
}

const REVEAL_BARS = [
  { label: 'Third normal form', pct: 64, correct: true },
  { label: 'Second normal form', pct: 22, correct: false },
  { label: 'Boyce-Codd form', pct: 14, correct: false },
];

export function StepReveal() {
  return (
    <div className="sv" aria-hidden="true">
      <div className="sv-bar">
        <span className="sv-course">Question 02 · closed</span>
        <span className="sv-count">38 of 42 answered</span>
      </div>
      <div className="sv-body">
        <ul className="sv-bars">
          {REVEAL_BARS.map((b, i) => (
            <li key={b.label} className={b.correct ? 'is-correct' : ''} style={{ '--i': i } as CSSProperties}>
              <span className="pf-key">{String.fromCharCode(65 + i)}</span>
              <span className="sv-bar-label">{b.label}</span>
              <span className="sv-bar-track"><i style={{ '--w': `${b.pct}%` } as CSSProperties} /></span>
              <span className="sv-bar-pct">{b.pct}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function StepUnderstand() {
  const rows = [
    { label: 'Attendance', value: '42 of 46', pct: 91, tone: 'is-good' },
    { label: 'Accuracy', value: '64%', pct: 64, tone: 'is-warn' },
    { label: 'Marks recorded', value: '38', pct: 100, tone: 'is-good' },
  ];
  return (
    <div className="sv" aria-hidden="true">
      <div className="sv-bar">
        <span className="sv-course">Session recorded</span>
        <span className="sv-count">Before the class left</span>
      </div>
      <div className="sv-body sv-metrics">
        {rows.map((r, i) => (
          <div key={r.label} style={{ '--i': i } as CSSProperties}>
            <div className="sv-metric-head">
              <span>{r.label}</span><strong>{r.value}</strong>
            </div>
            <span className="sv-bar-track"><i className={r.tone} style={{ '--w': `${r.pct}%` } as CSSProperties} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}
