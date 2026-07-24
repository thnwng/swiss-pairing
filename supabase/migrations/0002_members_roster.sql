-- 0002: align the session model with mahjong-web's link-first mechanism
-- (applied 2026-07-24 via MCP apply_migration).
--   * membership is its own row: opening a session's link makes you a MEMBER
--     with no seat (name null); claiming/joining fills the seat
--   * the roster is a text[] of names on the session (placeholders welcome)
--   * sp_players (which conflated roster and seats) is dropped
create table sp_members (
  session_id uuid not null references sp_sessions(id) on delete cascade,
  tg_id bigint not null,
  tg_name text,
  name text,                                   -- claimed seat name; null = unseated
  primary key (session_id, tg_id)
);
create unique index sp_members_seat on sp_members(session_id, name) where name is not null;

alter table sp_sessions add column roster text[] not null default '{}';

drop table sp_players;

alter table sp_members enable row level security;
-- no policies on purpose: service-role-only access (TMA standard)

-- atomic roster helpers (mirror mahjong-web's add_player pattern)
create or replace function sp_add_name(p_id uuid, p_name text) returns void
language sql security definer as $$
  update sp_sessions set roster = roster || p_name
  where id = p_id and not (roster @> array[p_name]);
$$;

create or replace function sp_rename_name(p_id uuid, p_old text, p_new text) returns void
language sql security definer as $$
  update sp_sessions set roster = array_replace(roster, p_old, p_new)
  where id = p_id and roster @> array[p_old] and not (roster @> array[p_new]);
$$;

create or replace function sp_remove_name(p_id uuid, p_name text) returns void
language sql security definer as $$
  update sp_sessions set roster = array_remove(roster, p_name)
  where id = p_id;
$$;
