create index if not exists vocabulary_history_page
  on public.vocabulary (user_id, day desc, created_at desc, word desc, id desc);
