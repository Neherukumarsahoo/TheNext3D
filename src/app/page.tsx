'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import s from './homepage.module.css';

/* ══════════════════════════════════════════
   HOOKS
══════════════════════════════════════════ */
function useInView(threshold = 0.12, once = true) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); if (once) obs.disconnect(); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);
  return { ref, inView };
}

function useCountUp(target: number, dur = 1200, active = false) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf: number;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      setV(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur, active]);
  return v;
}

/* ══════════════════════════════════════════
   REVEAL HEADING – curtain wipe on scroll
══════════════════════════════════════════ */
function RevealHeading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { ref, inView } = useInView(0.1);
  return (
    <div ref={ref} className={s.revealWrap}>
      <h2
        className={`${s.sectionH2} ${className}`}
        style={{
          clipPath: inView ? 'inset(0 0 0 0)' : 'inset(0 0 100% 0)',
          transform: inView ? 'translateY(0)' : 'translateY(60%)',
          transition: 'clip-path 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {children}
      </h2>
    </div>
  );
}

/* ══════════════════════════════════════════
   SECTION 1 – HERO (Typewriter + Floating Cards)
══════════════════════════════════════════ */
const HEADLINE = 'Make Your 3D Models Production-Ready.';

function TypewriterHero() {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(HEADLINE.slice(0, i));
      if (i >= HEADLINE.length) { clearInterval(id); setDone(true); }
    }, 38);
    return () => clearInterval(id);
  }, []);
  return (
    <h1 className={s.heroH1}>
      <span className={s.heroAccent}>{displayed}</span>
      {!done && <span className={s.cursor}>|</span>}
    </h1>
  );
}

function FloatCard({ label, value, color, delay }: { label: string; value: string; color: string; delay: number }) {
  return (
    <div className={s.floatCard} style={{ animationDelay: `${delay}ms`, '--fc': color } as React.CSSProperties}>
      <span className={s.floatCardVal} style={{ color }}>{value}</span>
      <span className={s.floatCardLabel}>{label}</span>
    </div>
  );
}

/* ══════════════════════════════════════════
   SECTION 2 – PROBLEM (Infinite Marquee)
══════════════════════════════════════════ */
const ROW1 = ['Too many triangles', '4K textures', 'No compression', 'Excess draw calls', 'Unused materials', 'Slow mobile loads', 'Bloated GLB size', 'No LOD system'];
const ROW2 = ['Performance score: F', 'Three.js frame drops', 'GPU overload', 'Network timeout', '112 draw calls', '230k triangles', '28 MB GLB', 'Texture atlas missing'];

function MarqueePill({ text, warn }: { text: string; warn?: boolean }) {
  return <span className={`${s.marqueePill} ${warn ? s.marqueePillWarn : ''}`}>{text}</span>;
}

/* ══════════════════════════════════════════
   SECTION 3 – HOW IT WORKS (Vertical Timeline)
══════════════════════════════════════════ */
const STEPS = [
  { n: '01', title: 'Upload Your GLB', desc: 'Drag & drop your model. No account required. Works entirely in your browser — nothing is uploaded to any server.', icon: '⬆' },
  { n: '02', title: 'Get Instant Analysis', desc: 'See triangle count, texture sizes, draw calls, compression status, material breakdown, and a full performance report.', icon: '📊' },
  { n: '03', title: 'Inspect & Export', desc: 'Explore every mesh and material. Apply color overrides, adjust scales, and export a clean production-ready GLB.', icon: '✅' },
];

function TimelineStep({ n, title, desc, icon, idx, active }: {
  n: string; title: string; desc: string; icon: string; idx: number; active: boolean;
}) {
  return (
    <div
      className={s.timelineStep}
      style={{
        opacity: active ? 1 : 0,
        transform: active ? 'translateX(0)' : 'translateX(-40px)',
        transition: `opacity 0.55s ${idx * 180}ms, transform 0.55s ${idx * 180}ms`,
      }}
    >
      <div className={s.timelineLeft}>
        <div className={s.timelineNode}>{icon}</div>
        {idx < STEPS.length - 1 && <div className={`${s.timelineLine} ${active ? s.timelineLineActive : ''}`} style={{ transitionDelay: `${idx * 180 + 400}ms` }} />}
      </div>
      <div className={s.timelineBody}>
        <div className={s.timelineNum}>{n}</div>
        <h3 className={s.timelineTitle}>{title}</h3>
        <p className={s.timelineDesc}>{desc}</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SECTION 4 – FEATURES (2×2 Pinwheel Grid)
══════════════════════════════════════════ */
const FEATURES = [
  {
    icon: '🔍', title: 'Smart Issue Detector',
    items: ['High triangle count detection', '4K+ texture warnings', 'Unused material alerts', 'Missing compression flags', 'Draw call budget check'],
    from: 'topLeft',
  },
  {
    icon: '⚙️', title: 'Deep Mesh Inspector',
    items: ['Per-mesh geometry breakdown', 'Material & texture explorer', 'Color override per material', 'Scale transform controls', 'Export modified GLB'],
    from: 'topRight',
  },
  {
    icon: '📊', title: 'Performance Score',
    items: ['Geometry complexity rating', 'Texture memory estimate', 'Draw call budget', 'Compression status', 'Web-readiness indicator'],
    from: 'bottomLeft',
  },
  {
    icon: '🚀', title: 'Production Export',
    items: ['Clean GLB output', 'Modified mesh support', 'Color baked in output', 'Scale transform applied', 'One-click download'],
    from: 'bottomRight',
  },
];

const FROM_MAP: Record<string, string> = {
  topLeft: 'translate(-60px, -60px)',
  topRight: 'translate(60px, -60px)',
  bottomLeft: 'translate(-60px, 60px)',
  bottomRight: 'translate(60px, 60px)',
};

/* ══════════════════════════════════════════
   SECTION 6 – AUDIENCE (Drag-Scroll Strip)
══════════════════════════════════════════ */
const AUDIENCE = [
  {
    icon: '⚛️', label: 'React Three Fiber', sub: 'R3F developers',
    desc: 'Optimize GLB assets for R3F scenes. Reduce draw calls, compress textures, and hit 60fps frame budgets on any device.',
    color: '#61DAFB', bg: 'rgba(97,218,251,0.06)', big: true,
  },
  {
    icon: '🔷', label: 'Three.js', sub: 'Core library users',
    desc: 'Validate geometry and inspect materials before loading into your Three.js scene.',
    color: '#7c6af7', bg: 'rgba(124,106,247,0.07)',
  },
  {
    icon: '🎮', label: 'Game Developers', sub: 'Web-based games',
    desc: 'Keep polygon budgets tight and texture atlases optimized for real-time rendering.',
    color: '#f59e0b', bg: 'rgba(245,158,11,0.07)',
  },
  {
    icon: '🛍', label: 'E-Commerce Teams', sub: '3D product display',
    desc: 'Ship fast-loading product viewers that convert. Cut GLB size by 80% without sacrificing visual quality.',
    color: '#22d3a3', bg: 'rgba(34,211,163,0.07)', big: true,
  },
  {
    icon: '🥽', label: 'AR / VR Creators', sub: 'Immersive experiences',
    desc: 'Hit mobile AR polygon limits and pass Apple AR Quick Look validation first try.',
    color: '#a78bfa', bg: 'rgba(167,139,250,0.07)',
  },
  {
    icon: '💼', label: '3D Freelancers', sub: 'Client deliveries',
    desc: 'Deliver web-ready models to every client. No more back-and-forth on file size.',
    color: '#fb923c', bg: 'rgba(251,146,60,0.07)',
  },
];

function DragScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onDown = (e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.pageX - (ref.current?.offsetLeft ?? 0);
    scrollLeft.current = ref.current?.scrollLeft ?? 0;
    if (ref.current) ref.current.style.cursor = 'grabbing';
  };
  const onUp = () => {
    dragging.current = false;
    if (ref.current) ref.current.style.cursor = 'grab';
  };
  const onMove = (e: React.MouseEvent) => {
    if (!dragging.current || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    ref.current.scrollLeft = scrollLeft.current - (x - startX.current);
  };

  return (
    <div
      ref={ref}
      className={s.dragStrip}
      onMouseDown={onDown}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      onMouseMove={onMove}
    >
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════
   SECTION 7 – WHY NOT MANUAL (Flip Cards)
══════════════════════════════════════════ */
function FlipCard({ front, back }: { front: React.ReactNode; back: React.ReactNode }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      className={`${s.flipWrap} ${flipped ? s.flipWrapActive : ''}`}
      onClick={() => setFlipped(f => !f)}
    >
      <div className={s.flipInner}>
        <div className={s.flipFront}>{front}</div>
        <div className={s.flipBack}>{back}</div>
      </div>
      <div className={s.flipHint}>{flipped ? 'Click to flip back' : 'Click to flip'}</div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SECTION 9 – FAQ (Smooth Accordion)
══════════════════════════════════════════ */
const FAQS = [
  { q: 'Is my model stored permanently?', a: 'No. All processing runs in your browser via JavaScript. Your files never leave your device or touch any server.' },
  { q: 'What file formats are supported?', a: 'Currently GLB. GLTF support is on the roadmap. OBJ and FBX evaluation is planned.' },
  { q: 'Is it safe with proprietary models?', a: 'Yes — 100% client-side. Files are never uploaded anywhere.' },
  { q: 'Does it affect visual quality?', a: 'The inspector is non-destructive — you see stats and then choose what to do. Default export produces no visual loss.' },
  { q: 'Is it really free?', a: 'Yes, completely free and open source on GitHub. Contributions and feedback are welcome.' },
  { q: 'Can I use this in production workflows?', a: 'Absolutely. Built for developers who need fast iteration on model quality for web and mobile.' },
];

function FAQItem({ q, a, idx }: { q: string; a: string; idx: number }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  return (
    <div className={`${s.faqItem} ${open ? s.faqOpen : ''}`} style={{ animationDelay: `${idx * 60}ms` }}>
      <button className={s.faqQ} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>{q}</span>
        <span className={s.faqIcon}>{open ? '×' : '+'}</span>
      </button>
      <div
        ref={bodyRef}
        className={s.faqBody}
        style={{ maxHeight: open ? (bodyRef.current?.scrollHeight ?? 200) + 'px' : '0px' }}
      >
        <p className={s.faqA}>{a}</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   PAGE
══════════════════════════════════════════ */
export default function HomePage() {
  // Before/After slider
  const [sliderPos, setSliderPos] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const { ref: sliderSection, inView: sliderInView } = useInView(0.3);
  const fileSize = useCountUp(28, 1400, sliderInView);
  const tris = useCountUp(230, 1400, sliderInView);
  const draws = useCountUp(112, 1400, sliderInView);

  const onSliderMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const move = (ev: MouseEvent) => {
      const rect = sliderRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSliderPos(Math.max(5, Math.min(95, ((ev.clientX - rect.left) / rect.width) * 100)));
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, []);

  // How It Works
  const { ref: howRef, inView: howInView } = useInView(0.1);
  // Features
  const { ref: featRef, inView: featInView } = useInView(0.1);
  // Roadmap
  const { ref: roadRef, inView: roadInView } = useInView(0.1);
  // FAQ
  const { ref: faqRef, inView: faqInView } = useInView(0.1);
  // CTA
  const { ref: ctaRef, inView: ctaInView } = useInView(0.2);

  return (
    <div className={s.page}>

      {/* ══ NAV ══ */}
      <nav className={s.nav}>
        <div className={s.navInner}>
          <div className={s.navLogo}>
            <div className={s.logoIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <span className={s.logoText}>TheNext3D</span>
          </div>
          <div className={s.navLinks}>
            <a href="#how-it-works" className={s.navLink}>How It Works</a>
            <a href="#features" className={s.navLink}>Features</a>
            <a href="#faq" className={s.navLink}>FAQ</a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className={s.navGithub}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.749 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
              Open Source
            </a>
          </div>
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section className={s.hero}>
        <div className={s.gridBg} aria-hidden />
        <div className={s.heroGlow} aria-hidden />
        <div className={s.heroContent}>
          <div className={s.heroBadgeTop}>
            <span className={s.heroBadgeDot} />
            Free &amp; Open Source · No Account Required
          </div>
          <TypewriterHero />
          <p className={s.heroSub}>
            Analyze, inspect, and compress your GLB files for web &amp; mobile.<br />
            Reduce file size. Fix performance issues. Ship faster.
          </p>
          <div className={s.heroCTAs}>
            <Link href="/viewer" className={s.ctaPrimary}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              Analyze My GLB — Free
            </Link>
            <a href="#how-it-works" className={s.ctaSecondary}>
              See How It Works
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            </a>
          </div>
          {/* Floating metric cards */}
          <div className={s.floatCards}>
            <FloatCard label="File Size" value="28 MB" color="#ef4444" delay={600} />
            <FloatCard label="Triangles" value="230k" color="#f59e0b" delay={800} />
            <FloatCard label="Draw Calls" value="112" color="#ef4444" delay={1000} />
            <FloatCard label="→ Optimized" value="4.2 MB" color="#22d3a3" delay={1200} />
            <FloatCard label="→ Triangles" value="68k" color="#22d3a3" delay={1400} />
            <FloatCard label="→ Draw Calls" value="18" color="#22d3a3" delay={1600} />
          </div>
        </div>
      </section>

      {/* ══ PROBLEM – Dual Marquee ══ */}
      <section className={s.problemSection} id="problem">
        <div className={s.container}>
          <div className={s.sectionTag}>The Problem</div>
          <RevealHeading>Why Is Your 3D Model Slow?</RevealHeading>
          <p className={s.sectionLead}>Most models ship unoptimized. Common issues:</p>
        </div>
        <div className={s.marqueeBlock}>
          <div className={s.marqueeFade} aria-hidden />
          <div className={s.marqueeFadeRight} aria-hidden />
          <div className={s.marqueeRow}>
            <div className={s.marqueeTrack}>
              {[...ROW1, ...ROW1].map((t, i) => <MarqueePill key={i} text={t} warn />)}
            </div>
          </div>
          <div className={s.marqueeRow}>
            <div className={`${s.marqueeTrack} ${s.marqueeReverse}`}>
              {[...ROW2, ...ROW2].map((t, i) => <MarqueePill key={i} text={t} />)}
            </div>
          </div>
        </div>
        <div className={s.container}>
          <div className={s.problemCallout}>
            Your model might look great in Blender — but it&apos;s not ready for the web.
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS – Vertical Timeline ══ */}
      <section className={s.section} id="how-it-works">
        <div className={s.container}>
          <div className={s.sectionTag}>Process</div>
          <RevealHeading>Optimize in 3 Simple Steps</RevealHeading>
          <div ref={howRef} className={s.timeline}>
            {STEPS.map((step, idx) => (
              <TimelineStep key={step.n} {...step} idx={idx} active={howInView} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ FEATURES – 2×2 Pinwheel Grid ══ */}
      <section className={s.section} id="features" style={{ background: 'rgba(17,17,24,0.6)' }}>
        <div className={s.container}>
          <div className={s.sectionTag}>Features</div>
          <RevealHeading>Built for 3D Developers</RevealHeading>
          <div ref={featRef} className={s.featGrid}>
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={s.featCard}
                style={{
                  opacity: featInView ? 1 : 0,
                  transform: featInView ? 'translate(0,0) scale(1)' : `${FROM_MAP[f.from]} scale(0.85)`,
                  transition: `opacity 0.6s ${i * 80}ms, transform 0.6s ${i * 80}ms cubic-bezier(0.34,1.56,0.64,1)`,
                }}
              >
                <div className={s.featIcon}>{f.icon}</div>
                <h3 className={s.featTitle}>{f.title}</h3>
                <ul className={s.featList}>
                  {f.items.map(it => (
                    <li key={it} className={s.featItem}>
                      <span className={s.featDot} />{it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ BEFORE/AFTER – Interactive Slider ══ */}
      <section className={s.section} id="before-after">
        <div className={s.container}>
          <div className={s.sectionTag}>Results</div>
          <RevealHeading>Real Performance Improvements</RevealHeading>
          <p className={s.sectionLead}>Drag the slider to compare. Numbers count up live when you scroll in.</p>
          <div className={s.baWrap} ref={sliderSection}>
            <div className={s.sliderWrap} ref={sliderRef} onMouseDown={onSliderMouseDown}>
              {/* BEFORE panel */}
              <div className={s.sliderLeft} style={{ width: `${sliderPos}%` }}>
                <div className={s.sliderLabel} style={{ color: '#ef4444' }}>BEFORE</div>
                <div className={s.sliderMetrics}>
                  <div className={s.sliderMetric}>
                    <span className={s.sliderMetricVal} style={{ color: '#ef4444' }}>{fileSize}<small>MB</small></span>
                    <span className={s.sliderMetricKey}>File Size</span>
                  </div>
                  <div className={s.sliderMetric}>
                    <span className={s.sliderMetricVal} style={{ color: '#ef4444' }}>{tris}<small>k</small></span>
                    <span className={s.sliderMetricKey}>Triangles</span>
                  </div>
                  <div className={s.sliderMetric}>
                    <span className={s.sliderMetricVal} style={{ color: '#f59e0b' }}>{draws}</span>
                    <span className={s.sliderMetricKey}>Draw Calls</span>
                  </div>
                </div>
              </div>
              {/* AFTER panel */}
              <div className={s.sliderRight} style={{ left: `${sliderPos}%` }}>
                <div className={s.sliderLabel} style={{ color: '#22d3a3' }}>AFTER</div>
                <div className={s.sliderMetrics}>
                  <div className={s.sliderMetric}>
                    <span className={s.sliderMetricVal} style={{ color: '#22d3a3' }}>4.2<small>MB</small></span>
                    <span className={s.sliderMetricKey}>File Size</span>
                  </div>
                  <div className={s.sliderMetric}>
                    <span className={s.sliderMetricVal} style={{ color: '#22d3a3' }}>68<small>k</small></span>
                    <span className={s.sliderMetricKey}>Triangles</span>
                  </div>
                  <div className={s.sliderMetric}>
                    <span className={s.sliderMetricVal} style={{ color: '#22d3a3' }}>18</span>
                    <span className={s.sliderMetricKey}>Draw Calls</span>
                  </div>
                </div>
              </div>
              {/* handle */}
              <div className={s.sliderHandle} style={{ left: `${sliderPos}%` }} onMouseDown={onSliderMouseDown}>
                <div className={s.sliderHandleKnob}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              </div>
            </div>
            <div className={s.baStats}>
              <div className={s.baStat}><strong>85%</strong> file size reduction</div>
              <div className={s.baDot} />
              <div className={s.baStat}><strong>4×</strong> faster load</div>
              <div className={s.baDot} />
              <div className={s.baStat}><strong>6×</strong> fewer draw calls</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ AUDIENCE – Bento Grid ══ */}
      <section className={s.section} id="for-who" style={{ background: 'rgba(17,17,24,0.6)' }}>
        <div className={s.container}>
          <div className={s.sectionTag}>Audience</div>
          <RevealHeading>Built For</RevealHeading>
          <p className={s.sectionLead}>If you ship 3D on the web, this is for you.</p>
          <div className={s.audienceBento}>
            {AUDIENCE.map(({ icon, label, sub, desc, color, bg, big }, i) => (
              <div
                key={label}
                className={`${s.audienceBentoCard} ${big ? s.audienceBentoCardBig : ''}`}
                style={{
                  '--ac': color,
                  '--abg': bg,
                  animationDelay: `${i * 80}ms`,
                } as React.CSSProperties}
              >
                <div className={s.audienceBentoIcon} style={{ color }}>{icon}</div>
                <div className={s.audienceBentoLabel} style={{ color }}>{label}</div>
                <div className={s.audienceBentoSub}>{sub}</div>
                <p className={s.audienceBentoDesc}>{desc}</p>
                <div className={s.audienceBentoBar} style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ WHY NOT MANUAL – Flip Cards ══ */}
      <section className={s.section} id="why">
        <div className={s.container}>
          <div className={s.sectionTag}>Why This Tool</div>
          <RevealHeading>Manual Optimization Takes Hours</RevealHeading>
          <p className={s.sectionLead}>Click the cards to flip them.</p>
          <div className={s.flipRow}>
            <FlipCard
              front={
                <div className={s.flipContent}>
                  <div className={s.flipTitle} style={{ color: '#ef4444' }}>😤 The Manual Way</div>
                  {['Blender export tweaks', 'Run texture compression tools', 'Mesh simplification passes', 'Trial & error testing', 'Repeat for every model', 'Hours of iteration'].map(t => (
                    <div key={t} className={s.flipRow2Item}><span style={{ color: '#ef4444' }}>✕</span> {t}</div>
                  ))}
                </div>
              }
              back={
                <div className={s.flipContent}>
                  <div className={s.flipTitle} style={{ color: '#22d3a3' }}>✨ With TheNext3D</div>
                  {['Upload your GLB', 'Instant analysis report', 'Inspect every mesh', 'Apply changes visually', 'Export production GLB', 'Done in seconds'].map((t, i) => (
                    <div key={t} className={s.flipRow2Item} style={{ animationDelay: `${i * 60}ms` }}><span style={{ color: '#22d3a3' }}>✓</span> {t}</div>
                  ))}
                </div>
              }
            />
            <div className={s.flipVs}>
              <div className={s.flipVsInner}>VS</div>
            </div>
            <FlipCard
              front={
                <div className={s.flipContent}>
                  <div className={s.flipTitle}>⏱ Time Cost</div>
                  <div className={s.flipBigStat} style={{ color: '#ef4444' }}>4–8<small>hrs</small></div>
                  <div className={s.flipSubstat}>per model, manually</div>
                  <div className={s.flipSubstat} style={{ marginTop: 12 }}>Complex pipeline, error-prone,<br />requires multiple tools</div>
                </div>
              }
              back={
                <div className={s.flipContent}>
                  <div className={s.flipTitle}>⚡ With TheNext3D</div>
                  <div className={s.flipBigStat} style={{ color: '#22d3a3' }}>&lt;30<small>sec</small></div>
                  <div className={s.flipSubstat}>per model, automated</div>
                  <div className={s.flipSubstat} style={{ marginTop: 12 }}>Browser-based, zero setup,<br />instant results</div>
                </div>
              }
            />
          </div>
        </div>
      </section>

      {/* ══ ROADMAP – Staggered Bento Grid ══ */}
      <section className={s.section} id="roadmap" style={{ background: 'rgba(17,17,24,0.6)' }}>
        <div className={s.container}>
          <div className={s.sectionTag}>Coming Soon</div>
          <RevealHeading>Future Roadmap</RevealHeading>
          <p className={s.sectionLead}>We&apos;re building the Lighthouse for 3D assets.</p>
          <div ref={roadRef} className={s.bentoGrid}>
            {[
              { icon: '🗜', label: 'Draco Compression', sub: 'One-click mesh compression', big: true },
              { icon: '📦', label: 'Batch Optimization', sub: 'Process multiple models at once' },
              { icon: '🔌', label: 'API Access', sub: 'CI/CD pipeline integration' },
              { icon: '📱', label: 'Mobile Sim', sub: 'Test on virtual low-end devices', big: true },
              { icon: '✅', label: 'Asset Validation', sub: 'Automated quality checks' },
              { icon: '📈', label: 'Performance Compare', sub: 'Before vs after analytics' },
              { icon: '👥', label: 'Team Dashboard', sub: 'Shared model library' },
              { icon: '🔧', label: 'GLTF Support', sub: 'Multiple format input' },
            ].map(({ icon, label, sub, big }, i) => (
              <div
                key={label}
                className={`${s.bentoItem} ${big ? s.bentoItemBig : ''}`}
                style={{
                  opacity: roadInView ? 1 : 0,
                  transform: roadInView ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.93)',
                  transition: `opacity 0.5s ${i * 70}ms, transform 0.5s ${i * 70}ms cubic-bezier(0.34,1.56,0.64,1)`,
                }}
              >
                <span className={s.bentoIcon}>{icon}</span>
                <span className={s.bentoLabel}>{label}</span>
                <span className={s.bentoSub}>{sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FAQ – Animated Accordion ══ */}
      <section className={s.section} id="faq">
        <div className={s.container}>
          <div className={s.sectionTag}>FAQ</div>
          <RevealHeading>Frequently Asked Questions</RevealHeading>
          <div ref={faqRef} className={s.faqList}>
            {FAQS.map((f, i) => (
              <div
                key={f.q}
                style={{
                  opacity: faqInView ? 1 : 0,
                  transform: faqInView ? 'translateX(0)' : 'translateX(-20px)',
                  transition: `opacity 0.45s ${i * 70}ms, transform 0.45s ${i * 70}ms`,
                }}
              >
                <FAQItem {...f} idx={i} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA – Glow Rings ══ */}
      <section className={s.ctaSection} id="cta">
        <div ref={ctaRef} className={s.ctaRings}>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className={s.ctaRing}
              style={{
                animationDelay: `${i * 0.6}s`,
                opacity: ctaInView ? 1 : 0,
                transition: `opacity 0.5s ${i * 200}ms`,
              }}
            />
          ))}
          <div className={s.ctaInner}>
            <div className={s.sectionTag} style={{ textAlign: 'center' }}>Get Started</div>
            <h2 className={s.ctaH2}>Ready to Inspect Your 3D Model?</h2>
            <p className={s.ctaSub}>Upload your GLB and see exactly what&apos;s inside — meshes, materials, textures, and performance stats.</p>
            <Link href="/viewer" className={s.ctaPrimaryLarge}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              Analyze My GLB — Free
            </Link>
            <div className={s.ctaNotes}>
              <span>✓ No account</span>
              <span>✓ Runs in browser</span>
              <span>✓ Open source</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div className={s.footerLogo}>
            <div className={s.logoIcon}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
            </div>
            <span className={s.logoText} style={{ fontSize: '0.85rem' }}>TheNext3D</span>
          </div>
          <p className={s.footerText}>Free &amp; open source. Built for 3D web developers.</p>
          <div className={s.footerLinks}>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className={s.footerLink}>GitHub</a>
            <a href="#faq" className={s.footerLink}>FAQ</a>
            <Link href="/viewer" className={s.footerLink}>Launch Viewer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
