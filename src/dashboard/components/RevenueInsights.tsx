import { useState } from 'react';
import { qs } from '../lib/api';
import { useDash } from '../lib/context';
import { useApi } from '../lib/useApi';

interface Summary { gross: number; newRevenue: number; renewals: number; refunds: number; net: number; payments: number; refundCount: number; customers: number; convertedPayments: number; unconverted: { currency: string; payments: number }[]; providers: { provider: string; revenue: number; payments: number }[]; fxSource: string }
interface Prediction {
  ready: boolean;
  reason?: string;
  factors: { label: string; value: string; lift: number }[];
  visitors: { visitorId: string; name: string | null; probability: number; expectedValue: number; why: { label: string; value: string; lift: number }[] }[];
  pipeline?: number;
  forecast: { monthToDate: number; projectedMonth: number; dailyRunRate: number; daysLeft: number; method: string };
}
const PROVIDER: Record<string, string> = { dodo: 'Dodo', stripe: 'Stripe', lemonsqueezy: 'Lemon Squeezy', polar: 'Polar', paddle: 'Paddle', shopify: 'Shopify', woocommerce: 'WooCommerce', kajabi: 'Kajabi', podia: 'Podia', api: 'API' };

/** Revenue breakdown (new / renewals / refunds) and an explainable estimate. Hidden until the site has a payment. */
export function RevenueInsights() {
  const { site, q, reloadKey, money, openVisitor } = useDash();
  const { data: s } = useApi<Summary>(`/api/sites/${site.id}/revenue/summary?${qs(q)}`, reloadKey);
  const { data: p } = useApi<Prediction>(`/api/sites/${site.id}/revenue/predictions`, reloadKey);
  const [open, setOpen] = useState(false);
  if (!s || (!s.payments && !s.refundCount && !p?.forecast.monthToDate)) return null;
  const kpis: [string, number, string?][] = [['Net', s.net], ['Nouveaux', s.newRevenue], ['Renouvellements', s.renewals], ['Remboursements', -s.refunds, 'text-danger']];
  return (
    <section className="card mt-5 min-w-0 p-4 sm:p-6" aria-labelledby="rev-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rev-title" className="text-[15px] font-semibold">Revenus</h2>
        <span className="text-[12px] text-ink-3">{s.payments} paiement{s.payments > 1 ? 's' : ''} · {s.customers} client{s.customers > 1 ? 's' : ''}{s.providers.length > 0 && ` · ${s.providers.map((x) => PROVIDER[x.provider] ?? x.provider).join(', ')}`}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map(([l, v, cls]) => (
          <div key={l} className="min-w-0 rounded-lg border border-line px-3 py-2.5"><dt className="text-[12px] text-ink-3">{l}</dt><dd className={`tnum mt-0.5 text-[17px] font-semibold ${cls ?? ''}`}>{money(v)}</dd></div>
        ))}
      </dl>
      {(s.convertedPayments > 0 || s.unconverted.length > 0) && (
        <p className="mt-2 text-[11px] text-ink-4">{s.convertedPayments > 0 && `${s.convertedPayments} paiement(s) converti(s) en ${site.currency} (${s.fxSource}). `}{s.unconverted.length > 0 && `Non convertis : ${s.unconverted.map((u) => `${u.payments} en ${u.currency}`).join(', ')}.`}</p>
      )}
      {p && (
        <div className="mt-4 rounded-xl border border-dashed border-line-strong p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-3">Estimation</span>
            <span className="text-sm">Ce mois-ci : <b className="tnum">{money(p.forecast.monthToDate)}</b> · projection fin de mois <b className="tnum">{money(p.forecast.projectedMonth)}</b></span>
          </div>
          <p className="mt-1 text-[11px] text-ink-4">{p.forecast.method}.</p>
          {!p.ready ? <p className="mt-2 text-[12px] text-ink-3">Prédiction par visiteur indisponible : {p.reason}</p> : (
            <>
              <p className="mt-2 text-sm">Potentiel des visiteurs des 7 derniers jours qui n’ont pas encore acheté : <b className="tnum">{money(p.pipeline ?? 0)}</b></p>
              <button className="btn mt-2 !h-9" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Masquer le détail' : 'Pourquoi ? Voir le détail'}</button>
              {open && (
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  <div className="min-w-0">
                    <div className="mb-1 text-[12px] font-medium text-ink-3">Facteurs (taux de conversion vs moyenne)</div>
                    <ul className="space-y-1 text-[13px]">{p.factors.map((f) => <li key={f.label + f.value} className="flex justify-between gap-2"><span className="truncate">{f.label} : {f.value}</span><span className={`tnum ${f.lift >= 1 ? 'text-success' : 'text-danger'}`}>×{f.lift.toFixed(2)}</span></li>)}</ul>
                  </div>
                  <div className="min-w-0">
                    <div className="mb-1 text-[12px] font-medium text-ink-3">Visiteurs les plus susceptibles d’acheter</div>
                    <ul className="space-y-1 text-[13px]">{p.visitors.slice(0, 8).map((v) => (
                      <li key={v.visitorId}><button className="flex w-full min-h-[36px] items-center justify-between gap-2 text-left hover:underline" onClick={() => openVisitor(v.visitorId)}><span className="truncate">{v.name ?? v.visitorId.slice(0, 10)} <span className="text-ink-4">{v.why.slice(0, 2).map((w) => w.value).join(' · ')}</span></span><span className="tnum shrink-0">{Math.round(v.probability * 100)} % · {money(v.expectedValue)}</span></button></li>
                    ))}</ul>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
