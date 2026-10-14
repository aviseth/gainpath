-- Google Health connection (PROMPT "Health data integrations", feature-flagged).
-- Holds the OAuth refresh token so the server can sync daily without the user
-- re-consenting. Not a synced table: it never reaches IndexedDB. Users can
-- see and delete their own row (disconnect); only the server routes write it.

create table public.health_connections (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google_health')),
  refresh_token text not null,
  scope text not null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  primary key (user_id, provider)
);

alter table public.health_connections enable row level security;

create policy health_connections_select_own on public.health_connections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy health_connections_insert_own on public.health_connections
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy health_connections_update_own on public.health_connections
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_connections_delete_own on public.health_connections
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.health_connections from anon;
