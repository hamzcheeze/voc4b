begin;

create or replace function public.delete_vocabulary_today(p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_day date;
  v_deleted integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  v_day := (clock_timestamp() at time zone 'Asia/Bangkok')::date;
  delete from public.vocabulary
    where id = p_id and user_id = v_user and day = v_day;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then return false; end if;
  update public.vocabulary set slot = 1
    where user_id = v_user and day = v_day and slot = 2;
  return true;
end;
$$;

revoke all on function public.delete_vocabulary_today(uuid) from public, anon;
grant execute on function public.delete_vocabulary_today(uuid) to authenticated;

commit;
