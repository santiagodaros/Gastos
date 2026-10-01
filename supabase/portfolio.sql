-- ============================================================
-- Moneda por meta + cartera de posiciones (qué hay invertido en cada una)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- moneda en la que se expresa la meta/inversión: 'ARS' | 'USD'
ALTER TABLE metas_ahorro ADD COLUMN IF NOT EXISTS moneda TEXT NOT NULL DEFAULT 'ARS';

-- posiciones: instrumentos concretos dentro de una meta/inversión
--   tipo:   fci | accion | cedear | bono | on | crypto | plazo_fijo | otro
--   ticker: símbolo (GGAL, AL30, YMCID...), nombre exacto del FCI, o id de CoinGecko (bitcoin)
--   precio_compra: PPC por unidad tal como cotiza (bonos/ON: por 100 VN)
CREATE TABLE IF NOT EXISTS posiciones (
    id             BIGSERIAL PRIMARY KEY,
    user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    meta_id        BIGINT REFERENCES metas_ahorro(id) ON DELETE CASCADE NOT NULL,
    tipo           TEXT NOT NULL DEFAULT 'accion',
    ticker         TEXT NOT NULL,
    nombre         TEXT,
    cantidad       FLOAT NOT NULL DEFAULT 0,
    precio_compra  FLOAT NOT NULL DEFAULT 0,
    moneda         TEXT NOT NULL DEFAULT 'ARS'
);
ALTER TABLE posiciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own" ON posiciones;
CREATE POLICY "own" ON posiciones FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
