-- responses RPC for CSI survey drafts/final submissions.
-- Run this in Supabase SQL editor after adapting the optional invitation lookup block
-- if your invitation/upload table has a different name.

create extension if not exists pgcrypto;

create table if not exists public.responses (
  id bigserial primary key,
  upload_id bigint,
  survey integer,
  flow_type text check (flow_type in ('PV', 'VN')),
  vin text,
  invitation_token_hash text not null unique,
  form jsonb not null default '{}'::jsonb,
  questions_count integer not null default 0,
  answered_count integer not null default 0,
  response_start timestamptz,
  submission_time timestamptz,
  duration_seconds integer not null default 0,
  time_per_question numeric(10,2) not null default 0,
  completion_rate numeric(5,2) not null default 0,
  interruptions integer not null default 0,
  ip_address inet,
  ip_country text,
  user_agent text,
  device text,
  gps_latitude numeric(10,6),
  gps_longitude numeric(10,6),
  gps_country text,
  country_gps_mismatch boolean,
  cookies jsonb not null default '{}'::jsonb,
  bot_score numeric(10,2),
  duplicate_score numeric(10,2),
  duplicated_respondent boolean,
  same_ip_responses boolean,
  duration_too_long boolean,
  duration_too_short boolean,
  straightlining boolean,
  same_response_time_per_question boolean,
  ballot_box_stuffing boolean,
  completed_validated_by_customer boolean not null default false,
  proposed_assignment text,
  decision text default 'under_analysis',
  publication_excluded boolean default false,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists responses_flow_type_idx on public.responses (flow_type);
create index if not exists responses_vin_idx on public.responses (vin);
create index if not exists responses_completed_idx on public.responses (completed_validated_by_customer);

create or replace function public.request_header(header_name text)
returns text
language sql
stable
as $$
  select nullif(current_setting('request.headers', true)::jsonb ->> lower(header_name), '')
$$;

create or replace function public.request_ip()
returns inet
language plpgsql
stable
as $$
declare
  raw_ip text;
begin
  raw_ip := split_part(coalesce(
    public.request_header('cf-connecting-ip'),
    public.request_header('x-real-ip'),
    public.request_header('x-forwarded-for')
  ), ',', 1);

  if raw_ip is null or btrim(raw_ip) = '' then
    return null;
  end if;

  return btrim(raw_ip)::inet;
exception when others then
  return null;
end;
$$;

create or replace function public.upsert_survey_response(invitation_token text, payload jsonb)
returns public.responses
language plpgsql
security definer
set search_path = public
as $$
declare
  token_hash text;
  existing public.responses;
  enriched_upload_id bigint;
  enriched_survey integer;
  enriched_flow_type text;
  enriched_vin text;
  enriched_ip_country text;
  final_completed boolean;
  saved public.responses;
begin
  if invitation_token is null or btrim(invitation_token) = '' then
    raise exception 'invitation_token is required' using errcode = '22023';
  end if;

  token_hash := encode(digest(invitation_token, 'sha256'), 'hex');

  select * into existing
  from public.responses
  where invitation_token_hash = token_hash
  for update;

  if existing.completed_validated_by_customer is true then
    raise exception 'response already completed and locked' using errcode = '55000';
  end if;

  -- Optional enrichment hook. Replace this block with the real invitation/upload lookup
  -- when the source table is available, for example by joining on token_hash.
  enriched_upload_id := nullif(payload ->> 'upload_id', '')::bigint;
  enriched_survey := nullif(payload ->> 'survey', '')::integer;
  enriched_flow_type := nullif(payload ->> 'flow_type', '');
  enriched_vin := nullif(payload ->> 'vin', '');

  final_completed := coalesce((payload ->> 'completed_validated_by_customer')::boolean, false);
  enriched_ip_country := upper(coalesce(
    public.request_header('cf-ipcountry'),
    public.request_header('x-country-code'),
    nullif(payload ->> 'ip_country', '')
  ));

  insert into public.responses (
    upload_id,
    survey,
    flow_type,
    vin,
    invitation_token_hash,
    form,
    questions_count,
    answered_count,
    response_start,
    submission_time,
    duration_seconds,
    time_per_question,
    completion_rate,
    interruptions,
    ip_address,
    ip_country,
    user_agent,
    device,
    gps_latitude,
    gps_longitude,
    gps_country,
    country_gps_mismatch,
    cookies,
    bot_score,
    duplicate_score,
    duplicated_respondent,
    same_ip_responses,
    duration_too_long,
    duration_too_short,
    straightlining,
    same_response_time_per_question,
    ballot_box_stuffing,
    completed_validated_by_customer,
    proposed_assignment,
    decision,
    publication_excluded,
    raw_payload,
    updated_at
  ) values (
    enriched_upload_id,
    enriched_survey,
    enriched_flow_type,
    enriched_vin,
    token_hash,
    coalesce(payload -> 'form', '{}'::jsonb),
    coalesce((payload ->> 'questions_count')::integer, 0),
    coalesce((payload ->> 'answered_count')::integer, 0),
    nullif(payload ->> 'response_start', '')::timestamptz,
    nullif(payload ->> 'submission_time', '')::timestamptz,
    coalesce((payload ->> 'duration_seconds')::integer, 0),
    coalesce((payload ->> 'time_per_question')::numeric, 0),
    coalesce((payload ->> 'completion_rate')::numeric, 0),
    coalesce((payload ->> 'interruptions')::integer, 0),
    public.request_ip(),
    enriched_ip_country,
    nullif(payload ->> 'user_agent', ''),
    nullif(payload ->> 'device', ''),
    nullif(payload ->> 'gps_latitude', '')::numeric,
    nullif(payload ->> 'gps_longitude', '')::numeric,
    upper(nullif(payload ->> 'gps_country', '')),
    case
      when enriched_ip_country is null or nullif(payload ->> 'gps_country', '') is null then null
      else enriched_ip_country <> upper(payload ->> 'gps_country')
    end,
    coalesce(payload -> 'cookies', '{}'::jsonb),
    nullif(payload ->> 'bot_score', '')::numeric,
    nullif(payload ->> 'duplicate_score', '')::numeric,
    nullif(payload ->> 'duplicated_respondent', '')::boolean,
    nullif(payload ->> 'same_ip_responses', '')::boolean,
    nullif(payload ->> 'duration_too_long', '')::boolean,
    nullif(payload ->> 'duration_too_short', '')::boolean,
    nullif(payload ->> 'straightlining', '')::boolean,
    nullif(payload ->> 'same_response_time_per_question', '')::boolean,
    nullif(payload ->> 'ballot_box_stuffing', '')::boolean,
    final_completed,
    coalesce(nullif(payload ->> 'proposed_assignment', ''), 'normal'),
    coalesce(nullif(payload ->> 'decision', ''), 'under_analysis'),
    coalesce((payload ->> 'publication_excluded')::boolean, false),
    coalesce(payload -> 'raw_payload', payload),
    now()
  )
  on conflict (invitation_token_hash) do update set
    upload_id = coalesce(excluded.upload_id, responses.upload_id),
    survey = coalesce(excluded.survey, responses.survey),
    flow_type = coalesce(excluded.flow_type, responses.flow_type),
    vin = coalesce(excluded.vin, responses.vin),
    form = excluded.form,
    questions_count = excluded.questions_count,
    answered_count = excluded.answered_count,
    response_start = coalesce(responses.response_start, excluded.response_start),
    submission_time = excluded.submission_time,
    duration_seconds = excluded.duration_seconds,
    time_per_question = excluded.time_per_question,
    completion_rate = excluded.completion_rate,
    interruptions = excluded.interruptions,
    ip_address = coalesce(excluded.ip_address, responses.ip_address),
    ip_country = coalesce(excluded.ip_country, responses.ip_country),
    user_agent = excluded.user_agent,
    device = excluded.device,
    gps_latitude = excluded.gps_latitude,
    gps_longitude = excluded.gps_longitude,
    gps_country = excluded.gps_country,
    country_gps_mismatch = excluded.country_gps_mismatch,
    cookies = excluded.cookies,
    bot_score = excluded.bot_score,
    duplicate_score = excluded.duplicate_score,
    duplicated_respondent = excluded.duplicated_respondent,
    same_ip_responses = excluded.same_ip_responses,
    duration_too_long = excluded.duration_too_long,
    duration_too_short = excluded.duration_too_short,
    straightlining = excluded.straightlining,
    same_response_time_per_question = excluded.same_response_time_per_question,
    ballot_box_stuffing = excluded.ballot_box_stuffing,
    completed_validated_by_customer = excluded.completed_validated_by_customer,
    proposed_assignment = excluded.proposed_assignment,
    decision = excluded.decision,
    publication_excluded = excluded.publication_excluded,
    raw_payload = excluded.raw_payload,
    updated_at = now()
  where responses.completed_validated_by_customer is false
  returning * into saved;

  if saved.id is null then
    raise exception 'response already completed and locked' using errcode = '55000';
  end if;

  return saved;
end;
$$;

revoke all on function public.upsert_survey_response(text, jsonb) from public;
grant execute on function public.upsert_survey_response(text, jsonb) to anon, authenticated;
