-- Migration: Make tag names unique per user instead of globally unique.
--
-- Before this change one user's tag name reserved that name for everyone.
-- The inline UNIQUE on tags.name creates an index literally named `name`;
-- we drop it and add a composite UNIQUE(name, user_id).
--
-- Legacy rows still have user_id = NULL. MySQL UNIQUE indexes treat NULLs as
-- distinct, so pre-existing tags are all preserved and remain claimable.

DROP INDEX `name` ON tags;

ALTER TABLE tags ADD UNIQUE INDEX `uq_tags_name_user` (name, user_id);