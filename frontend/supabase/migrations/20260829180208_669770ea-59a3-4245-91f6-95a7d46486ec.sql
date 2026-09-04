drop policy if exists "authenticated write logos" on storage.objects;
drop policy if exists "authenticated update logos" on storage.objects;
drop policy if exists "authenticated delete logos" on storage.objects;

create policy "logos owner read" on storage.objects for select to authenticated
using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "logos owner insert" on storage.objects for insert to authenticated
with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "logos owner update" on storage.objects for update to authenticated
using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "logos owner delete" on storage.objects for delete to authenticated
using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);