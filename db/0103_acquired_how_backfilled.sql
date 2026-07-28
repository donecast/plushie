-- db/0103 — mark the rows db/0102 moved, so we can ask their owners about them.
--
-- db/0102 moved 626 "Direct Purchase" rows to "Bought from Manufacturer" on
-- Scott's word that the old option meant first-hand. That's right for most of
-- them and wrong for some: a collector who bought a retired plush on Mercari
-- had no secondhand option to pick, so they picked Direct Purchase too. Those
-- rows are now confidently labelled with something untrue.
--
-- We can't tell which from the data, so the app asks — once — and this column
-- is how it knows who to ask and which rows to show them. It is a question
-- marker, not a fact about the plush: anything the owner saves afterwards
-- clears it (data.js sends false on every write), and "they're all right"
-- clears the rest in one go.
--
-- Identifying the migrated rows: db/0102 ran as a single UPDATE, so all of its
-- rows share one updated_at second — 2026-07-28 22:02:54Z. 625 rows carry it
-- (the 626th has been edited since, so its owner has already looked at it).
-- Sub-second precision varies, hence date_trunc rather than equality.

alter table plushies
  add column if not exists acquired_how_backfilled boolean not null default false;

do $$
declare
  n_rows int;
  n_users int;
begin
  update plushies
     set acquired_how_backfilled = true
   where acquired_how = 'Bought from Manufacturer'
     and date_trunc('second', updated_at) = timestamptz '2026-07-28 22:02:54+00';
  get diagnostics n_rows = row_count;

  select count(distinct c.owner_id) into n_users
    from plushies p join collections c on c.id = p.collection_id
   where p.acquired_how_backfilled;

  raise notice 'db/0103 applied: % row(s) across % collector(s) flagged for the "was this secondhand?" prompt.',
    n_rows, n_users;
end $$;

-- Confirmation query — expect ~625 flagged, all of them Bought from Manufacturer.
select acquired_how, acquired_how_backfilled, count(*) as row_count
  from plushies
 where acquired_how_backfilled
 group by 1, 2;
