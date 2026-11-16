/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VisitorCard } from '../../src/dashboard/components/VisitorCard';
import type { Visit } from '../../src/dashboard/map/Replay';

const visit: Visit = {
  id: 's1',
  t: Date.now() - 30_000,
  lastSeen: Date.now() - 1_000,
  visitorId: 'vid-test-abc',
  country: 'FR',
  region: 'IDF',
  city: 'Paris',
  lat: 48.85,
  lon: 2.35,
  source: 'Google',
  channel: 'organic',
  referrer: 'https://www.google.com/',
  page: '/',
  current: '/prix',
  device: 'Desktop',
  browser: 'Chrome',
  os: 'macOS',
  pageviews: 3,
  duration: 30_000,
};

describe('VisitorCard', () => {
  it('shows place, current page and source, without inventing a real name', () => {
    render(<VisitorCard visit={visit} tz="Europe/Paris" now={Date.now()} />);
    expect(screen.getByText(/Paris/)).toBeTruthy();
    expect(screen.getByText(/France/)).toBeTruthy();
    expect(screen.getByText('/prix')).toBeTruthy();
    expect(screen.getByText('Google')).toBeTruthy();
  });
});
