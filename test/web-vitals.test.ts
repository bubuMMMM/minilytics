import { describe, expect, it } from 'vitest';
import { heatElementLabel, shortSelector } from '../src/shared/heatLabel';
import {
  formatVital,
  p75,
  parseHeatProps,
  parseVitalProps,
  rateVital,
} from '../src/shared/webVitals';

describe('Web Vitals thresholds', () => {
  it('rates LCP, INP and CLS on Google’s ceilings', () => {
    expect(rateVital('lcp', 2500)).toBe('good');
    expect(rateVital('lcp', 2501)).toBe('needs-improvement');
    expect(rateVital('lcp', 4000)).toBe('needs-improvement');
    expect(rateVital('lcp', 4001)).toBe('poor');
    expect(rateVital('inp', 200)).toBe('good');
    expect(rateVital('inp', 500)).toBe('needs-improvement');
    expect(rateVital('inp', 501)).toBe('poor');
    expect(rateVital('cls', 0)).toBe('good');
    expect(rateVital('cls', 0.1)).toBe('good');
    expect(rateVital('cls', 0.11)).toBe('needs-improvement');
    expect(rateVital('cls', 0.25)).toBe('needs-improvement');
    expect(rateVital('cls', 0.26)).toBe('poor');
    expect(rateVital('lcp', null)).toBeNull();
  });

  it('formats durations in French and leaves CLS unitless', () => {
    expect(formatVital('lcp', 840)).toBe('840 ms');
    expect(formatVital('lcp', 2400)).toMatch(/2,4 s/);
    expect(formatVital('cls', 0.1)).toBe('0,100');
    expect(formatVital('inp', null)).toBe('—');
  });

  it('computes a linear p75', () => {
    expect(p75([1])).toBe(1);
    expect(p75([1, 2, 3, 4])).toBe(3.25);
    expect(p75([])).toBeNull();
  });
});

describe('vital and heat parsers', () => {
  it('accepts a compact vitals payload and drops empty ones', () => {
    expect(parseVitalProps({ lcp: 1800, cls: 0, vw: 1440 })).toMatchObject({ lcp: 1800, cls: 0, vw: 1440 });
    expect(parseVitalProps({ lcp: 0 })).toBeNull();
    expect(parseVitalProps({})).toBeNull();
    expect(parseVitalProps({ cls: 0.12345 })?.cls).toBe(0.1235);
  });

  it('keeps heatmap coordinates and strips input text', () => {
    const ok = parseHeatProps('a#cta', { x: 0.25, y: 0.5, s: 'a#cta', t: 'Essayer', r: 1, vw: 1280 });
    expect(ok).toMatchObject({ x: 0.25, y: 0.5, selector: 'a#cta', text: 'Essayer', rage: true, vw: 1280 });
    const hidden = parseHeatProps('input#email', { x: 0.1, y: 0.1, s: 'form>input#email', t: 'ada@example.com' });
    expect(hidden?.text).toBeNull();
    expect(parseHeatProps('a', { x: 1.2, y: 0.2 })).toBeNull();
  });
});


describe('heatmap element labels', () => {
  it('prefers a human role and visible text over the raw selector', () => {
    const sel = 'header.sticky.top-0>div.mx-auto.flex>div.flex.items-center:nth-of-type(1)>nav.hidden.items-center>a.ml-nav-link:nth-of-type(4)';
    expect(heatElementLabel(sel, 'Tarifs')).toBe('Lien · Tarifs');
    expect(shortSelector(sel)).toBe('nav.hidden.items-center>a.ml-nav-link:nth-of-type(4)');
    expect(heatElementLabel('button#cta.btn', null)).toBe('Bouton · #cta');
    expect(heatElementLabel('div.wrapper', '')).toBe('Bloc');
  });
});
