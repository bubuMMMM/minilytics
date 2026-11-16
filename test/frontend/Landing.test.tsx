/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
  onchange: null,
}));


class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
vi.stubGlobal('IntersectionObserver', IO);
vi.stubGlobal('ResizeObserver', IO);

import { Landing } from '../../src/dashboard/pages/Landing';
import { PLANS } from '../../src/shared/plans';
import { eventsPerMonthLabel } from '../../src/dashboard/lib/planLabels';

describe('Landing', () => {
  it('renders the hero heading and primary actions', () => {
    render(<Landing />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Votre site vit/i);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Regardez/i);
    expect(screen.getAllByText('Réserver mon accès').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Voir la démo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(eventsPerMonthLabel(PLANS.starter.eventsPerMonth)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(eventsPerMonthLabel(PLANS.growth.eventsPerMonth)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Que se passe-t-il si je dépasse mon quota/)).toBeTruthy();
  });
});
