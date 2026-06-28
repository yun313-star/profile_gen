-- Private buckets for source selfies and generated outputs.
insert into storage.buckets (id, name, public)
values ('selfies', 'selfies', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('outputs', 'outputs', false)
on conflict (id) do nothing;

-- Owner-scoped access: object path is "<uid>/<...>" so first folder segment must equal auth.uid().
create policy "selfies_owner_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "outputs_owner_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text);
