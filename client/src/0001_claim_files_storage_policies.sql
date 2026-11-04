
CREATE POLICY "claim-files: owner upload to own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'claim-files' AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.owns_editable_claim(((storage.foldername(name))[2])::uuid));
CREATE POLICY "claim-files: owner or admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'claim-files' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "claim-files: owner delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'claim-files' AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.owns_editable_claim(((storage.foldername(name))[2])::uuid));
