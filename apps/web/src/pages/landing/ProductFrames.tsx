import type { ReactNode } from 'react';
import { NAV } from '../../components/shell/nav';
import { ICONS } from '../../components/icons';
import type { Role } from '../../lib/types';

/* ============================================================
   Product frames
   Faithful, marketing-scale reproductions of screens that ship
   in this application. The sidebar is generated from the same
   NAV configuration the real shell uses, so the navigation
   shown here cannot drift from the navigation that exists.
   No screen, metric or label below depicts a feature the
   product does not have.
   ============================================================ */

export function ProductWindow({
  role, active, path, title, children, className = '', chromeless, sidebar = true,
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
}) {
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
        <div className="pf-main">{children}</div>
      </div>
      <figcaption id={`pf-${path.replace(/\W/g, '')}`} className="sr-only">{title}</figcaption>
    </figure>
  );
}

function ProductSidebar({ role, active }: { role: Role; active: string }) {
  return (
    <div className="pf-side" aria-hidden="true">
      <div className="pf-brand"><span>S</span>SessionHub</div>
      {NAV[role].map((group) => (
        <div className="pf-navgroup" key={group.label}>
          <span className="pf-navlabel">{group.label}</span>
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
    </div>
  );
}

/** The bar every screen carries above its content. */
function PfTop({ crumbs, children }: { crumbs: string[]; children?: ReactNode }) {
  return (
    <div className="pf-top" aria-hidden="true">
      <span className="pf-crumbs">
        {crumbs.map((c, i) => (
          <span key={c}>{i > 0 && <i>/</i>}{c}</span>
        ))}
      </span>
      {children}
    </div>
  );
}

function PfHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="pf-head" aria-hidden="true">
      <div>
        <span className="pf-eyebrow">{eyebrow}</span>
        <h4>{title}</h4>
      </div>
      {action}
    </div>
  );
}

/* ============================================================
   Teacher — live control. The signature screen: a room code
   sized to be read from the back of a hall, and the question
   queue the teacher works through while talking.
   ============================================================ */
export function TeacherLiveScreen() {
  const queue = [
    { n: 1, prompt: 'Which normal form removes transitive dependencies?', state: 'closed', answers: 38 },
    { n: 2, prompt: 'A relation in 2NF must already satisfy which condition?', state: 'open', answers: 26 },
    { n: 3, prompt: 'Name one anomaly that normalisation is designed to prevent.', state: 'pending', answers: 0 },
  ];
  return (
    <ProductWindow role="TEACHER" active="/teacher/live" path="/teacher/live" title="Teacher live control — room code and question queue">
      <PfTop crumbs={['SessionHub', 'Live control']}>
        <span className="pf-pill is-live"><i />Session live</span>
      </PfTop>

      <div className="pf-pad">
        <PfHead
          eyebrow="CS-204"
          title="Database Systems"
          action={<span className="pf-btn is-danger">End session</span>}
        />

        <div className="pf-room" aria-hidden="true">
          <div>
            <span className="pf-room-label">Room code</span>
            <div className="pf-code">{'DBMS7K'.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
          </div>
          <dl className="pf-room-stats">
            <div><dt>In the room</dt><dd>42</dd></div>
            <div><dt>Answered</dt><dd>26</dd></div>
            <div><dt>Questions</dt><dd>8</dd></div>
          </dl>
        </div>

        <div className="pf-card" aria-hidden="true">
          <div className="pf-card-head">
            <span>Question queue</span>
            <span className="pf-muted">1 of 8 done</span>
          </div>
          <ul className="pf-queue">
            {queue.map((q) => (
              <li key={q.n} className={q.state === 'open' ? 'is-open' : ''}>
                <span className="pf-order">{q.n}</span>
                <span className="pf-queue-text">
                  {q.prompt}
                  <em>{q.answers} answers · 2 marks</em>
                </span>
                <span className={`pf-pill is-${q.state}`}>
                  {q.state === 'open' ? 'Open' : q.state === 'closed' ? 'Closed' : 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ProductWindow>
  );
}

/* ============================================================
   Student — dashboard
   ============================================================ */
export function StudentHomeScreen({ chromeless }: { chromeless?: boolean } = {}) {
  const courses = [
    { code: 'CS-204', name: 'Database Systems', rate: 92 },
    { code: 'MA-118', name: 'Linear Algebra', rate: 78 },
    { code: 'PH-102', name: 'Classical Mechanics', rate: 61 },
  ];
  return (
    <ProductWindow
      role="STUDENT" active="/student" path="/student" chromeless={chromeless}
      title="Student dashboard — standing and course attendance"
    >
      <PfTop crumbs={['SessionHub', 'Dashboard']} />
      <div className="pf-pad">
        <PfHead eyebrow="Tuesday, 14 October" title="Good morning, Ada" />

        <div className="pf-banner" aria-hidden="true">
          <i />
          <span><strong>A class is live right now</strong>Database Systems — ask your teacher for the room code.</span>
          <span className="pf-btn is-ghost">Join</span>
        </div>

        <div className="pf-stats" aria-hidden="true">
          <div><span>Answer accuracy</span><b>78%</b><em>124 questions answered</em></div>
          <div><span>Attendance</span><b>91%</b><em>31 sessions attended</em></div>
          <div><span>Marks earned</span><b>248</b><em>Across all courses</em></div>
          <div><span>Courses</span><b>4</b><em>Currently enrolled</em></div>
        </div>

        <div className="pf-card" aria-hidden="true">
          <div className="pf-card-head"><span>Your courses</span><span className="pf-muted">Attendance</span></div>
          <div className="pf-meters">
            {courses.map((c) => (
              <div key={c.code}>
                <div className="pf-meter-head">
                  <span>{c.code}<em>{c.name}</em></span>
                  <span className="pf-muted">{c.rate}%</span>
                </div>
                <span className="pf-track">
                  <i
                    className={c.rate >= 75 ? 'is-good' : c.rate >= 45 ? 'is-warn' : 'is-bad'}
                    style={{ width: `${c.rate}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ProductWindow>
  );
}

/* ============================================================
   Student — the live room, mid-question
   ============================================================ */
export function StudentLiveScreen({ chromeless }: { chromeless?: boolean }) {
  const options = [
    'Third normal form',
    'Second normal form',
    'Boyce-Codd normal form',
    'First normal form',
  ];
  return (
    <ProductWindow
      role="STUDENT" active="/student/live" path="/student/live" chromeless={chromeless}
      title="Student live session — answering an open question"
    >
      <PfTop crumbs={['SessionHub', 'Live session']}>
        <span className="pf-pill is-live"><i />Live</span>
      </PfTop>
      <div className="pf-pad">
        <PfHead eyebrow="CS-204" title="Database Systems" />
        <div className="pf-card" aria-hidden="true">
          <div className="pf-card-head">
            <span>Question 2 · 2 marks</span>
            <span className="pf-timer">18s</span>
          </div>
          <div className="pf-qbody">
            <span className="pf-track pf-track-thin"><i className="is-accent" style={{ width: '46%' }} /></span>
            <p className="pf-question">Which normal form removes transitive dependencies?</p>
            <ul className="pf-options">
              {options.map((o, i) => (
                <li key={o} className={i === 0 ? 'is-selected' : ''}>
                  <span className="pf-key">{String.fromCharCode(65 + i)}</span>{o}
                </li>
              ))}
            </ul>
            <span className="pf-btn is-primary is-block">Submit answer</span>
          </div>
        </div>
      </div>
    </ProductWindow>
  );
}

/* ============================================================
   Teacher — analytics. The trend is a hand-drawn SVG rather
   than a chart library: the landing page ships no Recharts.
   ============================================================ */
const TREND = [34, 41, 38, 52, 49, 63, 58, 71, 68, 76];

export function TeacherAnalyticsScreen({ chromeless, sidebar }: { chromeless?: boolean; sidebar?: boolean } = {}) {
  const w = 260, h = 72;
  const pts = TREND.map((v, i) => [(i / (TREND.length - 1)) * w, h - (v / 100) * h] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;

  const weak = [
    { label: 'Q3', prompt: 'Transitive dependencies', pct: 34 },
    { label: 'Q6', prompt: 'Candidate keys', pct: 52 },
    { label: 'Q2', prompt: 'Functional dependency', pct: 78 },
  ];

  return (
    <ProductWindow
      role="TEACHER" active="/teacher/analytics" path="/teacher/analytics"
      chromeless={chromeless} sidebar={sidebar}
      title="Teaching analytics — participation and question difficulty"
    >
      <PfTop crumbs={['SessionHub', 'Analytics']} />
      <div className="pf-pad">
        <PfHead eyebrow="Insight" title="Analytics" />
        <div className="pf-stats" aria-hidden="true">
          <div><span>Sessions run</span><b>34</b><em>None live</em></div>
          <div><span>Questions asked</span><b>212</b><em>Across all sessions</em></div>
          <div><span>Answers received</span><b>4,180</b><em>From your students</em></div>
          <div><span>Average accuracy</span><b>68%</b><em>Across every question</em></div>
        </div>

        <div className="pf-split" aria-hidden="true">
          <div className="pf-card">
            <div className="pf-card-head"><span>Participation over time</span></div>
            <div className="pf-chart">
              <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="presentation">
                <defs>
                  <linearGradient id="pf-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--navy-500)" stopOpacity="0.22" />
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
          </div>

          <div className="pf-card">
            <div className="pf-card-head"><span>Where the room struggled</span></div>
            <div className="pf-meters">
              {weak.map((q) => (
                <div key={q.label}>
                  <div className="pf-meter-head">
                    <span>{q.label}<em>{q.prompt}</em></span>
                    <span className="pf-muted">{q.pct}%</span>
                  </div>
                  <span className="pf-track">
                    <i className={q.pct >= 70 ? 'is-good' : q.pct >= 40 ? 'is-warn' : 'is-bad'} style={{ width: `${q.pct}%` }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ProductWindow>
  );
}

/* ============================================================
   Administrator — people
   ============================================================ */
export function AdminPeopleScreen({ chromeless }: { chromeless?: boolean } = {}) {
  const people = [
    { name: 'Ayesha Rahman', email: 'a.rahman@university.edu', role: 'Teacher', status: 'Pending', dept: 'Computer Science' },
    { name: 'Daniel Okafor', email: 'd.okafor@university.edu', role: 'Teacher', status: 'Approved', dept: 'Physics' },
    { name: 'Ada Lovelace', email: 'ada@university.edu', role: 'Student', status: 'Approved', dept: 'Computer Science' },
    { name: 'Mariam Haddad', email: 'm.haddad@university.edu', role: 'Student', status: 'Approved', dept: 'Mathematics' },
  ];
  return (
    <ProductWindow
      role="ADMIN" active="/admin/users" path="/admin/users" chromeless={chromeless}
      title="Administrator — people management table"
    >
      <PfTop crumbs={['SessionHub', 'People']} />
      <div className="pf-pad">
        <PfHead eyebrow="Management" title="People" />
        <div className="pf-stats" aria-hidden="true">
          <div><span>Accounts shown</span><b>1,284</b><em>Matching the filter</em></div>
          <div><span>Students</span><b>1,196</b><em>In this view</em></div>
          <div><span>Teachers</span><b>84</b><em>In this view</em></div>
          <div><span>Pending review</span><b>2</b><em>Cannot sign in yet</em></div>
        </div>

        <div className="pf-card" aria-hidden="true">
          <div className="pf-toolbar">
            <span className="pf-search">Search name, email or department</span>
            <span className="pf-seg"><i className="is-on">All</i><i>Students</i><i>Teachers</i></span>
          </div>
          <table className="pf-table">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Status</th><th>Department</th></tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.email}>
                  <td>
                    <span className="pf-person">
                      <span className="pf-av">{p.name.split(' ').map((n) => n[0]).join('')}</span>
                      <span>{p.name}<em>{p.email}</em></span>
                    </span>
                  </td>
                  <td><span className={`pf-pill ${p.role === 'Teacher' ? 'is-accent' : 'is-info'}`}>{p.role}</span></td>
                  <td><span className={`pf-pill ${p.status === 'Pending' ? 'is-warn' : 'is-ok'}`}>{p.status}</span></td>
                  <td className="pf-muted">{p.dept}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
      <PfTop crumbs={['SessionHub', 'Quiz studio']} />
      <div className="pf-pad">
        <PfHead
          eyebrow="Teaching"
          title="Quiz studio"
          action={<span className="pf-btn is-primary">Broadcast</span>}
        />
        <div className="pf-card" aria-hidden="true">
          <div className="pf-card-head">
            <span>Review 5 questions</span>
            <span className="pf-muted">Correct answers marked</span>
          </div>
          <div className="pf-draft">
            <div className="pf-draft-head"><span className="pf-order">1</span>Which normal form removes transitive dependencies?</div>
            <ul className="pf-options is-compact">
              {options.map((o, i) => (
                <li key={o} className={i === 0 ? 'is-correct' : ''}>
                  <span className="pf-key">{String.fromCharCode(65 + i)}</span>{o}
                  {i === 0 && <em>Correct</em>}
                </li>
              ))}
            </ul>
          </div>
          <div className="pf-draft is-dim">
            <div className="pf-draft-head"><span className="pf-order">2</span>A relation in 2NF must already satisfy which condition?</div>
          </div>
        </div>
      </div>
    </ProductWindow>
  );
}

/* ============================================================
   Phone — the same live session as a student actually sees it.
   The premise of the product is that the device is already in
   the room, so the second layer of the hero is a phone rather
   than a second desktop window.
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
   Fragments
   Single pieces of interface, lifted out of their screens. They
   carry the institution section, so its cells can show state
   rather than describe it.
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
        <span className="pf-btn is-primary">Approve</span>
        <span className="pf-btn">Reject</span>
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
