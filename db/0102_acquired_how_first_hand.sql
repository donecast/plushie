-- db/0102 — retire "Direct Purchase" in favour of "Bought from Manufacturer".
--
-- Context: db/0000-era `plushies.acquired_how` is free text driven by a fixed
-- <select> in index.html. #211 split the old "Direct Purchase" option into
-- "Bought from Manufacturer" / "Purchased Secondhand" after collectors asked
-- for a secondhand answer (a Mercari find shouldn't read the same as one
-- straight from Plushie Dreadfuls).
--
-- #211 deliberately left the ~626 existing "Direct Purchase" rows alone,
-- because the DB can't know which of the two they meant. Scott has since
-- confirmed the intent behind the original option: Direct Purchase == first
-- hand, i.e. bought from the manufacturer. So this is a stated-intent
-- backfill, not a guess.
--
-- Idempotent: re-running matches nothing the second time.

do $$
declare
  n_rows int;
  n_users int;
begin
  select count(*), count(distinct c.owner_id)
    into n_rows, n_users
    from plushies p
    join collections c on c.id = p.collection_id
   where p.acquired_how = 'Direct Purchase';

  update plushies
     set acquired_how = 'Bought from Manufacturer',
         updated_at   = now()
   where acquired_how = 'Direct Purchase';

  raise notice 'db/0102 applied: % row(s) across % collector(s) moved Direct Purchase -> Bought from Manufacturer.',
    n_rows, n_users;
end $$;

-- Confirmation query — expect zero "Direct Purchase" rows left.
select coalesce(acquired_how, '(not set)') as acquired_how, count(*) as row_count
  from plushies
 group by 1
 order by 2 desc;
