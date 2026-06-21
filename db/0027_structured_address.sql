-- 0027_structured_address.sql
-- Item 7: replace the single free-text default shipping address with proper
-- structured fields, plus a light verification flag. We keep the legacy
-- `address` text column populated (a composed one-liner) so the existing
-- trade address-exchange flow that reads it keeps working untouched.

alter table user_addresses
  add column if not exists recipient_name text,
  add column if not exists line1         text,
  add column if not exists line2         text,
  add column if not exists city          text,
  add column if not exists region        text,   -- state / province / county
  add column if not exists postal        text,
  add column if not exists country       text,
  add column if not exists verified      boolean not null default false,
  add column if not exists verified_at   timestamptz;

-- Note: `address` (legacy blob) stays. setMyAddress now writes the structured
-- columns AND a composed `address` string so nothing downstream breaks.
