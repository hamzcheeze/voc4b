-- Apply once in the Supabase SQL editor. Asia/Bangkok is the product calendar.
create table public.vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  slot smallint not null check (slot in (1,2)),
  word text not null check (char_length(word) between 1 and 80),
  syllables jsonb not null,
  explanation text not null check (char_length(explanation) between 3 and 400),
  thai text not null check (char_length(thai) between 3 and 600),
  created_at timestamptz not null default now(),
  unique (user_id,day,slot)
);
create unique index vocabulary_daily_word on public.vocabulary(user_id,day,lower(word));
alter table public.vocabulary enable row level security;
create policy own_vocabulary_select on public.vocabulary for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.vocabulary from anon,authenticated;
grant select on public.vocabulary to authenticated;

-- Write access exists only through this function; no caller can choose user, day or slot.
create function public.save_vocabulary(p_word text,p_syllables jsonb,p_explanation text,p_thai text)
returns setof public.vocabulary
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_day date;
  v_count integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_word is null or btrim(p_word) !~ '^[A-Za-z]+([-''][A-Za-z]+)*$' or char_length(btrim(p_word))>80
    or p_explanation is null or char_length(btrim(p_explanation)) not between 3 and 400
    or p_explanation !~ '[A-Za-z]' or p_explanation ~ '[ก-๿]'
    or p_thai is null or char_length(btrim(p_thai)) not between 3 and 600 or p_thai !~ '[ก-๿]'
    or p_syllables is null or jsonb_typeof(p_syllables) <> 'array' then raise exception 'invalid_entry'; end if;
  if jsonb_array_length(p_syllables) not between 1 and 12 then raise exception 'invalid_pronunciation'; end if;
  if exists(select 1 from jsonb_array_elements(p_syllables) s where jsonb_typeof(s) <> 'object'
    or not(s ? 'text' and s ? 'stressed') or jsonb_typeof(s->'text') <> 'string'
    or (s->>'text') !~ '^[A-Za-z]{1,24}$' or jsonb_typeof(s->'stressed') <> 'boolean')
    or (select count(*) from jsonb_array_elements(p_syllables) s where s->>'stressed'='true') <> 1 then raise exception 'invalid_pronunciation'; end if;
  -- Serialize all saves by this user, including requests straddling midnight.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
  -- Wall clock after lock: queued midnight requests belong to their actual save day.
  v_day := (clock_timestamp() at time zone 'Asia/Bangkok')::date;
  select count(*) into v_count from public.vocabulary where user_id=v_user and day=v_day;
  if v_count >= 2 then raise exception 'daily_limit'; end if;
  if exists(select 1 from public.vocabulary where user_id=v_user and day=v_day and lower(word)=lower(btrim(p_word))) then raise exception 'duplicate_word'; end if;
  return query insert into public.vocabulary(user_id,day,slot,word,syllables,explanation,thai)
    values(v_user,v_day,v_count+1,btrim(p_word),p_syllables,btrim(p_explanation),btrim(p_thai)) returning *;
end;
$$;
revoke all on function public.save_vocabulary(text,jsonb,text,text) from public,anon;
grant execute on function public.save_vocabulary(text,jsonb,text,text) to authenticated;
create function public.vocabulary_today_count() returns integer language sql security invoker set search_path = '' as $$
 select count(*)::integer from public.vocabulary where user_id=auth.uid() and day=(clock_timestamp() at time zone 'Asia/Bangkok')::date;
$$;
revoke all on function public.vocabulary_today_count() from public,anon;
grant execute on function public.vocabulary_today_count() to authenticated;
