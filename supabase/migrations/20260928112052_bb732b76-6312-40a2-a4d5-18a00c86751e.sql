CREATE POLICY "Finance managers read attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'finance-attachments' AND public.can_manage_finance(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Finance managers upload attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'finance-attachments' AND public.can_manage_finance(auth.uid(), ((storage.foldername(name))[1])::uuid));