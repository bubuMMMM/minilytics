import { useEffect, useState } from 'react';
import { api, type Site } from '../lib/api';
import { Favicon } from '../components/Icons';
import { UiIcon } from '../components/UiIcon';

export interface MilestoneItem {
  id: string;
  kind: string;
  title: string;
  number: string;
  unit: string;
  kicker: string;
  date: string;
  reachedAt: number;
  token: string;
  url: string;
  image: string;
  imageSquare: string;
  intentUrl: string;
  intentText: string;
}

function Toggle({ checked, onChange, title, desc }: { checked: boolean; onChange: (v: boolean) => void; title: string; desc: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg p-1.5">
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
        <span className="absolute inset-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
      <span className="min-w-0"><span className="block text-[13px] font-medium">{title}</span><span className="block text-[12px] text-ink-3">{desc}</span></span>
    </label>
  );
}

export function MilestoneSettings({ site }: { site: Site }) {
  const [items, setItems] = useState<MilestoneItem[] | null>(null);
  const [shareRevenue, setShareRevenue] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () =>
    api<{ items: MilestoneItem[]; shareRevenue: boolean }>(`/api/sites/${site.id}/milestones`).then((r) => {
      setItems(r.items);
      setShareRevenue(r.shareRevenue);
    }, (e) => setError((e as Error).message));

  useEffect(() => { reload(); }, [site.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRevenue = async (v: boolean) => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/sites/${site.id}/settings`, { method: 'PATCH', json: { milestones: { shareRevenue: v } } });
      setShareRevenue(v);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="jalons" className="card mt-6 min-w-0 scroll-mt-24 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Jalons partageables</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-3">
            Cartes à partager sur X quand votre site franchit un cap (visiteurs, record mensuel, meilleure journée). Minilytics ne publie jamais à votre place.
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-line p-3">
        <Toggle
          checked={shareRevenue}
          onChange={toggleRevenue}
          title="Afficher les jalons de revenus"
          desc="Désactivé par défaut. Les montants n’apparaissent sur les cartes et les liens publics que si vous l’activez."
        />
      </div>
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      <div className="mt-4 space-y-3">
        {items === null && <div className="ml-loading h-24 rounded-xl" />}
        {items?.length === 0 && (
          <div className="rounded-xl border border-dashed border-line-strong p-5 text-center">
            <p className="text-sm font-medium">Aucun jalon pour le moment</p>
            <p className="mt-1 text-[13px] text-ink-3">Les caps (100, 500, 1 000 visiteurs…) sont détectés automatiquement à partir de vos données.</p>
          </div>
        )}
        {items?.map((m) => <MilestoneRow key={m.id} item={m} domain={site.domain} disabled={busy} />)}
      </div>
    </section>
  );
}

function MilestoneRow({ item, domain, disabled }: { item: MilestoneItem; domain: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-line p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start gap-3">
        <img src={`${item.image}?theme=light`} alt="" width={160} height={90} className="hidden h-[72px] w-[128px] shrink-0 rounded-lg border border-line object-cover sm:block" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Favicon domain={domain} size={16} />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">{item.kicker}</span>
          </div>
          <p className="mt-1 text-[15px] font-semibold">{item.title}</p>
          <p className="text-[12px] text-ink-3">{item.date}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="btn-accent" href={item.intentUrl} target="_blank" rel="noopener noreferrer" aria-label="Partager sur X">
          <UiIcon name="share" size={15} /> Partager sur X
        </a>
        <a className="btn" href={`${item.image}?download=1`} download>
          <UiIcon name="download" size={15} /> Télécharger l’image
        </a>
        <button
          className="btn"
          disabled={disabled}
          onClick={() => { navigator.clipboard.writeText(item.url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        >
          <UiIcon name={copied ? 'check' : 'copy'} size={15} /><span className="hidden sm:inline">{copied ? 'Copié' : 'Copier le lien'}</span>
        </button>
        <a className="btn shrink-0" href={item.url} target="_blank" rel="noopener" aria-label="Ouvrir la page publique"><UiIcon name="external" size={15} /></a>
      </div>
    </div>
  );
}
