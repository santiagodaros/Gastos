-- ============================================================
-- Comprobantes para todos los gastos: permisos de escritura + cuotas
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- (Requiere haber corrido antes comprobantes.sql, que crea el bucket)
-- ============================================================

-- La app (sesión del usuario) puede subir/actualizar/borrar sus comprobantes.
DROP POLICY IF EXISTS "insert comprobantes" ON storage.objects;
CREATE POLICY "insert comprobantes" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "update comprobantes" ON storage.objects;
CREATE POLICY "update comprobantes" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "delete comprobantes" ON storage.objects;
CREATE POLICY "delete comprobantes" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Comprobante también en cuotas (factura de la compra).
ALTER TABLE cuotas ADD COLUMN IF NOT EXISTS comprobante_url TEXT;
