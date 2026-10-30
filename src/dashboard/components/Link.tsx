import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from '../App';

/** A real <a href> (Cmd/Ctrl/middle-click open a new tab) with client-side navigation for plain clicks. */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
    if (!href.startsWith('/')) return;
    e.preventDefault();
    navigate(href);
    window.scrollTo({ top: 0 });
  }
  return <a href={href} onClick={handle} {...rest} />;
}
