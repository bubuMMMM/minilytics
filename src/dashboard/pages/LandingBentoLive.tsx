import { useEffect, useMemo, useState } from 'react';
import { LiveGlobePreview } from '../components/LiveGlobe';
import { VisitorCard } from '../components/VisitorCard';
import { EXAMPLE_TZ, exampleActivity, exampleVisits } from './landingLiveExample';

/** Compact dashboard globe + visitor card for the features bento « En direct » tab. */
export default function LandingBentoLive({ rich = false }: { rich?: boolean }) {
  const visits = useMemo(() => exampleVisits(), []);
  const activity = useMemo(() => exampleActivity(), []);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!rich || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setIdx((n) => (n + 1) % visits.length), 2800);
    return () => clearInterval(t);
  }, [rich, visits.length]);

  const visit = visits[idx];
  return (
    <LiveGlobePreview
      example={activity}
      aside={rich ? (
        <div key={visit.id} className="ml-globe-visit-swap pointer-events-none drop-shadow-sm">
          <VisitorCard visit={visit} tz={EXAMPLE_TZ} compact />
        </div>
      ) : undefined}
    />
  );
}
