import { CodeBlock } from '../components/ui';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type Site } from '../lib/api';
import { UiIcon } from '../components/UiIcon';

type WType = 'live' | 'counter' | 'chart' | 'pages' | 'map' | 'badge';
type Theme = 'auto' | 'light' | 'dark';
interface Opts { type: WType; theme: Theme; accent: string; size: 'sm' | 'md' | 'lg'; period: string; transparent: boolean; locale: 'fr' | 'en'; logo: boolean; badge: 'live' | 'visitors' | 'pageviews' }

const TYPES: { key: WType; label: string; hint: string }[] = [
  { key: 'live', label: 'En ligne', hint: '« 3 personnes en ligne »' },
  { key: 'counter', label: 'Compteur', hint: 'Visiteurs sur la période' },
  { key: 'chart', label: 'Graphique', hint: 'Courbe des visiteurs' },
  { key: 'pages', label: 'Top pages', hint: '5 pages les plus vues' },
  { key: 'map', label: 'Carte', hint: 'Pays touchés' },
  { key: 'badge', label: 'Badge SVG', hint: 'Pour un README GitHub' },
];
const PERIODS = [
  { value: 'today', label: 'Aujourd’hui' }, { value: '24h', label: '24 h' }, { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' }, { value: '90d', label: '90 jours' }, { value: '12m', label: '12 mois' }, { value: 'all', label: 'Depuis le début' },
];
const ACCENTS = ['2563eb', '16a34a', '7c3aed', 'db2777', 'ea580c', '0a0a0a'];
// Heights at size M (content + 4 px); the script embed resizes itself, the iframe snippet scales these.
const HEIGHT: Record<Exclude<WType, 'badge'>, number> = { live: 40, counter: 156, chart: 214, pages: 258, map: 240 };
const SCALE = { sm: 0.86, md: 1, lg: 1.18 } as const;

function params(o: Opts, wid?: string) {
  const p = new URLSearchParams();
  p.set('type', o.type === 'badge' ? o.badge : o.type);
  if (o.theme !== 'auto') p.set('theme', o.theme);
  if (o.accent !== '2563eb') p.set('accent', o.accent);
  if (o.size !== 'md') p.set('size', o.size);
  if (o.type !== 'live' && !(o.type === 'badge' && o.badge === 'live') && o.period !== '30d') p.set('period', o.period);
  if (o.transparent && o.type !== 'badge') p.set('transparent', '1');
  if (o.locale !== 'fr') p.set('locale', o.locale);
  if (!o.logo && o.type !== 'badge') p.set('logo', '0');
  if (wid) p.set('wid', wid);
  return p.toString();
}

export function WidgetBuilder({ site }: { site: Site }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [o, setO] = useState<Opts>({ type: 'live', theme: 'auto', accent: '2563eb', size: 'md', period: '30d', transparent: false, locale: 'fr', logo: true, badge: 'live' });
  const [stage, setStage] = useState<'light' | 'dark'>('light');
  const [tab, setTab] = useState<'script' | 'iframe' | 'markdown' | 'html'>('script');
  const set = (p: Partial<Opts>) => setO((x) => ({ ...x, ...p }));
  useEffect(() => { api<{ token: string | null }>(`/api/sites/${site.id}/widgets`).then((r) => setToken(r.token), (e) => setError((e as Error).message)); }, [site.id]);
  useEffect(() => { if (o.type === 'badge' && (tab === 'script' || tab === 'iframe')) setTab('markdown'); if (o.type !== 'badge' && (tab === 'markdown' || tab === 'html')) setTab('script'); }, [o.type, tab]);

  async function run(method: 'POST' | 'DELETE') {
    setBusy(true); setError('');
    try {
      const r = await api<{ token?: string | null }>(`/api/sites/${site.id}/widgets`, { method });
      setToken(method === 'DELETE' ? null : r.token ?? null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const origin = window.location.origin;
  const code = useMemo(() => {
    if (!token) return '';
    if (o.type === 'badge') {
      const src = `${origin}/api/widget/${token}/badge.svg?${params(o)}`;
      return tab === 'markdown' ? `[![${o.badge === 'live' ? 'Visiteurs en ligne' : 'Visiteurs'} — ${site.domain}](${src})](https://${site.domain})` : `<a href="https://${site.domain}"><img src="${src}" alt="Statistiques ${site.domain}" height="20"></a>`;
    }
    if (tab === 'iframe') {
      const w = o.type === 'live' ? ' width="260"' : ' width="100%"';
      return `<iframe src="${origin}/api/widget/${token}/embed?${params(o)}"${w} height="${Math.ceil(HEIGHT[o.type] * SCALE[o.size])}" style="border:0;max-width:100%;background:transparent" loading="lazy" title="Statistiques ${site.domain}"></iframe>`;
    }
    const attrs = [`data-minilytics-widget="${o.type}"`, `data-token="${token}"`];
    if (o.theme !== 'auto') attrs.push(`data-theme="${o.theme}"`);
    if (o.accent !== '2563eb') attrs.push(`data-accent="${o.accent}"`);
    if (o.size !== 'md') attrs.push(`data-size="${o.size}"`);
    if (o.type !== 'live' && o.period !== '30d') attrs.push(`data-period="${o.period}"`);
    if (o.transparent) attrs.push('data-transparent="1"');
    if (o.locale !== 'fr') attrs.push(`data-locale="${o.locale}"`);
    if (!o.logo) attrs.push('data-logo="0"');
    return `<div ${attrs.join(' ')}></div>\n<script async src="${origin}/js/widget.js"></script>`;
  }, [token, o, tab, origin, site.domain]);

  return (
    <section id="widgets" className="card min-w-0 scroll-mt-24 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Widgets</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-3">Affichez vos visiteurs en direct, un compteur, une courbe, vos pages ou votre carte sur n’importe quel site, ou un badge dans un README. Uniquement des chiffres agrégés, mis à jour toutes les 30 s.</p>
        </div>
        {token && (
          <div className="flex gap-1">
            <button className="btn-ghost text-[12px]" disabled={busy} onClick={() => { if (confirm('Régénérer la clé des widgets ? Tous les widgets déjà intégrés cesseront de fonctionner.')) run('POST'); }}>Régénérer la clé</button>
            <button className="btn-ghost text-[12px] text-danger" disabled={busy} onClick={() => { if (confirm('Désactiver les widgets ? Tous les widgets intégrés cesseront de fonctionner.')) run('DELETE'); }}>Désactiver</button>
          </div>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      {token === undefined && <div className="ml-loading mt-4 h-24 rounded-xl" />}
      {token === null && (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong p-5 sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink-3"><UiIcon name="grid" size={18} /></span>
          <div className="flex-1 text-[13px] text-ink-3"><div className="font-semibold text-ink">Widgets désactivés</div>L’activation crée une clé publique propre aux widgets, révocable à tout moment. Elle ne donne accès à aucune autre donnée.</div>
          <button className="btn-dark" disabled={busy} onClick={() => run('POST')}>Activer les widgets</button>
        </div>
      )}
      {token && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Type de widget">
            {TYPES.map((t) => (
              <button key={t.key} role="radio" aria-checked={o.type === t.key} onClick={() => set({ type: t.key })}
                className={`min-h-[56px] rounded-lg border p-2.5 text-left transition-colors ${o.type === t.key ? 'border-accent bg-accent/5' : 'border-line hover:border-line-strong'}`}>
                <span className="block text-[13px] font-medium">{t.label}</span><span className="block text-[11px] text-ink-3">{t.hint}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {o.type === 'badge' && (
              <Field label="Chiffre affiché">
                <Seg value={o.badge} onChange={(v) => set({ badge: v as Opts['badge'] })} options={[['live', 'En ligne'], ['visitors', 'Visiteurs'], ['pageviews', 'Pages vues']]} />
              </Field>
            )}
            <Field label="Thème">
              <Seg value={o.theme} onChange={(v) => set({ theme: v as Theme })} options={o.type === 'badge' ? [['light', 'Clair'], ['dark', 'Sombre']] : [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']]} />
            </Field>
            {o.type !== 'live' && !(o.type === 'badge' && o.badge === 'live') && (
              <Field label="Période">
                <select className="input" value={o.period} onChange={(e) => set({ period: e.target.value })}>{PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
              </Field>
            )}
            <Field label="Couleur d’accent">
              <div className="flex flex-wrap items-center gap-1.5">
                {ACCENTS.map((a) => (
                  <button key={a} type="button" onClick={() => set({ accent: a })} aria-label={`Couleur #${a}`} aria-pressed={o.accent === a}
                    className={`h-8 w-8 rounded-full border-2 ${o.accent === a ? 'border-ink' : 'border-transparent'}`}><span className="block h-full w-full rounded-full border border-black/10" style={{ background: '#' + a }} /></button>
                ))}
                <label className="relative ml-1 inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2 text-[12px]">
                  <input type="color" className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0" value={'#' + o.accent} onChange={(e) => set({ accent: e.target.value.slice(1).toLowerCase() })} aria-label="Couleur personnalisée" />
                  <span className="font-mono">#{o.accent}</span>
                </label>
              </div>
            </Field>
            {o.type !== 'badge' && (
              <Field label="Taille">
                <Seg value={o.size} onChange={(v) => set({ size: v as Opts['size'] })} options={[['sm', 'S'], ['md', 'M'], ['lg', 'L']]} />
              </Field>
            )}
            <Field label="Langue">
              <Seg value={o.locale} onChange={(v) => set({ locale: v as Opts['locale'] })} options={[['fr', 'Français'], ['en', 'English']]} />
            </Field>
            {o.type !== 'badge' && (
              <Field label="Affichage">
                <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-[13px]">
                  <label className="inline-flex min-h-[32px] items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={o.transparent} onChange={(e) => set({ transparent: e.target.checked })} /> Fond transparent</label>
                  <label className="inline-flex min-h-[32px] items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={o.logo} onChange={(e) => set({ logo: e.target.checked })} /> Logo Minilytics</label>
                </div>
              </Field>
            )}
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-ink-2">Aperçu en direct</span>
              <Seg small value={stage} onChange={(v) => setStage(v as 'light' | 'dark')} options={[['light', 'Page claire'], ['dark', 'Page sombre']]} />
            </div>
            <div className={`flex min-h-[140px] items-center justify-center overflow-hidden rounded-xl border border-line p-5 sm:p-8 ${stage === 'dark' ? 'bg-[#0b0b0d]' : 'bg-[#f6f6f7]'}`}
              style={{ backgroundImage: `radial-gradient(${stage === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'} 1px, transparent 1px)`, backgroundSize: '14px 14px', colorScheme: stage }}>
              {o.type === 'badge'
                ? <img key={code} src={`/api/widget/${token}/badge.svg?${params(o)}`} alt="Aperçu du badge" height={20} />
                : <Preview key={params(o)} token={token} o={o} />}
            </div>
          </div>

          <div className="mt-5">
            <div className="tabs mb-2 w-fit">
              {(o.type === 'badge' ? [['markdown', 'Markdown'], ['html', 'HTML']] : [['script', 'Script'], ['iframe', 'iframe']]).map(([k, l]) => (
                <button key={k} className={`tab ${tab === k ? 'tab-active' : ''}`} onClick={() => setTab(k as typeof tab)}>{l}</button>
              ))}
            </div>
            <CodeBox code={code} />
            <p className="mt-2 text-[12px] text-ink-3">{o.type === 'badge' ? 'Le badge est une image SVG mise en cache 60 s : il fonctionne dans GitHub, GitLab, Notion…' : tab === 'script' ? 'Le script crée l’iframe et ajuste sa hauteur automatiquement. Collez-le où le widget doit apparaître.' : 'Sans JavaScript : ajustez la hauteur si besoin.'}</p>
          </div>
        </>
      )}
    </section>
  );
}

function Preview({ token, o }: { token: string; o: Opts }) {
  const wid = useMemo(() => 'pv' + Math.random().toString(36).slice(2, 8), []);
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(HEIGHT[o.type as Exclude<WType, 'badge'>]);
  const [w, setW] = useState<number | null>(null);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.minilytics === 'widget' && e.data.id === wid) { setH(e.data.h); setW(e.data.w); } };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [wid]);
  const width = o.type === 'live' ? (w ? `${w}px` : '240px') : '100%';
  return <iframe ref={ref} title="Aperçu du widget" src={`/api/widget/${token}/embed?${params(o, wid)}`} style={{ border: 0, width, maxWidth: o.type === 'live' ? '100%' : 420, height: h, background: 'transparent', display: 'block' }} />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><div className="label">{label}</div>{children}</div>;
}
function Seg({ value, onChange, options, small }: { value: string; onChange: (v: string) => void; options: string[][]; small?: boolean }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-well p-0.5" role="radiogroup">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={`whitespace-nowrap rounded-md px-3 ${small ? 'min-h-[28px] text-[12px]' : 'min-h-[34px] text-[13px]'} ${value === k ? 'bg-surface font-medium text-ink shadow-xs' : 'text-ink-3 hover:text-ink'}`}>{l}</button>
      ))}
    </div>
  );
}
function CodeBox({ code }: { code: string }) {
  return <CodeBlock code={code} wrap />;
}
