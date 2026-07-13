-- Plushie tracker — migration 0090: photos on comments and replies
--
-- Comments can now carry a picture (Facebook-style), stored in the same
-- 'social' bucket post photos use (0021's storage policies already let
-- each user write under their own folder, so no new policy is needed).
-- A comment must still say *something*: text, a photo, or both.
--
-- Safe for older clients: they load comments with select('*') (extra
-- columns are ignored) and always insert a non-null body.

alter table post_comments add column if not exists photo_path text;

alter table post_comments alter column body drop not null;

alter table post_comments drop constraint if exists comment_body_or_photo;
alter table post_comments add constraint comment_body_or_photo
  check (body is not null or photo_path is not null);

-- ── Confirmation ────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'post_comments' and column_name = 'photo_path')
  then
    raise notice '✔ 0090 applied: post_comments.photo_path exists, body is optional';
  else
    raise exception '✘ 0090 failed: photo_path column missing';
  end if;
end $$;
