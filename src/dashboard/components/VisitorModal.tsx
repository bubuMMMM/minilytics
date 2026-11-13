import { useDash } from '../lib/context';
import { Modal } from './Modal';
import { VisitorProfile } from './VisitorProfile';

export function VisitorModal({ visitorId, onClose }: { visitorId: string | null; onClose: () => void }) {
  const { site, money } = useDash();
  return (
    <Modal open={!!visitorId} onClose={onClose} width="max-w-3xl" title="Profil du visiteur">
      {visitorId && <VisitorProfile visitorId={visitorId} siteId={site.id} tz={site.timezone} money={money} />}
    </Modal>
  );
}
