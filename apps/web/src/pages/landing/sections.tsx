import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Reveal } from '../../components/Reveal';
import {
  AdminPeopleScreen, ApprovalsFragment, PhoneFrame,
  QuizStudioScreen, StudentHomeScreen, TrendFragment,
} from './ProductFrames';

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
   01 — HOW IT WORKS
   The product's sequence, as an indexed list. One line each:
   the reader does not need a paragraph to follow five steps.
   ============================================================ */
const STORY = [
  ['01', 'Open', 'A teacher goes live. A room code appears.'],
  ['02', 'Join', 'Students enter it on the phone in their hand. Nothing to install.'],
  ['03', 'Ask', 'AI drafts the questions, you approve them, the server scores them.'],
  ['04', 'Reveal', 'Closing a question shows the room how it voted.'],
  ['05', 'Understand', 'Attendance and accuracy are recorded before anyone leaves.'],
];

export function StorySection() {
  return (
    <section className="ls-story" id="how" aria-labelledby="story-title">
      <div className="ls-wrap ls-story-grid">
        <Reveal as="header" className="ls-story-head">
          <Marker index="01">How it works</Marker>
          <h2 id="story-title">From an empty room to a recorded result.</h2>
        </Reveal>

        <Reveal as="ol" className="ls-story-list" stagger={70}>
          {STORY.map(([n, title, body], i) => (
            <li key={n} style={{ '--i': i } as CSSProperties}>
              <span className="ls-story-n">{n}</span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   02 — THE PRODUCT
   The three roles are the tabs. Switching is the explanation,
   so nothing is written underneath the preview.
   ============================================================ */
const ROLES = [
  { id: 'STUDENT', label: 'Students', screen: 'Dashboard', render: () => <StudentHomeScreen chromeless /> },
  { id: 'TEACHER', label: 'Teachers', screen: 'Quiz studio', render: () => <QuizStudioScreen chromeless /> },
  { id: 'ADMIN', label: 'Administrators', screen: 'People', render: () => <AdminPeopleScreen chromeless /> },
] as const;

export function ExplorerSection() {
  // Opens on the student dashboard: it carries the most visual weight of
  // the three, and it is the screen most visitors will actually meet.
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
      <div className="ls-wrap">
        <Reveal as="header" className="ls-explore-head">
          <Marker index="02">The product</Marker>
          <h2 id="explore-title">Look around before you sign up.</h2>
          <p>Every screen here ships in the product.</p>
        </Reveal>

        <Reveal className="ls-explore-controls">
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
          <span className="ls-explore-caption" key={`${active.id}-cap`}>
            {active.label.replace(/s$/, '')} · {active.screen}
          </span>
        </Reveal>

        <Reveal variant="fade" className="ls-explore-stage">
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

          <div className="ls-live-code" aria-label="Example room code D B M S 7 K">
            {'DBMS7K'.split('').map((c, i) => (
              <span key={i} style={{ '--i': i } as CSSProperties} aria-hidden="true">{c}</span>
            ))}
          </div>

          {/* The consequence of the code: one room, one question, and the
              answers arriving. The marks fill as the section is reached. */}
          <div className="ls-sync">
            <div className="ls-sync-meta">
              <span className="ls-sync-live"><i aria-hidden="true" />Live</span>
              <span>42 in room</span>
              <span>26 answered</span>
            </div>
            <div className="ls-sync-room" role="img" aria-label="26 of 42 students in the room have answered">
              {Array.from({ length: 42 }).map((_, i) => (
                <span
                  key={i}
                  className={i < 26 ? 'is-answered' : ''}
                  style={{ '--i': i } as CSSProperties}
                  aria-hidden="true"
                />
              ))}
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
   label, rather than a paragraph about it.
   ============================================================ */
export function InstitutionSection() {
  return (
    <section className="ls-institution" id="institutions" aria-labelledby="institution-title">
      <div className="ls-wrap">
        <Reveal as="header" className="ls-section-head">
          <Marker index="03">For institutions</Marker>
          <h2 id="institution-title">The whole platform, at a glance.</h2>
        </Reveal>

        <div className="ls-bento">
          <Reveal className="ls-bento-main ls-crop ls-crop-top">
            <AdminPeopleScreen />
          </Reveal>

          <Reveal delay={90} className="ls-bento-cell">
            <span className="ls-cell-label">Approvals</span>
            <ApprovalsFragment />
          </Reveal>

          <Reveal delay={140} className="ls-bento-cell">
            <span className="ls-cell-label">Attendance · 14 days</span>
            <TrendFragment />
          </Reveal>

        </div>
      </div>
    </section>
  );
}
