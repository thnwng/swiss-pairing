-- 0001: multi-user tournament sessions (applied 2026-07-24 via MCP apply_migration).
-- Service-role-only model per the workspace TMA standard: RLS on, zero policies;
-- all access goes through the session/bot Edge Functions.
create table sp_sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  chat_id bigint,                                   -- bound Telegram group (null = private/link-only)
  creator_id bigint not null,                       -- Telegram account id of the organizer
  creator_name text not null default '',
  name text not null default 'Tournament',
  status text not null default 'lobby' check (status in ('lobby','active','done')),
  format text not null default 'swiss' check (format in ('swiss','roundrobin')),
  state jsonb,                                      -- full tournament state once active (single writer: creator)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sp_players (
  session_id uuid not null references sp_sessions(id) on delete cascade,
  name text not null,                               -- roster name (placeholder until claimed)
  tg_id bigint,                                     -- null = unclaimed placeholder
  tg_name text,
  primary key (session_id, name)
);
create unique index sp_players_one_seat on sp_players(session_id, tg_id) where tg_id is not null;

-- bot token + webhook secret; the MCP deploy path has no secrets API, so
-- function secrets live here (service-role-only, never client-visible)
create table sp_config (
  key text primary key,
  value text not null
);

alter table sp_sessions enable row level security;
alter table sp_players enable row level security;
alter table sp_config  enable row level security;
-- no policies on purpose: service-role-only access (TMA standard)
