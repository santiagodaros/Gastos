-- ============================================================
-- Transferencias con comprobante (bot foto + caption)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Medio de pago libre (ej: 'transferencia') + ruta del comprobante en Storage.
ALTER TABLE gastos_mensuales ADD COLUMN IF NOT EXISTS medio TEXT;
ALTER TABLE gastos_mensuales ADD COLUMN IF NOT EXISTS comprobante_url TEXT;

-- Bucket privado para los comprobantes.
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', false)
ON CONFLICT (id) DO NOTHING;

-- El dueño puede leer sus propios comprobantes (ruta = <user_id>/archivo).
-- El bot sube con service_role (saltea RLS), así que no necesita policy de insert.
DROP POLICY IF EXISTS "own comprobantes" ON storage.objects;
CREATE POLICY "own comprobantes" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);
