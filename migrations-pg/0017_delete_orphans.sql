-- Rows left behind when a site was deleted before videos / X tables were included.
DELETE FROM videos v WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = v.site_id);
DELETE FROM x_posts p WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = p.site_id);
DELETE FROM x_sync x WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = x.site_id);
