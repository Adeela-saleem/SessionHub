import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Reveal } from '../../components/Reveal';
import {
  AdminPeopleScreen, ApprovalsFragment, AuditFragment, PhoneFrame, QuizStudioScreen,
  StepAsk, StepJoin, StepOpen, StepReveal, StepUnderstand,
  StudentHomeScreen, TeacherAnalyticsScreen,
} from './ProductFrames';
import {
  IconAward2, IconBell, IconBook, IconBroadcast, IconCalendar, IconChart, IconCheckCircle,
  IconClipboard, IconFile, IconPhone, IconShield, IconSparkle, IconUserCheck,
} from '../../components/icons';

/* ============================================================
   Section marker — the page's recurring editorial device.
   The dark interlude deliberately has none: it is a pause, not
   a chapter.
   ============================================================ */
export function Marker({ index, children }: { index?: string; children: string }) {
  return (
    <span className="ls-marker">
      <i aria-hidden="true" />
      {index && <em>{index}</em>}
      {children}
    </span>
  );
}

/* ============================================================
   01 — HOW A SESSION RUNS
   An interactive process, not a list of paragraphs. Selecting a
   step swaps the interface fragment beside it and advances the
   rail, so the sequence is demonstrated rather than described.
   Hover selects on a pointer; the same buttons are a real
   tablist for keyboard and screen readers.
   ============================================================ */
const STEPS = [
  { id: 'open', n: '01', name: 'Open', icon: IconBroadcast,
    line: 'A teacher goes live. A room code appears.', render: () => <StepOpen /> },
  { id: 'join', n: '02', name: 'Join', icon: IconPhone,
    line: 'Students enter it on the phone in their hand.', render: () => <StepJoin /> },
  { id: 'ask', n: '03', name: 'Ask', icon: IconSparkle,
    line: 'AI drafts the questions; the teacher approves them.', render: () => <StepAsk /> },
  { id: 'reveal', n: '04', name: 'Reveal', icon: IconChart,
    line: 'Closing a question shows the room how it voted.', render: () => <StepReveal /> },
  { id: 'understand', n: '05', name: 'Understand', icon: IconCheckCircle,
    line: 'Attendance and accuracy are recorded before anyone leaves.', render: () => <StepUnderstand /> },
] as const;

export function ProcessSection() {
  const [active, setActive] = useState(0);
  const step = STEPS[active]!;

  return (
    <section className="ls-process" id="how" aria-labelledby="process-title">
      <div className="ls-wrap">
        <Reveal as="header" className="ls-process-head">
          <Marker index="01">How a session runs</Marker>
          <h2 id="process-title">From an empty room to a recorded result.</h2>
        </Reveal>

        <Reveal className="ls-process-body">
          <div className="ls-steps" role="tablist" aria-label="Steps in a session">
            {STEPS.map((s, i) => {
              const Ico = s.icon;
              const isActive = i === active;
              return (
                <button
                  key={s.id}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls="process-panel"
                  className={`ls-step ${isActive ? 'is-active' : ''}`.trim()}
                  onClick={() => setActive(i)}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                >
                  <span className="ls-step-rail" aria-hidden="true"><i /></span>
                  <span className="ls-step-n">{s.n}</span>
                  <span className="ls-step-icon" aria-hidden="true"><Ico size={17} /></span>
                  <span className="ls-step-text">
                    <span className="ls-step-name">{s.name}</span>
                    <span className="ls-step-line">{s.line}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ls-process-stage" id="process-panel" role="tabpanel" aria-label={step.name}>
            <div key={step.id} className="ls-process-visual">{step.render()}</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   02 — THE PRODUCT
   A product explorer, not a tabbed screenshot: the copy column
   holds still while the stage beside it changes, and the line
   under the heading changes with the role. Composition is
   deliberately asymmetric so this section does not repeat the
   heading-above-content rhythm used elsewhere.
   ============================================================ */
const ROLES = [
  { id: 'STUDENT', label: 'Students', screen: 'Dashboard',
    blurb: 'Join with a code, answer, and watch your own record build.',
    render: () => <StudentHomeScreen chromeless /> },
  { id: 'TEACHER', label: 'Teachers', screen: 'Quiz studio',
    blurb: 'Draft a quiz, run the room, and see what needs re-teaching.',
    render: () => <QuizStudioScreen chromeless /> },
  { id: 'ADMIN', label: 'Administrators', screen: 'People',
    blurb: 'Approve teachers, manage courses, and see the whole platform.',
    render: () => <AdminPeopleScreen chromeless /> },
] as const;

export function ExplorerSection() {
  const [role, setRole] = useState<string>('STUDENT');
  const tabs = useRef<HTMLDivElement>(null);
  const active = ROLES.find((r) => r.id === role) ?? ROLES[0];

  // The indicator travels to the selected tab rather than blinking onto
  // it. Measured, because the labels are different widths.
  useLayoutEffect(() => {
    const list = tabs.current;
    const current = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !current) return;
    list.style.setProperty('--ind-x', `${current.offsetLeft}px`);
    list.style.setProperty('--ind-w', `${current.offsetWidth}px`);
  }, [role]);

  return (
    <section className="ls-explore" id="product" aria-labelledby="explore-title">
      <div className="ls-wrap ls-explore-grid">
        <Reveal variant="left" className="ls-explore-copy">
          <Marker index="02">The product</Marker>
          <h2 id="explore-title">Look around before you sign up.</h2>
          <p key={active.id} className="ls-explore-blurb">{active.blurb}</p>

          <div className="ls-tabs" ref={tabs} role="tablist" aria-label="Choose a role">
            <span className="ls-tabs-indicator" aria-hidden="true" />
            {ROLES.map((r) => (
              <button
                key={r.id}
                role="tab"
                type="button"
                aria-selected={role === r.id}
                aria-controls="explore-panel"
                onClick={() => setRole(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <span className="ls-explore-caption">Every screen here ships in the product.</span>
        </Reveal>

        <Reveal variant="right" delay={120} className="ls-explore-stage">
          <div id="explore-panel" role="tabpanel" key={active.id} className="ls-explore-panel">
            {active.render()}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   THE LIVE MOMENT
   A pause. No marker, no list, no second column of facts — the
   code and the device carry it.
   ============================================================ */
export function LiveSection() {
  return (
    <section className="ls-live" aria-labelledby="live-title">
      <div className="ls-wrap ls-live-grid">
        <Reveal variant="left" className="ls-live-copy">
          <h2 id="live-title">Six characters put the whole hall on the same question.</h2>
          <p>The only thing a teacher has to say out loud.</p>

          {/* The code and its consequence, depicted as the product draws
              them: one framed panel, the answers arriving as the section
              is reached. Demonstration values live inside the frame, not
              in the page's own voice. */}
          <div
            className="ls-live-panel"
            role="img"
            aria-label="A live session panel: room code D B M S 7 K, with answers arriving from the room"
          >
            <div className="ls-live-panel-bar" aria-hidden="true">
              <span>CS-204 · Database Systems</span>
              <span className="ls-sync-live"><i />Live</span>
            </div>
            <div className="ls-live-panel-body" aria-hidden="true">
              <span className="ls-live-panel-label">Room code</span>
              <div className="ls-live-code">
                {'DBMS7K'.split('').map((c, i) => (
                  <span key={i} style={{ '--i': i } as CSSProperties}>{c}</span>
                ))}
              </div>
              <div className="ls-sync">
                <div className="ls-sync-meta">
                  <span>42 in room</span>
                  <span>26 answered</span>
                </div>
                <div className="ls-sync-room">
                  {Array.from({ length: 42 }).map((_, i) => (
                    <span
                      key={i}
                      className={i < 26 ? 'is-answered' : ''}
                      style={{ '--i': i } as CSSProperties}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal variant="right" delay={140} className="ls-live-visual">
          <PhoneFrame />
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   03 — FOR INSTITUTIONS
   Visual-first: each cell is a piece of the interface under a
   label and one line of the buyer's case. Every claim below is
   a feature that ships — no numbers, no testimonials.
   ============================================================ */
export function InstitutionSection() {
  return (
    <section className="ls-institution" id="institutions" aria-labelledby="institution-title">
      <div className="ls-wrap ls-institution-grid">
        <Reveal as="header" className="ls-section-head">
          <Marker index="05">For institutions</Marker>
          <h2 id="institution-title">The whole platform, at a glance.</h2>
          <p className="ls-institution-lede">
            Students join with a six-character code — nothing to install. What follows
            is recorded: attendance for every session, and an immutable audit log of
            every consequential action.
          </p>
        </Reveal>

        <div className="ls-bento">
          <Reveal className="ls-bento-main ls-crop ls-crop-top">
            <AdminPeopleScreen />
          </Reveal>

          <Reveal delay={90} className="ls-bento-cell">
            <span className="ls-cell-label">Approvals</span>
            <p className="ls-cell-cap">Teaching accounts are approved by an administrator before their first sign-in.</p>
            <ApprovalsFragment />
          </Reveal>

          <Reveal delay={140} className="ls-bento-cell">
            <span className="ls-cell-label">Audit log</span>
            <p className="ls-cell-cap">Every consequential action is recorded with who did it and when — and cannot be edited.</p>
            <AuditFragment />
          </Reveal>

        </div>
      </div>
    </section>
  );
}

/* ============================================================
   WHAT SHIPS
   A ruled list per role. Every line is a feature in the
   product today; nothing here is a roadmap item.
   ============================================================ */
const CAPS = [
  { role: 'Teachers', items: [
    { icon: IconBroadcast, name: 'Live classroom', line: 'A room code, a question queue, polls, Q&A and anonymous "confused / got it" taps.' },
    { icon: IconSparkle, name: 'AI quiz drafts', line: 'Questions drafted from a topic; every answer key is reviewed before it broadcasts.' },
    { icon: IconFile, name: 'Exam paper generator', line: 'A printable paper with CLOs, marks and instructions, saved for reuse.' },
    { icon: IconAward2, name: 'Gradebook', line: 'Weighted categories computed live from assignments, quiz marks and attendance.' },
  ] },
  { role: 'Students', items: [
    { icon: IconPhone, name: 'Join with a code', line: 'Nothing to install. The question on the screen is the question on the phone.' },
    { icon: IconClipboard, name: 'Assignments', line: 'Drafts, file uploads, late rules, and feedback returned in place.' },
    { icon: IconCalendar, name: 'Schedule', line: 'A weekly timetable with today\'s classes and what is live right now.' },
    { icon: IconChart, name: 'Own record', line: 'Accuracy, attendance and marks per course, from the first session on.' },
  ] },
  { role: 'Administrators', items: [
    { icon: IconUserCheck, name: 'Teacher approvals', line: 'Teaching accounts cannot sign in until an administrator approves them.' },
    { icon: IconBook, name: 'Courses and rosters', line: 'Assign teachers, enrol students, export the lot as CSV.' },
    { icon: IconShield, name: 'Audit log', line: 'An immutable record of every consequential action on the platform.' },
    { icon: IconBell, name: 'Notifications', line: 'Grades published, sessions started, approvals decided — in one place.' },
  ] },
] as const;

export function CapabilitiesSection() {
  return (
    <section className="ls-caps" id="features" aria-labelledby="caps-title">
      <div className="ls-wrap ls-caps-grid">
        <Reveal as="header" className="ls-section-head">
          <Marker index="03">What ships</Marker>
          <h2 id="caps-title">Three working days, one product.</h2>
          <p className="ls-institution-lede">Everything below is in the application today. Nothing is a roadmap item.</p>
        </Reveal>
        <Reveal className="ls-caps-cols" delay={80}>
          {CAPS.map((col) => (
            <div className="ls-caps-col" key={col.role}>
              <h3>{col.role}</h3>
              <ul>
                {col.items.map((it) => {
                  const Ico = it.icon;
                  return (
                    <li key={it.name}>
                      <Ico size={15} />
                      <span><strong>{it.name}</strong>{it.line}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   INSIGHT — the analytics screen, and the two questions it
   exists to answer.
   ============================================================ */
export function InsightSection() {
  return (
    <section className="ls-insight" id="analytics" aria-labelledby="insight-title">
      <div className="ls-wrap ls-insight-grid">
        <Reveal variant="left" className="ls-insight-stage">
          <TeacherAnalyticsScreen />
        </Reveal>
        <Reveal variant="right" delay={120} className="ls-insight-copy">
          <Marker index="04">Analytics</Marker>
          <h2 id="insight-title">Know what to re-teach before the next lecture.</h2>
          <p>Every answer is recorded as it arrives, so the picture is ready the moment the session closes.</p>
          <ul className="ls-insight-list">
            <li><strong>Is participation holding up?</strong>Joined and answered, per session, over time.</li>
            <li><strong>Which question did the room fail?</strong>Percent correct per question, worst first.</li>
            <li><strong>Who is falling behind?</strong>Attendance and accuracy by course and by student.</li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
