import type { CSSProperties, ElementType, ReactNode } from 'react';
import { useInView } from '../lib/useInView';

type Variant = 'up' | 'down' | 'left' | 'right' | 'fade' | 'scale';

/**
 * Reveals its children when they scroll into view. Runs once, then the
 * observer disconnects. Under prefers-reduced-motion useInView resolves
 * immediately and the CSS drops the transform, so content is never hidden
 * behind an animation that will not play.
 */
export function Reveal({
  as: Tag = 'div',
  variant = 'up',
  delay = 0,
  stagger,
  className = '',
  children,
  ...rest
}: {
  as?: ElementType;
  variant?: Variant;
  /** ms before this element starts */
  delay?: number;
  /** ms between children, when revealing a list */
  stagger?: number;
  className?: string;
  children: ReactNode;
  [k: string]: unknown;
}) {
  const { ref, inView } = useInView<HTMLElement>();

  return (
    <Tag
      ref={ref}
      className={`reveal ${stagger ? 'reveal-stagger' : ''} ${inView ? 'in' : ''} ${className}`.trim()}
      data-reveal={variant}
      style={{
        '--reveal-delay': `${delay}ms`,
        ...(stagger ? { '--reveal-stagger': `${stagger}ms` } : {}),
      } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Lifts a headline in word by word. Line breaks are given as "|". */
export function RevealWords({ text, delay = 0, className = '' }: {
  text: string; delay?: number; className?: string;
}) {
  const { ref, inView } = useInView<HTMLHeadingElement>();
  const words = text.split(' ');
  let n = 0;

  return (
    <h1 ref={ref} className={`reveal-words ${inView ? 'in' : ''} ${className}`.trim()}>
      {words.map((w, i) =>
        w === '|' ? <br key={i} /> : (
          <span key={i} style={{ transitionDelay: `${delay + n++ * 55}ms` } as CSSProperties}>
            {w}{i < words.length - 1 && words[i + 1] !== '|' ? '\u00A0' : ''}
          </span>
        ),
      )}
    </h1>
  );
}
