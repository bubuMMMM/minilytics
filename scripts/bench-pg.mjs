// Benchmark: seeds 200k sessions / 1M events in PGlite, times dashboard queries before/after 0006 indexes. `node scripts/bench-pg.mjs`
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const dir = new URL('../migrations-pg', import.meta.url).pathname;
const pg = new PGlite();
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql') && !f.startsWith('0006')).sort()) await pg.exec(readFileSync(`${dir}/${f}`, 'utf8'));
const now = Date.now(), DAY = 86400000;
console.time('seed');
await pg.exec(`
INSERT INTO sites (id,name,domain,timezone,currency,api_key,created_at) SELECT 's'||i,'s','s'||i||'.com','UTC','EUR','k'||i,0 FROM generate_series(1,3) i;
INSERT INTO sessions (site_id,id,visitor_id,started_at,last_seen_at,pageviews,source,channel,country,device,browser,os,entry_page,exit_page)
SELECT 's'||(1+i%3),'sess'||i,'v'||(i/3),${now}-(random()*60*${DAY})::bigint AS st, 0, 1+(i%5),
 (ARRAY['Google','X','Direct/None','Reddit'])[1+i%4],(ARRAY['Organic Search','Organic Social','Direct'])[1+i%3],(ARRAY['FR','US','DE'])[1+i%3],'Desktop','Chrome','Mac','/','/' FROM generate_series(1,200000) i;
UPDATE sessions SET last_seen_at = started_at + (random()*600000)::bigint;
INSERT INTO events (site_id,session_id,visitor_id,ts,type,name,path,video_id,value)
SELECT s.site_id,s.id,s.visitor_id,s.started_at+g*1000,(ARRAY['pageview','pageview','scroll','engagement','video','click'])[1+(g%6)],
 CASE WHEN g%6=4 THEN 'watch' ELSE '50' END,'/p'||(g%40), CASE WHEN g%6=4 THEN 'vid'||(g%30) END, 10
FROM sessions s, generate_series(1,5) g;
INSERT INTO payments (id,site_id,provider,ts,amount,currency,visitor_id) SELECT 'p'||i,'s1','api',${now}-i*1000,1000,'EUR','v'||(i*7) FROM generate_series(1,5000) i;
INSERT INTO login_failures SELECT '1.1.1.'||(i%200), ${now}-(i*100) FROM generate_series(1,2000) i;
ANALYZE;`);
console.timeEnd('seed');
const Q = {
  realtime_sources: [`SELECT source, COUNT(DISTINCT visitor_id) FROM sessions WHERE site_id = $1 AND last_seen_at > $2 GROUP BY source`, ['s1', now - 30 * 60000]],
  online: [`SELECT COUNT(DISTINCT visitor_id) FROM sessions WHERE site_id = $1 AND started_at > $2 AND last_seen_at > $3`, ['s1', now - 6 * 3600000, now - 300000]],
  sparklines: [`SELECT site_id, started_at / ${DAY} AS d, COUNT(DISTINCT visitor_id) FROM sessions WHERE started_at >= $1 GROUP BY site_id, started_at / ${DAY}`, [now - 14 * DAY]],
  visitor_profile_events: [`SELECT session_id, ts, type, name, path, props FROM events WHERE site_id = $1 AND visitor_id = $2 ORDER BY ts DESC LIMIT 1000`, ['s1', 'v3000']],
  visitors_list: [`SELECT t.*, (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.site_id=t.site_id AND p.visitor_id=t.visitor_id) AS spent FROM (SELECT s.site_id, s.visitor_id, MAX(s.last_seen_at) AS last_seen FROM sessions s WHERE s.site_id=$1 AND s.started_at >= $2 AND s.started_at < $3 GROUP BY s.site_id, s.visitor_id ORDER BY last_seen DESC LIMIT 200) t`, ['s1', now - 7 * DAY, now]],
  login_global: [`SELECT COUNT(CASE WHEN ip = $1 THEN 1 END), COUNT(*) FROM login_failures WHERE ts > $2`, ['1.1.1.1', now - 15 * 60000]],
  overview_kpi: [`SELECT COUNT(DISTINCT s.visitor_id), COUNT(*), SUM(s.pageviews) FROM sessions s WHERE s.site_id=$1 AND s.started_at >= $2 AND s.started_at < $3`, ['s1', now - 7 * DAY, now]],
  pages: [`SELECT e.path, COUNT(DISTINCT e.visitor_id), COUNT(*) FROM events e WHERE e.site_id=$1 AND e.type='pageview' AND e.ts >= $2 AND e.ts < $3 GROUP BY 1 ORDER BY 2 DESC LIMIT 100`, ['s1', now - 7 * DAY, now]],
  videos: [`SELECT e.video_id, SUM(CASE WHEN e.name='watch' THEN e.value ELSE 0 END) FROM events e WHERE e.site_id=$1 AND e.type='video' AND e.ts >= $2 AND e.ts < $3 GROUP BY 1`, ['s1', now - 7 * DAY, now]],
};
async function run(label) {
  const out = {};
  for (const [k, [sql, p]] of Object.entries(Q)) {
    await pg.query(sql, p);
    const t = [];
    for (let i = 0; i < 5; i++) { const s = performance.now(); await pg.query(sql, p); t.push(performance.now() - s); }
    t.sort((a, b) => a - b);
    const plan = (await pg.query('EXPLAIN ' + sql, p)).rows.map((r) => r['QUERY PLAN']).join(' | ');
    out[k] = { ms: +t[2].toFixed(1), scan: (plan.match(/(Seq Scan|Index Only Scan|Index Scan|Bitmap Index Scan) (using \w+ )?on \w+/g) || []).join(', ') };
  }
  console.log(label, JSON.stringify(out, null, 1));
  return out;
}
const before = await run('BEFORE');
const ins = async () => { const s = performance.now(); for (let i = 0; i < 2000; i++) await pg.query(`INSERT INTO events (site_id,session_id,visitor_id,ts,type,name,path) VALUES ('s1','x','v1',$1,'pageview',null,'/')`, [now + i]); return performance.now() - s; };
const insBefore = await ins();
await pg.exec(readFileSync(`${dir}/0006_perf_indexes.sql`, 'utf8') + '; ANALYZE;');
const after = await run('AFTER');
const insAfter = await ins();
console.log('\n| requête | avant (ms) | après (ms) | plan après |');
for (const k of Object.keys(Q)) console.log(`| ${k} | ${before[k].ms} | ${after[k].ms} | ${after[k].scan} |`);
console.log(`insert 2000 events: avant ${insBefore.toFixed(0)} ms, après ${insAfter.toFixed(0)} ms`);
