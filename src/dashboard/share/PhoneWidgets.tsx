import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodeBlock } from '../components/ui';
import { UiIcon } from '../components/UiIcon';
import { api, type Site } from '../lib/api';

type WType = 'live' | 'counter' | 'chart' | 'pages' | 'map';
type WStyle = 'classic' | 'minimal' | 'editorial' | 'glass' | 'gradient' | 'compact';
type Theme = 'auto' | 'light' | 'dark';

interface Item {
  type: WType;
  style: WStyle;
  theme: Theme;
  accent: string;
  size: 'sm' | 'md' | 'lg';
  period: string;
  locale: 'fr' | 'en';
  logo: boolean;
}

interface Board {
  id: string;
  token: string;
  name: string;
  items: Item[];
  theme: Theme;
  createdAt: number;
  updatedAt: number;
  url: string;
}

const TYPES: { key: WType; label: string; hint: string }[] = [
  { key: 'live', label: 'En ligne', hint: 'Personnes connectées maintenant' },
  { key: 'counter', label: 'Compteur', hint: 'Visiteurs sur la période' },
  { key: 'chart', label: 'Graphique', hint: 'Courbe des visiteurs' },
  { key: 'pages', label: 'Top pages', hint: '5 pages les plus vues' },
  { key: 'map', label: 'Carte', hint: 'Pays touchés' },
];
const STYLES: { key: WStyle; label: string }[] = [
  { key: 'classic', label: 'Classique' }, { key: 'minimal', label: 'Minimal' },
  { key: 'editorial', label: 'Éditorial' }, { key: 'glass', label: 'Verre' },
  { key: 'gradient', label: 'Dégradé' }, { key: 'compact', label: 'Compact' },
];
const PERIODS = [
  { value: 'today', label: 'Aujourd’hui' }, { value: '24h', label: '24 h' }, { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' }, { value: '90d', label: '90 jours' }, { value: '12m', label: '12 mois' }, { value: 'all', label: 'Depuis le début' },
];
const ACCENTS = ['2563eb', '16a34a', '7c3aed', 'db2777', 'ea580c', '0a0a0a'];
const SIZES: { key: 'small' | 'medium' | 'large' | 'wallpaper'; label: string; hint: string }[] = [
  { key: 'small', label: 'Petit', hint: '474 × 474, coin de l’écran' },
  { key: 'medium', label: 'Moyen', hint: '1014 × 474, bandeau' },
  { key: 'large', label: 'Grand', hint: '1014 × 1062, grand carré' },
  { key: 'wallpaper', label: 'Fond d’écran', hint: '1170 × 2532, écran verrouillé' },
];

const TYPE_LABEL: Record<WType, string> = Object.fromEntries(TYPES.map((t) => [t.key, t.label])) as Record<WType, string>;

function detectPlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

const defaultItem = (type: WType, shared: Pick<Item, 'style' | 'theme' | 'accent' | 'period'>): Item => ({
  type, style: shared.style, theme: shared.theme, accent: shared.accent, size: 'md', period: shared.period, locale: 'fr', logo: true,
});

export function PhoneWidgets({ site }: { site: Site }) {
  const [boards, setBoards] = useState<Board[] | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(site.name || site.domain);
  const [types, setTypes] = useState<WType[]>(['live', 'counter']);
  const [style, setStyle] = useState<WStyle>('classic');
  const [theme, setTheme] = useState<Theme>('auto');
  const [accent, setAccent] = useState('2563eb');
  const [period, setPeriod] = useState('30d');
  const [created, setCreated] = useState<Board | null>(null);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const [embedToken, setEmbedToken] = useState<string | null>(null);

  useEffect(() => { setPlatform(detectPlatform()); }, []);
  useEffect(() => {
    api<Board[]>(`/api/sites/${site.id}/phone-boards`).then(setBoards, (e) => { setError((e as Error).message); setBoards([]); });
    api<{ token: string | null }>(`/api/sites/${site.id}/widgets`).then((r) => setEmbedToken(r.token), () => setEmbedToken(null));
  }, [site.id]);

  const items: Item[] = useMemo(
    () => types.map((t) => defaultItem(t, { style, theme, accent, period })),
    [types, style, theme, accent, period],
  );

  function toggleType(t: WType) {
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= 6 ? cur : [...cur, t]));
  }

  async function createBoard() {
    if (!items.length) { setError('Choisissez au moins un widget.'); return; }
    setBusy(true); setError('');
    try {
      const b = await api<Board>(`/api/sites/${site.id}/phone-boards`, { method: 'POST', json: { name, items, theme } });
      setCreated(b);
      setBoards((list) => [b, ...(list ?? []).filter((x) => x.id !== b.id)]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function revoke(b: Board) {
    if (!confirm(`Révoquer « ${b.name} » ? Les raccourcis, images et scripts qui l’utilisent cesseront immédiatement de recevoir des données.`)) return;
    setBusy(true); setError('');
    try {
      await api(`/api/sites/${site.id}/phone-boards/${b.id}`, { method: 'DELETE' });
      setBoards((list) => (list ?? []).filter((x) => x.id !== b.id));
      if (created?.id === b.id) setCreated(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const focus = created;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="grid min-w-0 gap-4">
      <section className="card min-w-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">Widgets sur mon téléphone</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-3">Choisissez un ou plusieurs widgets, puis ajoutez-les à l’écran d’accueil, téléchargez-les en image, ou installez un vrai widget natif. Chaque sélection a son propre lien, révocable à tout moment. Aucun mot de passe n’est partagé : seulement des chiffres agrégés.</p>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-5">
          <label className="label" htmlFor="phone-board-name">Nom de l’écran</label>
          <input id="phone-board-name" className="input max-w-md" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>

        <fieldset className="mt-5 min-w-0">
          <legend className="label">Widgets à afficher</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {TYPES.map((t) => {
              const on = types.includes(t.key);
              return (
                <button key={t.key} type="button" aria-pressed={on} onClick={() => toggleType(t.key)}
                  className={`min-h-[64px] rounded-lg border p-2.5 text-left transition-colors ${on ? 'border-accent bg-accent/5' : 'border-line hover:border-line-strong'}`}>
                  <span className="block text-[13px] font-medium">{t.label}</span>
                  <span className="block text-[11px] text-ink-3">{t.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <fieldset className="min-w-0">
            <legend className="label">Style</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STYLES.map((st) => (
                <button key={st.key} type="button" aria-pressed={style === st.key} onClick={() => setStyle(st.key)}
                  className={`min-h-[40px] rounded-lg border px-2.5 text-[13px] ${style === st.key ? 'border-accent bg-accent/5 font-medium' : 'border-line hover:border-line-strong'}`}>{st.label}</button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3">
            <Field label="Thème">
              <Seg value={theme} onChange={(v) => setTheme(v as Theme)} options={[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']]} />
            </Field>
            <Field label="Période">
              <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
                {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Couleur">
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((c) => (
                  <button key={c} type="button" aria-label={`Couleur ${c}`} aria-pressed={accent === c} onClick={() => setAccent(c)}
                    className={`h-8 w-8 rounded-full border ${accent === c ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'border-line'}`}
                    style={{ background: '#' + c }} />
                ))}
              </div>
            </Field>
          </div>
        </div>

        <Preview items={items} embedToken={embedToken} site={site} />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn-dark" disabled={busy || !types.length} onClick={createBoard}>
            {busy ? 'Création…' : types.length > 1 ? 'Créer mon écran' : 'Créer le widget'}
          </button>
          <p className="text-[12px] text-ink-3">Un lien unique est créé. Vous pourrez le révoquer plus bas à tout moment.</p>
        </div>
      </section>

      {focus && <InstallCard board={focus} site={site} origin={origin} platform={platform} onRevoke={() => revoke(focus)} busy={busy} />}

      <section className="card min-w-0 p-4 sm:p-6">
        <h3 className="text-[15px] font-semibold">Mes écrans</h3>
        {boards === undefined && <div className="ml-loading mt-4 h-20 rounded-xl" />}
        {boards && boards.length === 0 && <p className="mt-3 text-sm text-ink-3">Aucun écran pour l’instant. Créez-en un ci-dessus.</p>}
        {boards && boards.length > 0 && (
          <ul className="mt-3 divide-y divide-line">
            {boards.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{b.name}</div>
                  <div className="truncate text-[12px] text-ink-3">{b.items.map((i) => TYPE_LABEL[i.type] ?? i.type).join(' · ')}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button className="btn-ghost text-[12px]" type="button" onClick={() => setCreated(b)}>Instructions</button>
                  <a className="btn-ghost text-[12px]" href={b.url} target="_blank" rel="noopener">Ouvrir</a>
                  <button className="btn-ghost text-[12px] text-danger" type="button" disabled={busy} onClick={() => revoke(b)}>Révoquer</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Preview({ items, embedToken, site }: { items: Item[]; embedToken: string | null; site: Site }) {
  if (!items.length) return <p className="mt-5 text-sm text-ink-3">Sélectionnez au moins un widget pour voir l’aperçu.</p>;
  return (
    <div className="mt-5">
      <div className="label">Aperçu</div>
      <div className="mx-auto w-full max-w-[390px] rounded-[28px] border border-line bg-well p-3 shadow-xs">
        <div className="mb-2 text-center text-[11px] text-ink-3">{site.domain}</div>
        <div className="flex flex-col gap-2">
          {items.map((it, i) => (
            <div key={it.type + i} className="overflow-hidden rounded-2xl border border-line bg-surface">
              {embedToken && it.type !== undefined
                ? <iframe title={TYPE_LABEL[it.type]} src={`/api/widget/${embedToken}/embed?type=${it.type}&style=${it.style}&theme=${it.theme}&accent=${it.accent}&period=${it.period}&locale=${it.locale}`} className="block w-full border-0" style={{ height: it.type === 'live' ? 52 : it.type === 'counter' ? 150 : 220 }} />
                : <div className="px-4 py-5"><div className="text-[11px] uppercase tracking-wide text-ink-3">{TYPE_LABEL[it.type]}</div><div className="mt-1 text-lg font-semibold">Aperçu après création</div></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InstallCard({ board, site, origin, platform, onRevoke, busy }: { board: Board; site: Site; origin: string; platform: 'ios' | 'android' | 'other'; onRevoke: () => void; busy: boolean }) {
  const url = board.url.startsWith('http') ? board.url : origin + '/w/' + board.token;
  const png = (size: string, i?: number) => `${origin}/api/w/${board.token}/png?size=${size}${i != null ? `&i=${i}` : ''}`;
  const zip = `${origin}/api/w/${board.token}/zip`;
  const scriptUrl = `${origin}/api/w/${board.token}/scriptable.js`;
  const [script, setScript] = useState('');
  useEffect(() => { fetch(scriptUrl).then((r) => r.ok ? r.text() : '').then(setScript, () => setScript('')); }, [scriptUrl]);

  const iosSteps = (
    <Ol>
      <li>Ouvrez ce lien dans <b>Safari</b> (pas dans un autre navigateur).</li>
      <li>Appuyez sur le bouton <b>Partager</b>, puis <b>Sur l’écran d’accueil</b>.</li>
      <li>Validez : l’écran de widgets s’ouvre en plein écran, mis à jour toutes les 30 secondes.</li>
    </Ol>
  );
  const androidSteps = (
    <Ol>
      <li>Ouvrez ce lien dans <b>Chrome</b>.</li>
      <li>Appuyez sur le menu <b>⋮</b>, puis <b>Ajouter à l’écran d’accueil</b> ou <b>Installer l’application</b>.</li>
      <li>L’icône ouvre vos widgets en plein écran, actualisés toutes les 30 secondes.</li>
    </Ol>
  );

  return (
    <section className="card min-w-0 scroll-mt-24 p-4 sm:p-6" id="phone-install">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">{board.name}</h3>
          <p className="mt-1 text-sm text-ink-3">{board.items.map((i) => TYPE_LABEL[i.type] ?? i.type).join(' · ')} — jeton lecture seule, révocable.</p>
        </div>
        <button className="btn-ghost text-[12px] text-danger" type="button" disabled={busy} onClick={onRevoke}>Révoquer</button>
      </div>

      <div className="mt-4">
        <div className="label">Lien à ouvrir sur le téléphone</div>
        <CodeBlock code={url} wrap />
        <p className="mt-2"><a className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline" href={url} target="_blank" rel="noopener"><UiIcon name="external" size={14} /> Ouvrir l’écran</a></p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-line p-4">
          <h4 className="flex items-center gap-2 text-[13px] font-semibold"><UiIcon name="smartphone" size={16} /> Ajouter à l’écran d’accueil</h4>
          {platform === 'ios' && iosSteps}
          {platform === 'android' && androidSteps}
          {platform === 'other' && (
            <>
              <p className="mt-2 text-[13px] text-ink-3">Ouvrez le lien sur votre téléphone, puis :</p>
              <p className="mt-3 text-[12px] font-medium">iPhone</p>
              {iosSteps}
              <p className="mt-3 text-[12px] font-medium">Android</p>
              {androidSteps}
            </>
          )}
        </div>
        <div className="min-w-0 rounded-xl border border-line p-4">
          <h4 className="flex items-center gap-2 text-[13px] font-semibold"><UiIcon name="download" size={16} /> Télécharger en image</h4>
          <p className="mt-2 text-[13px] text-ink-3">PNG généré avec vos vraies données, prêt pour un fond d’écran ou une appli « Photo Widget ».</p>
          <ul className="mt-3 grid gap-2">
            {SIZES.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px]"><span className="font-medium">{s.label}</span> <span className="text-ink-3">· {s.hint}</span></span>
                <a className="btn-ghost text-[12px]" href={png(s.key)} download={`minilytics-${site.domain}-${s.key}.png`}>Télécharger</a>
              </li>
            ))}
            {board.items.length > 1 && (
              <li className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px]"><span className="font-medium">Pile</span> <span className="text-ink-3">· tous les widgets l’un sous l’autre</span></span>
                <a className="btn-ghost text-[12px]" href={png('stack')} download={`minilytics-${site.domain}-stack.png`}>Télécharger</a>
              </li>
            )}
          </ul>
          <p className="mt-3"><a className="btn-dark inline-flex text-[13px]" href={zip} download={`minilytics-${site.domain}-widgets.zip`}>Tout télécharger (ZIP)</a></p>
          {board.items.length > 1 && (
            <div className="mt-3">
              <p className="text-[12px] text-ink-3">Un widget à la fois (format moyen) :</p>
              <ul className="mt-1 flex flex-col gap-1">
                {board.items.map((it, i) => (
                  <li key={i}><a className="text-[13px] text-accent hover:underline" href={png('medium', i)} download={`${it.type}-medium.png`}>{TYPE_LABEL[it.type]} — PNG</a></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-line p-4">
          <h4 className="text-[13px] font-semibold">Widget natif iPhone (Scriptable)</h4>
          <Ol>
            <li>Installez l’app gratuite <b>Scriptable</b> depuis l’App Store.</li>
            <li>Créez un nouveau script, collez le code ci-dessous, enregistrez-le (par ex. « Minilytics »).</li>
            <li>Sur l’écran d’accueil : appui long → <b>Modifier l’écran d’accueil</b> → bouton + → <b>Scriptable</b> → choisissez la taille → le script « Minilytics ».</li>
          </Ol>
          {script ? <div className="mt-3"><CodeBlock code={script} /></div> : <p className="mt-3 text-[13px] text-ink-3">Chargement du script…</p>}
          <p className="mt-2 text-[12px] text-ink-3">Le script interroge uniquement ce jeton lecture seule. Il ne contient jamais votre mot de passe.</p>
        </div>
        <div className="min-w-0 rounded-xl border border-line p-4">
          <h4 className="text-[13px] font-semibold">Widget natif Android (Photo Widget ou KWGT)</h4>
          <Ol>
            <li>Ajoutez d’abord l’écran à l’accueil via Chrome (colonne de gauche) — c’est l’option la plus simple.</li>
            <li>Pour un vrai widget d’image : installez <b>Photo Widget</b> (ou KWGT), créez un widget, et utilisez l’URL du PNG moyen ou du fond d’écran. Beaucoup d’applis peuvent actualiser l’image périodiquement.</li>
          </Ol>
          <div className="mt-3">
            <div className="label">URL de l’image (format moyen)</div>
            <CodeBlock code={png('medium')} wrap />
          </div>
          <div className="mt-3">
            <div className="label">URL du fond d’écran</div>
            <CodeBlock code={png('wallpaper')} wrap />
          </div>
        </div>
      </div>
    </section>
  );
}

function Ol({ children }: { children: ReactNode }) {
  return <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] text-ink-3 marker:text-ink-3">{children}</ol>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><div className="label">{label}</div>{children}</div>;
}
function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[][] }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-well p-0.5" role="radiogroup">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={`whitespace-nowrap rounded-md px-3 min-h-[34px] text-[13px] ${value === k ? 'bg-surface font-medium text-ink shadow-xs' : 'text-ink-3 hover:text-ink'}`}>{l}</button>
      ))}
    </div>
  );
}
