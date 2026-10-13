begin;
create or replace function public.update_vocabulary_meaning(p_user_id uuid, p_id uuid, p_meaning text)
returns setof public.vocabulary
language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null or not exists (select 1 from next_auth.users where id = p_user_id)
    then raise exception 'authentication_required'; end if;
  if p_meaning is null or char_length(btrim(p_meaning)) not between 1 and 600
    or p_meaning ~ '[[:cntrl:]]' then raise exception 'invalid_meaning'; end if;
  return query update public.vocabulary
    set content = jsonb_set(content, '{thaiMeaning}', to_jsonb(btrim(p_meaning)), true)
    where id = p_id and user_id = p_user_id returning *;
end;
$$;
revoke all on function public.update_vocabulary_meaning(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.update_vocabulary_meaning(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
