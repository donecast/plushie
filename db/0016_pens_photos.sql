-- ─── Pens table + photo suggestions wiring ────────────────────────
-- Pens have lived as a hardcoded const in app.js since v1: just
-- (id, line, name) triples. The user wants canonical reference photos
-- so collectors don't have to identify a pen from text alone.
--
-- This migration:
--   1. Adds a 'pens' table seeded from the client constant. Image
--      lives in image_path (the 'catalog' Storage bucket).
--   2. Extends catalog_photo_suggestions with a target_pen_id column
--      so the existing 'do you have this picture?' flow can target a
--      pen too. The one-target CHECK constraint is widened to count
--      pen as a third valid target.
--   3. RLS: anyone authenticated reads pens. Only admin writes.

create table if not exists pens (
  id text primary key,
  line text not null,
  name text not null,
  image_path text,
  position int not null default 0,
  updated_at timestamptz not null default now()
);

alter table pens enable row level security;

drop policy if exists pens_read on pens;
create policy pens_read on pens for select to authenticated using (true);

drop policy if exists pens_write on pens;
create policy pens_write on pens for all to authenticated
  using (is_admin()) with check (is_admin());

-- Seed the rows from the v1 hardcoded constant. INSERT … ON CONFLICT
-- so re-running the migration is safe.
insert into pens (id, line, name, position) values
  ('pd-bpd',         'Plushie Dreadfuls', 'Borderline Personality Disorder', 10),
  ('pd-ptsd',        'Plushie Dreadfuls', 'PTSD',                             20),
  ('pd-nb',          'Plushie Dreadfuls', 'Non-Binary',                       30),
  ('pd-love',        'Plushie Dreadfuls', 'Love',                             40),
  ('pd-autism',      'Plushie Dreadfuls', 'Autism',                           50),
  ('pd-dissociation','Plushie Dreadfuls', 'Dissociation',                     60),
  ('pd-depression',  'Plushie Dreadfuls', 'Depression',                       70),
  ('pd-gd',          'Plushie Dreadfuls', 'Gender Dysphoria',                 80),
  ('pd-anxiety',     'Plushie Dreadfuls', 'Anxiety',                          90),
  ('pd-adhd',        'Plushie Dreadfuls', 'ADHD',                            100),
  ('pd-ouchie',      'Plushie Dreadfuls', 'Ouchie',                          110),
  ('pd-numb',        'Plushie Dreadfuls', 'Numb',                            120),
  ('pd-bone',        'Plushie Dreadfuls', 'Bone Organ Izer',                 130),
  ('vm-alice',       'Victorian McGee',   'Alice',                           200),
  ('vm-wr',          'Victorian McGee',   'White Rabbit',                    210),
  ('vm-cc',          'Victorian McGee',   'Cheshire Cat',                    220),
  ('vm-mt',          'Victorian McGee',   'Mock Turtle',                     230),
  ('vm-dor',         'Victorian McGee',   'Dormouse',                        240),
  ('vm-rrh',         'Victorian McGee',   'Red Riding Hood',                 250),
  ('vm-hyst',        'Victorian McGee',   'Hysteria',                        260)
on conflict (id) do nothing;


-- Extend catalog_photo_suggestions to allow pen targets. The
-- existing one-target check counted Shopify-id and
-- catalog_items-id; pen-id becomes a third valid target.
alter table catalog_photo_suggestions
  add column if not exists target_pen_id text references pens(id) on delete cascade;

alter table catalog_photo_suggestions
  drop constraint if exists catalog_photo_one_target;

alter table catalog_photo_suggestions
  add constraint catalog_photo_one_target check (
    (target_shopify_id is not null)::int +
    (target_catalog_item_id is not null)::int +
    (target_pen_id is not null)::int = 1
  );


-- Touch updated_at on pens UPDATE.
create or replace function pens_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists pens_updated_at on pens;
create trigger pens_updated_at
  before update on pens
  for each row execute function pens_touch_updated_at();
