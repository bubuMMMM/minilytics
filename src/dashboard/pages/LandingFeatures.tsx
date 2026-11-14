import type { ReactNode } from 'react';
import { useId } from 'react';
import { UiIcon, type UiIconName } from '../components/UiIcon';

/** Bento of real product features, each with a decorative HTML/CSS/SVG preview. Numbers are illustrative, never claimed as live stats. */
export function FeaturesBento() {
  return (
    <>
      <div className="ml-features mt-12 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Feat split span="md:col-span-2 lg:col-span-4" icon="bar-chart" title="Visiteurs et pages vues" text="Uniques, visites, rebond, durée — page par page. React, Next et Vue, suivis tout seuls." visual={<VisualChart />} />
        <Feat span="lg:col-span-2" icon="globe" title="Carte en direct" text="Le monde de vos visiteurs, seconde par seconde." visual={<VisualMap />} />
        <Feat span="lg:col-span-2" icon="compass" title="Sources et campagnes" text="Google, 𝕏, e-mail, assistant IA, UTM et ?ref= : chaque visite au bon canal." visual={<VisualSources />} />
        <Feat span="lg:col-span-2" icon="target" title="Objectifs et entonnoirs" text="Un attribut data-ml-goal. L’entonnoir montre où l’on décroche." visual={<VisualFunnel />} />
        <Feat span="lg:col-span-2" icon="coins" title="Revenus attribués" text="Stripe, Shopify, Polar, Paddle… le paiement, rattaché à sa source." visual={<VisualRevenue />} />
        <Feat span="lg:col-span-2" icon="users" title="Profil visiteur" text="Drapeau, source, page, durée : la visite se lit d’un coup d’œil." visual={<VisualVisitor />} />
        <Feat span="lg:col-span-2" icon="layout" title="Widgets" text="Compteur, graphique ou carte, à coller sur votre site en une ligne." visual={<VisualWidget />} />
        <Feat span="lg:col-span-2" icon="bot" title="Bots IA" text="GPTBot, Claude, Perplexity : qui lit vos pages, à part des humains." visual={<VisualBots />} />
        <Feat span="lg:col-span-3" icon="lock" title="Léger et respectueux" text="≈ 6 Ko, servable depuis votre domaine. First-party ou sans cookie. Rien n’est revendu, les robots sont ignorés." visual={<VisualPrivacy />} />
        <Feat span="lg:col-span-3" icon="code" title="API, CLI et MCP" text="Export CSV, bac à sable REST, et un serveur MCP pour Claude, Cursor ou ChatGPT." visual={<VisualApi />} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 sm:gap-4">
        {OPTIONAL.map((f) => (
          <article key={f.title} className="ml-feat ml-feat-optional p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-ink">
                <span className="ml-feat-ico" aria-hidden><UiIcon name={f.icon} size={15} /></span>
                {f.title}
              </h3>
              <span className="shrink-0 rounded-full border border-line bg-well px-2 py-0.5 text-[11px] font-medium text-ink-3">En option</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-3"><span className="text-ink-2">{f.when}.</span> {f.text}</p>
            <div className="ml-feat-visual mt-4 p-3" aria-hidden>{f.visual}</div>
          </article>
        ))}
      </div>
    </>
  );
}

const OPTIONAL: { icon: UiIconName; title: string; when: string; text: string; visual: ReactNode }[] = [
  { icon: 'play', title: 'Vidéos', when: 'Si votre site a des vidéos', text: 'Lectures, rétention, pauses, vitesse et plein écran, vidéo par vidéo.', visual: <VisualVideo /> },
  { icon: 'megaphone', title: 'Emplacements sponsorisés', when: 'Si vous vendez des emplacements', text: 'Impressions vraiment vues, clics, et un export CSV pour vos partenaires.', visual: <VisualSponsors /> },
  { icon: 'grid', title: 'Sections et contenus', when: 'Si vous mesurez ce qui est vu', text: 'Les blocs réellement affichés à l’écran, et ceux que l’on clique.', visual: <VisualContents /> },
];

function Feat({ span, icon, title, text, visual, split = false }: { span?: string; icon: UiIconName; title: string; text: string; visual: ReactNode; split?: boolean }) {
  return (
    <article className={`ml-feat p-5 sm:p-6 ${split ? 'lg:grid lg:grid-cols-[minmax(220px,2fr)_minmax(0,3fr)] lg:items-center lg:gap-8' : 'flex flex-col'} ${span ?? ''}`}>
      <div className="min-w-0">
        <span className="ml-feat-ico" aria-hidden><UiIcon name={icon} size={16} /></span>
        <h3 className="mt-3.5 text-[15px] font-semibold tracking-[-0.015em] text-ink sm:text-[16px]">{title}</h3>
        <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-ink-3 [text-wrap:pretty] sm:text-[14px]">{text}</p>
      </div>
      <div className={`ml-feat-visual mt-5 p-3 sm:p-4 ${split ? 'lg:mt-0' : ''}`} aria-hidden>{visual}</div>
    </article>
  );
}

function VisualChart() {
  const id = useId().replace(/:/g, '');
  const line = 'M0 78 C28 76 48 70 70 58 C92 46 110 22 132 20 C154 18 168 32 186 28 C208 22 224 10 248 8';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-5 px-0.5">
        {[['Visiteurs', '2 481'], ['Pages', '6 104'], ['Rebond', '31 %']].map(([l, v]) => (
          <div key={l} className="min-w-0">
            <div className="text-[11px] text-ink-3">{l}</div>
            <div className="tnum text-[18px] font-semibold tracking-tight text-ink sm:text-[20px]">{v}</div>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 248 88" className="h-[88px] w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fg${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--accent))" stopOpacity="0.32" />
            <stop offset="1" stopColor="rgb(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L248 88 L0 88 Z`} fill={`url(#fg${id})`} />
        <path d={line} fill="none" stroke="rgb(var(--accent))" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function VisualMap() {
  return (
    <div className="relative h-[132px] overflow-hidden sm:h-[148px]">
      <svg viewBox="0 0 220 148" className="absolute inset-0 h-full w-full text-ink-4/50">
        <ellipse cx="110" cy="74" rx="86" ry="58" fill="none" stroke="currentColor" strokeWidth="1" />
        <ellipse cx="110" cy="74" rx="52" ry="58" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.7" />
        <path d="M24 74h172M110 16v116" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.7" />
        <path d="M42 42c28 8 56 8 84 0M48 108c24-8 56-8 88 0" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.55" />
      </svg>
      {[
        { x: '32%', y: '38%', live: false },
        { x: '48%', y: '34%', live: true },
        { x: '62%', y: '46%', live: false },
        { x: '28%', y: '58%', live: false },
        { x: '70%', y: '36%', live: false },
      ].map((d, i) => (
        <span key={i} className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${d.live ? 'ml-feat-pulse bg-accent' : 'bg-ink-3/70'}`} style={{ left: d.x, top: d.y }} />
      ))}
      <div className="absolute bottom-0 left-0 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface/90 px-2 py-1 text-[11px] font-medium text-ink-2 backdrop-blur-sm">
        <span className="ml-dot-live" /> 3 en ligne
      </div>
    </div>
  );
}

function VisualSources() {
  const rows = [
    { l: 'Google', w: '86%' },
    { l: '𝕏', w: '54%' },
    { l: 'ChatGPT', w: '38%' },
    { l: 'E-mail', w: '22%' },
  ];
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.l} className="flex items-center gap-2 text-[12px]">
          <span className="w-[68px] shrink-0 truncate text-ink-2">{r.l}</span>
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
            <span className="ml-feat-bar block h-full rounded-full bg-accent" style={{ width: r.w }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function VisualFunnel() {
  const steps = [
    { l: 'Accueil', w: '100%' },
    { l: 'Produit', w: '64%' },
    { l: 'Paiement', w: '31%' },
    { l: 'Merci', w: '18%' },
  ];
  return (
    <ul className="space-y-1.5">
      {steps.map((s) => (
        <li key={s.l} className="flex items-center gap-2 text-[12px]">
          <span className="w-[72px] shrink-0 text-ink-2">{s.l}</span>
          <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-line/80">
            <span className="ml-feat-bar absolute inset-y-0 left-0 rounded-md bg-accent/25" style={{ width: s.w }} />
          </span>
          <span className="tnum w-10 shrink-0 text-right text-[11px] font-medium text-ink-3">{s.w.replace('%', ' %')}</span>
        </li>
      ))}
    </ul>
  );
}

function VisualRevenue() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="tnum text-[22px] font-semibold tracking-tight text-ink">1 248 €</span>
        <span className="tnum text-[12px] font-medium text-success">+18 %</span>
      </div>
      <ul className="mt-3 space-y-2">
        {[['Google', '62 %', '72%'], ['Newsletter', '28 %', '40%'], ['Direct', '10 %', '16%']].map(([l, n, w]) => (
          <li key={l} className="flex items-center gap-2 text-[12px] text-ink-2">
            <span className="w-[88px] shrink-0 truncate">{l}</span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
              <span className="ml-feat-bar block h-full rounded-full bg-accent" style={{ width: w }} />
            </span>
            <span className="tnum w-9 shrink-0 text-right text-ink-3">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VisualVisitor() {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-xs">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-well text-[16px]">🐨</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-ink">Panda calme</span>
            <span className="tnum shrink-0 text-[11px] text-ink-3">2 p. · 1 min 12</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3">
            <span aria-hidden>🇫🇷</span> Paris · Google · <span className="truncate font-mono text-[11px]">/tarifs</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisualWidget() {
  return (
    <div className="flex justify-center">
      <div className="ml-feat-glass w-full max-w-[220px] rounded-xl px-4 py-3">
        <div className="text-[11px] text-ink-3">Visiteurs · 30 jours</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="tnum text-[26px] font-semibold tracking-tight text-ink">2 481</span>
          <span className="tnum text-[12px] font-medium text-success">+12 %</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-line/80 pt-1.5 text-[10px] text-ink-3">
          <span>Minilytics</span>
          <span className="font-mono">votre-site.fr</span>
        </div>
      </div>
    </div>
  );
}

function VisualBots() {
  const rows = [
    { l: 'GPTBot', w: '78%' },
    { l: 'ClaudeBot', w: '52%' },
    { l: 'Perplexity', w: '34%' },
  ];
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.l} className="flex items-center gap-2 text-[12px]">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-3"><UiIcon name="bot" size={11} /></span>
          <span className="w-[84px] shrink-0 truncate font-medium text-ink-2">{r.l}</span>
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
            <span className="ml-feat-bar block h-full rounded-full bg-ink-3" style={{ width: r.w }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function VisualPrivacy() {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {['≈ 6 Ko', 'First-party', 'Mode sans cookie', 'Aucune revente', 'Robots filtrés'].map((l) => (
        <li key={l} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-2">
          <span className="text-success" aria-hidden><UiIcon name="check" size={11} /></span>{l}
        </li>
      ))}
    </ul>
  );
}

function VisualApi() {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-canvas px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink-2">
      <div><span className="text-ink-4">$</span> minilytics stats --days 7</div>
      <div className="mt-1 tnum text-ink">visiteurs  <span className="text-accent">2 481</span>  ·  pages  6 104</div>
    </div>
  );
}

function VisualVideo() {
  return (
    <div className="flex h-8 items-end gap-1">
      {[28, 46, 62, 70, 54, 40, 24].map((h, i) => (
        <span key={i} className="flex-1 rounded-sm bg-accent/25" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function VisualSponsors() {
  return (
    <div className="flex items-center gap-3 text-[12px]">
      <span className="tnum text-[16px] font-semibold text-ink">1,2 %</span>
      <span className="text-ink-3">CTR · 4 210 impressions</span>
    </div>
  );
}

function VisualContents() {
  return (
    <ul className="space-y-1.5">
      {[['Hero', '92 %'], ['Article', '61 %'], ['Pied', '18 %']].map(([l, n]) => (
        <li key={l} className="flex items-center justify-between text-[12px] text-ink-2">
          <span>{l}</span><span className="tnum text-ink-3">{n}</span>
        </li>
      ))}
    </ul>
  );
}
