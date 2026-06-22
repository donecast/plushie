-- 0035_social_links.sql — let collectors link their social media (item 1).
--
-- Users enter just a username/handle per network (Instagram, TikTok, X,
-- BlueSky, YouTube, Facebook, LinkedIn) and the app derives the full URL.
-- Stored as a small JSON object keyed by platform, e.g.
--   {"instagram": "spookyplush", "x": "spookyplush"}
-- No new RLS needed: the existing profile policies already govern who can
-- read/update a profile row, and social_links rides along with bio/avatar.

alter table profiles add column if not exists social_links jsonb not null default '{}'::jsonb;
