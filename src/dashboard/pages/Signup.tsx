import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from '../components/Link';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { Segmented } from '../components/ui';
import { UiIcon } from '../components/UiIcon';
import { PLANS } from '../../shared/plans';

type Plan = 'starter' | 'growth';
const PLAN_LABEL: Record<Plan, string> = { starter: `${PLANS.starter.name} · ${PLANS.starter.priceEur} €/mois`, growth: `${PLANS.growth.name} · ${PLANS.growth.priceEur} €/mois` };

function readPlan(): Plan {
  if (typeof window === 'undefined') return 'starter';
  const p = new URLSearchParams(window.location.search).get('plan');
  return p === 'growth' ? 'growth' : 'starter';
}

/** Where this visitor came from (UTM or referrer), so the waitlist says which channel brings sign-ups. */
function sourceHint(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return '';
  const q = new URLSearchParams(window.location.search);
  const utm = q.get('utm_source') || q.get('ref');
  if (utm) return utm.slice(0, 120);
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    if (r && r.host !== window.location.host) return r.host.replace(/^www\./, '');
  } catch {}
  return '';
}

/** /signup: self-serve accounts aren't open yet, so this collects a waitlist instead of a dead end. */
export function Signup() {
  const [plan, setPlan] = useState<Plan>('starter');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const source = useRef('');

  useEffect(() => {
    document.title = 'Liste d’attente — Minilytics';
    const next = readPlan();
    if (next !== 'starter') setPlan(next);
    source.current = sourceHint();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setState('sending');
    try {
      const res = await fetch('/api/public/waitlist', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, plan, website, company, source: source.current }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Impossible d’enregistrer votre demande. Réessayez.');
      setState('done');
      try { (window as unknown as { minilytics?: (...a: unknown[]) => void }).minilytics?.('goal', 'liste_attente', { plan }); } catch {}
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer votre demande. Réessayez.');
      emailRef.current?.focus();
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="border-b border-line bg-canvas/80 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Minilytics, accueil" className="rounded-md"><Logo /></Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Link href="/login" className="btn-ghost !text-[14px]">Se connecter</Link>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[960px] flex-1 flex-col justify-center gap-10 px-4 py-12 lg:flex-row lg:items-start lg:gap-16 lg:py-20">
        <div className="max-w-md lg:pt-4">
          <p className="ml-kicker">Liste d’attente</p>
          <h1 className="ml-title mt-3">Réservez votre accès.</h1>
          <p className="ml-lead mt-4">Les comptes ouvrent par vagues. Laissez votre e-mail : vous serez prévenu en premier. Aucune carte n’est requise.</p>
          <ul className="mt-8 space-y-2.5 text-[14px] leading-relaxed text-ink-2">
            <li className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink" aria-hidden /><span>Script d’environ 7 Ko, first-party, aucune donnée revendue.</span></li>
            <li className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink" aria-hidden /><span>Une démo publique avec les chiffres réels d’un site en production.</span></li>
            <li className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink" aria-hidden /><span>Un seul e-mail à l’ouverture. Votre adresse n’est ni partagée ni revendue.</span></li>
          </ul>
        </div>
      <main className="w-full max-w-[440px] rounded-2xl border border-line bg-surface p-6 shadow-xs sm:p-8">
        {state === 'done' ? (
          <div role="status">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-canvas text-success" aria-hidden><UiIcon name="check" size={20} /></span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">C’est noté.</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-3">
              Vous êtes sur la liste pour l’offre <span className="font-medium text-ink-2">{plan === 'growth' ? 'Growth' : 'Starter'}</span>. Vous recevrez un e-mail à <span className="break-all font-medium text-ink-2">{email.trim().toLowerCase()}</span> dès l’ouverture des comptes.
            </p>
            <Link href="/demo" className="btn-dark mt-6 w-full !h-11">Explorer la démo en attendant <UiIcon name="arrow-right" size={15} /></Link>
          </div>
        ) : (
          <>
            <p className="text-[13px] font-medium text-ink-3">Ouverture progressive</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Laissez votre e-mail</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-3">Choisissez une offre pour que l’on sache quelle place vous réserver. Vous ne payez rien aujourd’hui.</p>

            <form className="mt-6 space-y-4" onSubmit={submit} noValidate={false}>
              <div>
                <span className="label" id="plan-label">Offre</span>
                <Segmented<Plan> label="Offre" value={plan} onChange={setPlan} options={(['starter', 'growth'] as Plan[]).map((v) => ({ value: v, label: PLAN_LABEL[v] }))} />
              </div>
              <div>
                <label className="label" htmlFor="wl-email">E-mail</label>
                <input ref={emailRef} id="wl-email" className="input" type="email" inputMode="email" autoComplete="email" required maxLength={254} placeholder="vous@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error || undefined} aria-describedby={error ? 'wl-error' : undefined} autoFocus />
              </div>
              <div>
                <label className="label" htmlFor="wl-site">Votre site <span className="font-normal text-ink-4">(facultatif)</span></label>
                <input id="wl-site" className="input" type="text" inputMode="url" autoComplete="url" maxLength={253} placeholder="monsite.fr" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
              {/* Honeypot: hidden from people and assistive tech, filled only by bots. */}
              <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden>
                <label htmlFor="wl-company">Société</label>
                <input id="wl-company" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              {error && <p id="wl-error" role="alert" className="text-[13px] text-danger">{error}</p>}
              <button type="submit" className="btn-dark w-full !h-11" disabled={state === 'sending'} aria-busy={state === 'sending'}>
                {state === 'sending' ? 'Envoi…' : 'Réserver mon accès'}
              </button>
              <p className="text-center text-[12px] leading-relaxed text-ink-4">Un seul e-mail à l’ouverture. Votre adresse n’est ni partagée ni revendue.</p>
            </form>

            <div className="mt-6 flex flex-col gap-2 border-t border-line pt-5 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href="/demo" className="inline-flex min-h-[40px] items-center gap-1 font-medium text-ink hover:underline">Voir la démo en direct <UiIcon name="arrow-right" size={14} /></Link>
              <Link href="/login" className="inline-flex min-h-[40px] items-center hover:text-ink">Déjà un accès ? Se connecter</Link>
            </div>
          </>
        )}
      </main>
      </div>
    </div>
  );
}
