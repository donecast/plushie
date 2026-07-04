-- ============================================================
-- Plushie tracker — migration 0074: real-photo proof gallery for trades
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- Until now a trade offering carried a single photo_social_path, which the
-- client copied from the owner's collection row. That collection photo is
-- very often just the catalog *stock* image, so an offering could appear
-- with a picture that proves nothing about the seller actually owning the
-- physical item. Other collectors (rightly) can't trust it.
--
-- This adds a gallery of up to five REAL, user-uploaded photos per offering,
-- stored in the public-readable 'social' bucket (introduced in 0021) so both
-- trade parties can see them. The client requires at least one on every new
-- offering and rejects an upload that perceptually matches the stock image.
--
-- photo_social_path stays on trade_items as the card "cover" (position 0).

create table if not exists trade_item_photos (
  id uuid primary key default gen_random_uuid(),
  trade_item_id uuid not null references trade_items(id) on delete cascade,
  -- object key in the public 'social' bucket (see data.uploadSocialPhoto)
  social_path text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists trade_item_photos_item_idx
  on trade_item_photos(trade_item_id, position);

alter table trade_item_photos enable row level security;

-- Offerings are publicly discoverable, so their proof photos are public-read
-- (same posture as trade_items_read).
drop policy if exists trade_item_photos_read on trade_item_photos;
create policy trade_item_photos_read on trade_item_photos
  for select to authenticated using (true);

-- Only the owner of the parent offering may add/remove its photos.
drop policy if exists trade_item_photos_write on trade_item_photos;
create policy trade_item_photos_write on trade_item_photos
  for all to authenticated
  using (exists (
    select 1 from trade_items ti
    where ti.id = trade_item_id and ti.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from trade_items ti
    where ti.id = trade_item_id and ti.owner_id = auth.uid()
  ));

-- Grandfather existing offerings: seed the gallery from the single social
-- photo they already have, at position 0, so nothing regresses in Browse or
-- open trades. Idempotent — skips any item that already has gallery rows.
insert into trade_item_photos (trade_item_id, social_path, position)
select ti.id, ti.photo_social_path, 0
from trade_items ti
where ti.kind = 'offering'
  and ti.photo_social_path is not null
  and not exists (
    select 1 from trade_item_photos p where p.trade_item_id = ti.id
  );
