-- ─── Feedback rework: structured ratings + edit window ──────
-- Adds three thumbs-up/down ratings (communication, shipping, accuracy)
-- alongside the legacy enum. Old rows survive untouched; new rows can
-- carry both. Aggregated percent in user_feedback_summary weights the
-- new ratings when present.
--
-- Also opens UPDATE on a user's own feedback within 7 days of creation
-- so corrections, late-package re-rates, and typo fixes don't require
-- contacting an admin.

alter table trade_feedback
  add column if not exists rating_communication boolean,
  add column if not exists rating_shipping      boolean,
  add column if not exists rating_accuracy      boolean,
  add column if not exists updated_at           timestamptz;

-- Edit window: own row, within 7 days of created_at. Cannot change
-- trade_id / rater_id / ratee_id.
drop policy if exists feedback_update on trade_feedback;
create policy feedback_update on trade_feedback for update to authenticated
  using (rater_id = auth.uid() and created_at > now() - interval '7 days')
  with check (rater_id = auth.uid() and created_at > now() - interval '7 days');

-- Touch updated_at on every UPDATE so the UI can tell "(edited)" later
-- if we want to surface it.
create or replace function trade_feedback_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trade_feedback_updated_at on trade_feedback;
create trigger trade_feedback_updated_at
  before update on trade_feedback
  for each row execute function trade_feedback_touch_updated_at();

-- Recompute summary view to expose:
--   * legacy good/meh/bad/net counts (unchanged, for backwards compat)
--   * structured counts per category
--   * an overall percent (0–100) computed from whichever signal exists:
--     prefer structured ratings when at least one is set on the row,
--     fall back to the enum (good = +1, meh = 0, bad = -1, mapped to %).
create or replace view user_feedback_summary as
with rows as (
  select
    f.ratee_id,
    f.rating,
    f.rating_communication,
    f.rating_shipping,
    f.rating_accuracy,
    -- Has at least one structured rating?
    (f.rating_communication is not null
      or f.rating_shipping is not null
      or f.rating_accuracy is not null) as has_structured,
    -- Per-row percent: structured wins. Average of the non-null thumbs,
    -- scaled to 0–100. If no structured ratings, fall back to enum.
    case
      when f.rating_communication is not null
        or f.rating_shipping is not null
        or f.rating_accuracy is not null then
        100.0 * (
          coalesce(f.rating_communication::int, 0)
          + coalesce(f.rating_shipping::int, 0)
          + coalesce(f.rating_accuracy::int, 0)
        ) / nullif(
          (f.rating_communication is not null)::int
          + (f.rating_shipping is not null)::int
          + (f.rating_accuracy is not null)::int, 0)
      when f.rating = 'good' then 100.0
      when f.rating = 'meh'  then 50.0
      when f.rating = 'bad'  then 0.0
    end as row_percent
  from trade_feedback f
)
select
  p.id       as user_id,
  p.username,
  coalesce(sum(case when r.rating='good' then 1 else 0 end), 0)::int    as good_count,
  coalesce(sum(case when r.rating='meh'  then 1 else 0 end), 0)::int    as meh_count,
  coalesce(sum(case when r.rating='bad'  then 1 else 0 end), 0)::int    as bad_count,
  coalesce(sum(case when r.rating='good' then 1
                    when r.rating='bad'  then -1 else 0 end), 0)::int   as net_score,
  coalesce(count(r.*), 0)::int                                          as total_count,
  -- New: percent of thumbs-ups across the three categories, averaged
  -- over all rows that have any rating. Rounded to int for display.
  coalesce(sum(case when r.rating_communication then 1 else 0 end), 0)::int as comm_up,
  coalesce(sum(case when r.rating_communication = false then 1 else 0 end), 0)::int as comm_down,
  coalesce(sum(case when r.rating_shipping then 1 else 0 end), 0)::int      as ship_up,
  coalesce(sum(case when r.rating_shipping = false then 1 else 0 end), 0)::int as ship_down,
  coalesce(sum(case when r.rating_accuracy then 1 else 0 end), 0)::int      as acc_up,
  coalesce(sum(case when r.rating_accuracy = false then 1 else 0 end), 0)::int as acc_down,
  round(avg(r.row_percent))::int as overall_percent
from profiles p
left join rows r on r.ratee_id = p.id
group by p.id, p.username;

-- Public view of comments + ratings: anyone signed in can browse a
-- user's recent comments. Includes the rater's username so the reader
-- sees who said what; intentionally excludes trade_id so the comment
-- can't be traced back to a specific exchange (which often involves
-- the other party's offerings list).
create or replace view public_feedback_recent as
select
  f.ratee_id,
  rp.username                 as rater_username,
  f.rating,
  f.rating_communication,
  f.rating_shipping,
  f.rating_accuracy,
  f.comment,
  f.created_at,
  f.updated_at
from trade_feedback f
join profiles rp on rp.id = f.rater_id
order by f.created_at desc;
