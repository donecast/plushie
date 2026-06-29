-- 0052_restock_48h.sql
-- Stirrings: a "restocked" event is only worth showing when the item was
-- genuinely gone for a while. A brief out-of-stock blip (which is also what a
-- stale/cached client flapping the shared snapshot produces) should leave no
-- trace.
--
-- New rule for the available→ transition in sync_catalog_events:
--   * Sells out (available → sold out): log a 'sold_out' event, as before.
--   * Comes back in stock (sold out → available):
--       - if the most recent open 'sold_out' is < 48h old, the out-of-stock was
--         a blip: DELETE that 'sold_out' event and emit nothing.
--       - otherwise (>= 48h, or no recorded sold_out): log a 'restocked' event.
-- The added / retired / unretired branches are unchanged from 0044.

create or replace function sync_catalog_events(items jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  it jsonb;
  snap catalog_snapshot%rowtype;
  h text; nm text; img text; av boolean; rt boolean; pr numeric;
  n int := 0;
  seeded boolean;
  is_new boolean;
  last_sold_out timestamptz;
begin
  -- Only emit "added" once the snapshot is seeded, so the first full backfill
  -- doesn't spam the feed with hundreds of "added" events.
  seeded := exists (select 1 from catalog_snapshot limit 1);

  for it in select * from jsonb_array_elements(items)
  loop
    h := it->>'handle';
    if h is null or h = '' then continue; end if;
    nm  := it->>'name';
    img := it->>'image';
    av  := coalesce((it->>'available')::boolean, false);
    rt  := coalesce((it->>'retired')::boolean, false);
    pr  := nullif(it->>'price','')::numeric;

    select * into snap from catalog_snapshot where handle = h for update;
    is_new := not found;

    if is_new then
      if seeded then
        insert into catalog_events(handle, name, image, kind) values (h, nm, img, 'added');
        n := n + 1;
      end if;
    else
      if rt and not coalesce(snap.retired, false) then
        insert into catalog_events(handle, name, image, kind) values (h, nm, img, 'retired'); n := n + 1;
      elsif coalesce(snap.retired, false) and not rt then
        insert into catalog_events(handle, name, image, kind) values (h, nm, img, 'unretired'); n := n + 1;
      end if;
      if not rt then
        if av and not coalesce(snap.available, false) then
          -- Back in stock. Only celebrate a restock if it was actually gone for
          -- a while; otherwise treat the dip as noise and remove its sold_out.
          select max(created_at) into last_sold_out
            from catalog_events where handle = h and kind = 'sold_out';
          if last_sold_out is not null and last_sold_out > now() - interval '48 hours' then
            delete from catalog_events
              where handle = h and kind = 'sold_out' and created_at = last_sold_out;
            -- emit nothing
          else
            insert into catalog_events(handle, name, image, kind) values (h, nm, img, 'restocked'); n := n + 1;
          end if;
        elsif coalesce(snap.available, false) and not av then
          insert into catalog_events(handle, name, image, kind) values (h, nm, img, 'sold_out'); n := n + 1;
        end if;
      end if;
    end if;

    insert into catalog_snapshot(handle, name, image, available, retired, price, updated_at)
      values (h, nm, img, av, rt, pr, now())
      on conflict (handle) do update set
        name = excluded.name, image = excluded.image,
        available = excluded.available, retired = excluded.retired,
        price = excluded.price, updated_at = now();
  end loop;
  return n;
end;
$$;

grant execute on function sync_catalog_events(jsonb) to authenticated;
