/** @vitest-environment jsdom */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveGlobeSkeleton } from '../../src/dashboard/components/LiveGlobe';

describe('LiveGlobeSkeleton', () => {
  it('renders the token-coloured placeholder disc used while contours load', () => {
    const { container } = render(<LiveGlobeSkeleton className="h-40 w-full" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.querySelector('circle')).toBeTruthy();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 720 500');
  });
});
