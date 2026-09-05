import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Reveal, RevealWords } from '../../components/Reveal';
import { ThemeToggle } from '../../components/ThemeToggle';
import { LinkButton } from '../../components/ui';
import { IconArrowRight, IconClose, IconMenu } from '../../components/icons';
import { PhoneFrame, TeacherLiveScreen } from './ProductFrames';
import { useHeroParallax, useScrolled } from './useLandingMotion';
import { ExplorerSection, InstitutionSection, LiveSection, Marker, StorySection } from './sections';

/* ============================================================
   SessionHub — public site
   ------------------------------------------------------------
   Art direction: the lecture hall as a ruled page. A hairline
   grid, a monospace index running down the sections, navy as
   the ground and yellow used only as a tick, a rule or the one
   action that matters. The product itself is the artwork —
   every frame on this page is a screen that ships.
   ============================================================ */

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#product', label: 'Product' },
  { href: '#institutions', label: 'For institutions' },
];

function SiteNav() {
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);

  // A sheet that survives a resize into desktop would trap the page.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(min-width: 901px)');
    const close = () => setOpen(false);
    mq.addEventListener('change', close);
    document.body.style.overflow = 'hidden';
    return () => { mq.removeEventListener('change', close); document.body.style.overflow = ''; };
  }, [open]);

  return (
    <header className={`ls-nav ${scrolled ? 'is-scrolled' : ''}`.trim()}>
      <div className="ls-wrap ls-nav-inner">
        <Link to="/" className="ls-logo" aria-label="SessionHub home">
          <span className="ls-logo-mark" aria-hidden="true">S</span>
          <span>SessionHub</span>
        </Link>

        <nav className="ls-nav-links" aria-label="Sections">
          {LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>

        <div className="ls-nav-actions">
          <ThemeToggle />
          <LinkButton to="/auth" variant="tertiary" size="sm" className="ls-nav-login">Log in</LinkButton>
          <LinkButton to="/auth" size="sm">Get started</LinkButton>
          <button
            type="button"
            className="ls-nav-toggle"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <IconClose size={18} /> : <IconMenu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="ls-sheet">
          <nav aria-label="Sections">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}<IconArrowRight size={16} />
              </a>
            ))}
          </nav>
          <div className="ls-sheet-actions">
            <LinkButton to="/auth" variant="secondary" size="lg" block>Log in</LinkButton>
            <LinkButton to="/auth" size="lg" block>Get started</LinkButton>
          </div>
        </div>
      )}
    </header>
  );
}

/* ============================================================
   HERO
   Editorial rather than centred: the headline holds the left,
   a short meta column holds the right, and the product breaks
   out below both — wider than the text it belongs to.
   ============================================================ */
function Hero() {
  const stage = useRef<HTMLDivElement>(null);
  useHeroParallax(stage);

  return (
    <section className="ls-hero">
      <div className="ls-wrap ls-hero-top">
        <div className="ls-hero-copy">
          <Reveal>
            <Marker>Live classroom platform</Marker>
          </Reveal>

          <RevealWords text="The lecture hall, | finally in sync." delay={90} />

          <Reveal delay={260}>
            <p className="ls-lede">
              One room code puts every phone in the hall on the same question — and records
              what the class understood.
            </p>
            <div className="ls-hero-cta">
              <LinkButton to="/auth" size="lg">Get started<IconArrowRight size={16} /></LinkButton>
              <a href="#product" className="ls-textlink">See the product</a>
            </div>
          </Reveal>
        </div>

      </div>

      {/* The product breaks the text column, and keeps going past the fold. */}
      <div className="ls-hero-stage" ref={stage}>
        <div className="ls-hero-glow" aria-hidden="true" />
        <div className="ls-hero-frame">
          <TeacherLiveScreen />
          {/* The second layer: the same session, on a student's phone. */}
          <div className="ls-hero-phone"><PhoneFrame /></div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   CLOSE
   ============================================================ */
function FinalCta() {
  return (
    <section className="ls-cta" aria-labelledby="cta-title">
      <div className="ls-wrap ls-cta-inner">
        <div>
          <h2 id="cta-title">Build a better hour of teaching.</h2>
          <p>Teaching accounts are verified by your administrator.</p>
        </div>
        <LinkButton to="/auth" size="lg">Get started<IconArrowRight size={16} /></LinkButton>
      </div>
    </section>
  );
}

function SiteFooter() {
  const columns = [
    { title: 'Product', links: [
      { href: '#product', label: 'Product' },
      { href: '#how', label: 'How it works' },
      { href: '#institutions', label: 'For institutions' },
    ] },
    { title: 'Account', links: [
      { to: '/auth', label: 'Log in' },
      { to: '/auth', label: 'Create an account' },
    ] },
  ];

  return (
    <footer className="ls-footer">
      <div className="ls-wrap ls-footer-grid">
        <div className="ls-footer-brand">
          <Link to="/" className="ls-logo">
            <span className="ls-logo-mark" aria-hidden="true">S</span>
            <span>SessionHub</span>
          </Link>
          <p>A real-time classroom platform, built around the hour a class is together.</p>
        </div>

        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3>{col.title}</h3>
            <ul>
              {col.links.map((l) => (
                <li key={l.label}>
                  {'to' in l ? <Link to={l.to!}>{l.label}</Link> : <a href={l.href}>{l.label}</a>}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="ls-wrap ls-footer-base">
        <span>© {new Date().getFullYear()} SessionHub</span>
        <span>SDG 4 — Quality Education</span>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="ls">
      <a href="#main" className="skip-link">Skip to main content</a>
      <SiteNav />
      <main id="main">
        <Hero />
        <StorySection />
        <ExplorerSection />
        <LiveSection />
        <InstitutionSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
