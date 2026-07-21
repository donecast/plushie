-- ============================================================
-- Plushie tracker — migration 0087: realtime notification stream
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- The 0085 inbox made delivery reliable but the app-open fallback rode the
-- 5-minute social poll. Publish the notifications table on the Supabase
-- Realtime websocket so the client hears about its new rows INSTANTLY and
-- runs the same refresh the poll does (the poll stays as the safety net
-- for missed events / reconnects). RLS still gates what each subscriber
-- can see — you only ever receive your own rows.

do $$
begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then
  null;  -- already published; safe re-run
end $$;

select 'notifications published on supabase_realtime — client stream is live' as status;
