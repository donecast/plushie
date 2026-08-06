-- 0105 — raise the direct-message length ceiling by 50% (2000 → 3000).
--
-- Comments/replies are capped client-side only (post_comments.body has no
-- check constraint), so they need no migration — see COMMENT_MAX_LEN in
-- app-social.js. DMs are capped in both places, and the DB is the one that
-- would reject a long message, so it has to move too.
--
-- Idempotent: drops the old inline check by its generated name, re-adds it.

alter table dm_messages drop constraint if exists dm_messages_body_check;

alter table dm_messages
  add constraint dm_messages_body_check
  check (char_length(btrim(body)) between 1 and 3000);

-- Confirmation: should print the new bound, and "OK".
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'dm_messages'::regclass
     and conname  = 'dm_messages_body_check';

  if v_def is null then
    raise exception '0105 FAILED: dm_messages_body_check is missing';
  elsif v_def not like '%3000%' then
    raise exception '0105 FAILED: constraint still reads %', v_def;
  end if;

  raise notice '0105 OK — dm_messages_body_check is now %', v_def;
end $$;

select pg_get_constraintdef(oid) as dm_body_check
  from pg_constraint
 where conrelid = 'dm_messages'::regclass
   and conname  = 'dm_messages_body_check';
