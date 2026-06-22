-- 0034_comment_edit.sql — let comment authors edit their own comments (item 25).
--
-- post_comments previously allowed only read / insert / delete. The social
-- feed now offers an inline "✎ Edit" affordance on your own comments, which
-- needs an UPDATE policy. Authors may update their own rows only; the WITH
-- CHECK clause keeps author_id from being reassigned away.

drop policy if exists comments_update on post_comments;
create policy comments_update on post_comments for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());
