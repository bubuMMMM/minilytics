import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Modal({
  open,
  onClose,
  children,
  width = 'max-w-2xl',
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  title?: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length > 0);
    if (!dialog.current?.contains(document.activeElement)) (focusable()[0] ?? dialog.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { e.preventDefault(); dialog.current?.focus(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-stone-900/30 backdrop-blur-[2px] sm:items-start sm:p-10" onMouseDown={onClose}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : "Détails"} tabIndex={-1} className={`card w-full ${width} max-h-[92dvh] overflow-y-auto rounded-b-none p-0 pb-[env(safe-area-inset-bottom)] sm:max-h-none sm:overflow-visible sm:rounded-b-2xl sm:pb-0`} onMouseDown={(e) => e.stopPropagation()}>
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-100 bg-white px-4 py-3 dark:bg-stone-900 sm:static sm:px-6 sm:py-4">
            <div id={titleId} className="min-w-0 truncate text-base font-semibold sm:text-lg">{title}</div>
            <button className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 sm:h-8 sm:w-8" onClick={onClose} aria-label="Fermer">
              ✕
            </button>
          </div>
        )}
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
