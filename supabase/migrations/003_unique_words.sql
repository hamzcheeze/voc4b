begin;

create or replace function public.prevent_vocabulary_repeat()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if exists (
    select 1 from public.vocabulary
    where user_id = new.user_id
      and lower(word) = lower(new.word)
      and id <> new.id
  ) then
    raise exception 'duplicate_word';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_vocabulary_repeat() from public, anon, authenticated;
drop trigger if exists vocabulary_no_repeat on public.vocabulary;
create trigger vocabulary_no_repeat
before insert or update of user_id, word on public.vocabulary
for each row execute function public.prevent_vocabulary_repeat();

commit;
