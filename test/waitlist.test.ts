import { describe, expect, it } from 'vitest';
import { parseWaitlist, waitlistCsv } from '../src/worker/waitlist';

describe('parseWaitlist', () => {
  it('normalises e-mail, plan and website', () => {
    expect(parseWaitlist({ email: '  Jean@Exemple.FR ', plan: 'growth', website: 'https://www.MonSite.fr/blog?x=1' })).toEqual({
      email: 'jean@exemple.fr', plan: 'growth', website: 'monsite.fr', source: null, bot: false,
    });
  });
  it('defaults an unknown plan to starter', () => {
    const r = parseWaitlist({ email: 'a@b.co', plan: 'enterprise' });
    expect('error' in r ? null : r.plan).toBe('starter');
  });
  it('rejects bad e-mails and bad domains', () => {
    expect(parseWaitlist({ email: 'pas-un-email' })).toHaveProperty('error');
    expect(parseWaitlist({})).toHaveProperty('error');
    expect(parseWaitlist({ email: 'a@b.co', website: 'pas un site' })).toHaveProperty('error');
  });
  it('flags the honeypot', () => {
    const r = parseWaitlist({ email: 'a@b.co', company: 'ACME' });
    expect('error' in r ? null : r.bot).toBe(true);
  });
});

describe('waitlistCsv', () => {
  it('quotes cells and neutralises formulas', () => {
    const csv = waitlistCsv([{ id: '1', email: 'a@b.co', plan: 'starter', website: '=cmd()', source: 'x "y"', created_at: 0 }]);
    expect(csv).toBe('email,offre,site,source,inscrit_le\n"a@b.co","starter","\'=cmd()","x ""y""","1970-01-01T00:00:00.000Z"\n');
  });
});
