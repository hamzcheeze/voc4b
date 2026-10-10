begin;

alter table public.vocabulary add column if not exists content jsonb;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vocabulary' and column_name = 'explanation'
  ) then
    update public.vocabulary
      set content = jsonb_build_object('kind', 'legacy', 'explanation', explanation, 'syllables', syllables)
      where content is null;
  end if;
end;
$$;

alter table public.vocabulary alter column content set not null;
drop function if exists public.save_vocabulary(text,jsonb,text,text);
alter table public.vocabulary
  drop column if exists syllables,
  drop column if exists explanation,
  drop column if exists thai;

create or replace function public.save_vocabulary(p_word text, p_entry jsonb)
returns setof public.vocabulary
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_word text := lower(btrim(p_word));
  v_headword text;
  v_day date;
  v_count integer;
  v_item jsonb;
  v_example jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_word is null or char_length(btrim(p_word)) not between 1 and 80
    or btrim(p_word) !~ '^[A-Za-z]+([-''][A-Za-z]+)*$'
    or p_entry is null or jsonb_typeof(p_entry) is distinct from 'object'
    or octet_length(p_entry::text) > 1048576
    or (p_entry - array['headword','partsOfSpeech','pronunciations','definitions','verbForms']) <> '{}'::jsonb
    or not (p_entry ?& array['headword','partsOfSpeech','pronunciations','definitions','verbForms'])
    then raise exception 'invalid_entry'; end if;

  if jsonb_typeof(p_entry->'headword') is distinct from 'string'
    or char_length(p_entry->>'headword') not between 1 and 160
    or btrim(p_entry->>'headword') = ''
    then raise exception 'invalid_entry'; end if;
  v_headword := lower(regexp_replace(btrim(p_entry->>'headword'), '\s+', ' ', 'g'));
  if v_headword <> v_word and left(v_headword, char_length(v_word) + 1) <> v_word || ' '
    then raise exception 'invalid_entry'; end if;

  if jsonb_typeof(p_entry->'partsOfSpeech') is distinct from 'array'
    or jsonb_typeof(p_entry->'pronunciations') is distinct from 'array'
    or jsonb_typeof(p_entry->'definitions') is distinct from 'array'
    or jsonb_typeof(p_entry->'verbForms') is distinct from 'array'
    then raise exception 'invalid_entry'; end if;
  if jsonb_array_length(p_entry->'partsOfSpeech') > 100
    or jsonb_array_length(p_entry->'pronunciations') > 1000
    or jsonb_array_length(p_entry->'definitions') not between 1 and 1000
    or jsonb_array_length(p_entry->'verbForms') > 1000
    then raise exception 'invalid_entry'; end if;

  for v_item in select value from jsonb_array_elements(p_entry->'partsOfSpeech') loop
    if jsonb_typeof(v_item) is distinct from 'string' or char_length(v_item #>> '{}') > 128
      then raise exception 'invalid_entry'; end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_entry->'pronunciations') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or not (v_item ?& array['pos','region','ipa','audioUrl'])
      or (v_item - array['pos','region','ipa','audioUrl']) <> '{}'::jsonb
      or jsonb_typeof(v_item->'pos') is distinct from 'string'
      or char_length(v_item->>'pos') > 128
      or jsonb_typeof(v_item->'region') is distinct from 'string'
      or (v_item->>'region') not in ('us','uk')
      or jsonb_typeof(v_item->'ipa') is distinct from 'string'
      or char_length(v_item->>'ipa') not between 1 and 256
      or btrim(v_item->>'ipa') = ''
      or jsonb_typeof(v_item->'audioUrl') is distinct from 'string'
      or char_length(v_item->>'audioUrl') > 2048
      or ((v_item->>'audioUrl') <> '' and (v_item->>'audioUrl') !~ '^https://dictionary[.]cambridge[.]org([/?#][^[:space:]]*)?$')
      then raise exception 'invalid_entry'; end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_entry->'definitions') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or not (v_item ?& array['id','pos','source','text','examples'])
      or (v_item - array['id','pos','source','text','examples']) <> '{}'::jsonb
      or jsonb_typeof(v_item->'id') is distinct from 'string'
      or char_length(v_item->>'id') not between 1 and 128
      or btrim(v_item->>'id') = ''
      or jsonb_typeof(v_item->'pos') is distinct from 'string'
      or char_length(v_item->>'pos') > 128
      or jsonb_typeof(v_item->'source') is distinct from 'string'
      or char_length(v_item->>'source') > 256
      or jsonb_typeof(v_item->'text') is distinct from 'string'
      or char_length(v_item->>'text') not between 1 and 4000
      or btrim(v_item->>'text') = ''
      or (v_item->>'text') !~ '[A-Za-z]'
      or jsonb_typeof(v_item->'examples') is distinct from 'array'
      then raise exception 'invalid_entry'; end if;
    if jsonb_array_length(v_item->'examples') > 1000 then raise exception 'invalid_entry'; end if;
    for v_example in select value from jsonb_array_elements(v_item->'examples') loop
      if jsonb_typeof(v_example) is distinct from 'object'
        or not (v_example ?& array['id','text'])
        or (v_example - array['id','text']) <> '{}'::jsonb
        or jsonb_typeof(v_example->'id') is distinct from 'string'
        or char_length(v_example->>'id') not between 1 and 128
        or btrim(v_example->>'id') = ''
        or jsonb_typeof(v_example->'text') is distinct from 'string'
        or char_length(v_example->>'text') not between 1 and 4000
        or btrim(v_example->>'text') = ''
        or (v_example->>'text') !~ '[A-Za-z]'
        then raise exception 'invalid_entry'; end if;
    end loop;
  end loop;

  for v_item in select value from jsonb_array_elements(p_entry->'verbForms') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or not (v_item ?& array['id','type','text'])
      or (v_item - array['id','type','text']) <> '{}'::jsonb
      or jsonb_typeof(v_item->'id') is distinct from 'string'
      or char_length(v_item->>'id') not between 1 and 128
      or btrim(v_item->>'id') = ''
      or jsonb_typeof(v_item->'type') is distinct from 'string'
      or char_length(v_item->>'type') not between 1 and 128
      or btrim(v_item->>'type') = ''
      or jsonb_typeof(v_item->'text') is distinct from 'string'
      or char_length(v_item->>'text') not between 1 and 4000
      or btrim(v_item->>'text') = ''
      then raise exception 'invalid_entry'; end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  v_day := (clock_timestamp() at time zone 'Asia/Bangkok')::date;
  if exists (
    select 1 from public.vocabulary where user_id = v_user and day = v_day and lower(word) = v_word
  ) then raise exception 'duplicate_word'; end if;
  select count(*) into v_count from public.vocabulary where user_id = v_user and day = v_day;
  if v_count >= 2 then raise exception 'daily_limit'; end if;
  return query insert into public.vocabulary(user_id, day, slot, word, content)
    values(v_user, v_day, v_count + 1, v_word, jsonb_build_object('kind', 'dictionary', 'entry', p_entry))
    returning *;
end;
$$;

revoke all on function public.save_vocabulary(text,jsonb) from public,anon;
grant execute on function public.save_vocabulary(text,jsonb) to authenticated;

drop function if exists public.clear_vocabulary_today();
create or replace function public.clear_vocabulary_today(
  p_expected_day date default (clock_timestamp() at time zone 'Asia/Bangkok')::date
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_day date;
  v_deleted integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  v_day := (clock_timestamp() at time zone 'Asia/Bangkok')::date;
  if p_expected_day is distinct from v_day then raise exception 'calendar_day_changed'; end if;
  delete from public.vocabulary where user_id = v_user and day = v_day;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.clear_vocabulary_today(date) from public,anon;
grant execute on function public.clear_vocabulary_today(date) to authenticated;

commit;
