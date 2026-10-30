import { useId, useState } from 'react';
import { UiIcon } from './UiIcon';

/** Small "?" that explains a metric. Opens on hover, focus or tap; Escape closes. */
export function InfoTip({ text, label = 'Explication' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        className="ml-tip-btn"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        <UiIcon name="info" size={14} />
      </button>
      {open && (
        <span role="tooltip" id={id} className="ml-tip">
          {text}
        </span>
      )}
    </span>
  );
}
