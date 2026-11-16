/** Tables that store per-site rows and must be removed with the site (same transaction). */
export const SITE_DATA_TABLES = [
  'events',
  'sessions',
  'visitors',
  'payments',
  'funnels',
  'segments',
  'notes',
  'bot_hits',
  'imports',
  'imported_stats',
  'share_links',
  'widget_tokens',
  'widget_boards',
  'notifications',
  'github_commits',
  'reddit_mentions',
  'payment_claims',
  'videos',
  'x_posts',
  'x_sync',
] as const;

export function deleteSiteStatements(db: D1Database, id: string) {
  return SITE_DATA_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE site_id = ?`).bind(id)).concat(
    db.prepare('DELETE FROM sites WHERE id = ?').bind(id),
  );
}
