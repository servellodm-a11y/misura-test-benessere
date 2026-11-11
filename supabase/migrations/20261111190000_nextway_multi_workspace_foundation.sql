-- NEXTWAY multi-workspace foundation
-- Additive candidate only: no existing operational table is altered and no workspace is seeded.

begin;

create table if not exists public.nextway_workspaces (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null unique
    check (workspace_key ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  name text not null check (length(btrim(name)) between 2 and 160),
  partner_name text,
  sector text,
  description text,
  website_url text,
  market_country text,
  language_code text not null default 'it'
    check (language_code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nextway_workspaces_status_idx
  on public.nextway_workspaces(status, name);

create table if not exists public.nextway_workspace_prompts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.nextway_workspaces(id) on delete cascade,
  prompt_key text not null check (prompt_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  version integer not null check (version > 0),
  purpose text not null check (length(btrim(purpose)) between 2 and 240),
  prompt_body text not null check (length(btrim(prompt_body)) between 1 and 50000),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, prompt_key, version),
  constraint nextway_workspace_prompt_activation
    check ((status = 'active' and approved_by is not null and approved_at is not null)
       or status <> 'active')
);

create unique index if not exists nextway_workspace_prompts_one_active_uidx
  on public.nextway_workspace_prompts(workspace_id, prompt_key)
  where status = 'active';
create index if not exists nextway_workspace_prompts_lookup_idx
  on public.nextway_workspace_prompts(workspace_id, prompt_key, status);

create table if not exists public.nextway_workspace_prospect_criteria (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.nextway_workspaces(id) on delete cascade,
  criteria_key text not null check (criteria_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  version integer not null check (version > 0),
  name text not null check (length(btrim(name)) between 2 and 160),
  description text,
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, criteria_key, version),
  constraint nextway_workspace_criteria_activation
    check ((status = 'active' and approved_by is not null and approved_at is not null)
       or status <> 'active')
);

create unique index if not exists nextway_workspace_criteria_one_active_uidx
  on public.nextway_workspace_prospect_criteria(workspace_id, criteria_key)
  where status = 'active';
create index if not exists nextway_workspace_criteria_lookup_idx
  on public.nextway_workspace_prospect_criteria(workspace_id, criteria_key, status);

alter table public.nextway_workspaces enable row level security;
alter table public.nextway_workspace_prompts enable row level security;
alter table public.nextway_workspace_prospect_criteria enable row level security;

revoke all on public.nextway_workspaces from public, anon;
revoke all on public.nextway_workspace_prompts from public, anon;
revoke all on public.nextway_workspace_prospect_criteria from public, anon;

grant select, insert, update, delete on public.nextway_workspaces to authenticated, service_role;
grant select, insert, update, delete on public.nextway_workspace_prompts to authenticated, service_role;
grant select, insert, update, delete on public.nextway_workspace_prospect_criteria to authenticated, service_role;

drop policy if exists nextway_workspaces_platform_admin_all on public.nextway_workspaces;
create policy nextway_workspaces_platform_admin_all
  on public.nextway_workspaces for all to authenticated
  using (public.nextway_is_platform_admin())
  with check (public.nextway_is_platform_admin());

drop policy if exists nextway_workspace_prompts_platform_admin_all on public.nextway_workspace_prompts;
create policy nextway_workspace_prompts_platform_admin_all
  on public.nextway_workspace_prompts for all to authenticated
  using (public.nextway_is_platform_admin())
  with check (public.nextway_is_platform_admin());

drop policy if exists nextway_workspace_criteria_platform_admin_all on public.nextway_workspace_prospect_criteria;
create policy nextway_workspace_criteria_platform_admin_all
  on public.nextway_workspace_prospect_criteria for all to authenticated
  using (public.nextway_is_platform_admin())
  with check (public.nextway_is_platform_admin());

commit;
