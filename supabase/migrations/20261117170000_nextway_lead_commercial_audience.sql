-- Persist explicit commercial audience on each NEXTWAY Lead.
-- Existing records remain NULL until an operator classifies them.
begin;

alter table public.nextway_leads
  add column if not exists commercial_audience text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.nextway_leads'::regclass
      and conname='nextway_leads_commercial_audience_check'
  ) then
    alter table public.nextway_leads
      add constraint nextway_leads_commercial_audience_check
      check (commercial_audience is null or commercial_audience in ('customer','partner'));
  end if;
end;
$$;

create or replace function public.nextway_create_lead_with_conversation_commercial_v3(
  p_request_id uuid,
  p_request_hash text,
  p_workspace_id uuid,
  p_commercial_audience text,
  p_display_name text,
  p_category text,
  p_source_name text,
  p_source_url text,
  p_public_evidence text,
  p_objective text default 'Valutare il prospect e preparare il primo contatto',
  p_channel text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_response jsonb;
  v_lead_id uuid;
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticazione richiesta' using errcode='28000';
  end if;
  if p_commercial_audience not in ('customer','partner') then
    raise exception 'Percorso commerciale Cliente o Partner obbligatorio.' using errcode='22023';
  end if;

  v_response := public.nextway_create_lead_with_conversation_idempotent_v2(
    p_request_id,p_request_hash,p_workspace_id,p_display_name,p_category,
    p_source_name,p_source_url,p_public_evidence,p_objective,p_channel
  );

  if coalesce((v_response->>'success')::boolean,false) is not true then
    return v_response;
  end if;
  v_lead_id := nullif(v_response->>'lead_id','')::uuid;
  if v_lead_id is null then
    raise exception 'Creazione Lead non confermata.' using errcode='P0001';
  end if;

  update public.nextway_leads
     set commercial_audience=p_commercial_audience
   where id=v_lead_id
     and owner_profile_id=auth.uid()
     and workspace_id is not distinct from p_workspace_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Impossibile associare il percorso commerciale al Lead.' using errcode='42501';
  end if;

  return v_response || jsonb_build_object('commercial_audience',p_commercial_audience);
end;
$$;

alter function public.nextway_create_lead_with_conversation_commercial_v3(uuid,text,uuid,text,text,text,text,text,text,text,text) owner to postgres;
revoke all on function public.nextway_create_lead_with_conversation_commercial_v3(uuid,text,uuid,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.nextway_create_lead_with_conversation_commercial_v3(uuid,text,uuid,text,text,text,text,text,text,text,text) to authenticated;

comment on column public.nextway_leads.commercial_audience is
  'Explicit commercial path for workspace guidance: customer or partner. NULL is legacy/unclassified; never infer it.';

commit;
