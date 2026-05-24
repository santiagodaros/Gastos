-- ============================================================
-- Gestor Gastos — Supabase schema
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- gastos_mensuales
CREATE TABLE gastos_mensuales (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    mes         INTEGER NOT NULL,
    anio        INTEGER NOT NULL,
    nombre      TEXT NOT NULL,
    monto       FLOAT NOT NULL,
    categoria   TEXT NOT NULL DEFAULT 'General',
    moneda      TEXT NOT NULL DEFAULT 'ARS',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE gastos_mensuales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON gastos_mensuales FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- gastos_fijos (modelo temporal: grupo_id agrupa versiones del mismo gasto)
CREATE TABLE gastos_fijos (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    grupo_id    BIGINT NOT NULL DEFAULT 0,
    nombre      TEXT NOT NULL,
    monto       FLOAT NOT NULL,
    activo      INTEGER NOT NULL DEFAULT 1,
    moneda      TEXT NOT NULL DEFAULT 'ARS',
    mes         INTEGER NOT NULL,
    anio        INTEGER NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE gastos_fijos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON gastos_fijos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ingresos
CREATE TABLE ingresos (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    mes         INTEGER NOT NULL,
    anio        INTEGER NOT NULL,
    sueldo      FLOAT NOT NULL DEFAULT 0,
    otros       FLOAT NOT NULL DEFAULT 0,
    UNIQUE(user_id, mes, anio)
);
ALTER TABLE ingresos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON ingresos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- tarjetas
CREATE TABLE tarjetas (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    nombre      TEXT NOT NULL,
    tipo        TEXT NOT NULL DEFAULT 'VISA',
    ultimos_4   TEXT NOT NULL DEFAULT '',
    activa      INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE tarjetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON tarjetas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- cuotas
CREATE TABLE cuotas (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    nombre          TEXT NOT NULL,
    monto_cuota     FLOAT NOT NULL,
    cuota_actual    INTEGER NOT NULL,
    total_cuotas    INTEGER NOT NULL,
    mes_inicio      INTEGER NOT NULL,
    anio_inicio     INTEGER NOT NULL,
    activa          INTEGER NOT NULL DEFAULT 1,
    moneda          TEXT NOT NULL DEFAULT 'ARS',
    tarjeta_id      BIGINT REFERENCES tarjetas(id) ON DELETE SET NULL
);
ALTER TABLE cuotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON cuotas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- cuotas_pausadas
CREATE TABLE cuotas_pausadas (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    cuota_id    BIGINT REFERENCES cuotas(id) ON DELETE CASCADE NOT NULL,
    mes         INTEGER NOT NULL,
    anio        INTEGER NOT NULL,
    UNIQUE(user_id, cuota_id, mes, anio)
);
ALTER TABLE cuotas_pausadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON cuotas_pausadas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- metas_ahorro
CREATE TABLE metas_ahorro (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    nombre          TEXT NOT NULL,
    objetivo        FLOAT NOT NULL,
    acumulado       FLOAT NOT NULL DEFAULT 0,
    fecha_limite    DATE,
    prioridad       INTEGER NOT NULL DEFAULT 50,
    activa          INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE metas_ahorro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON metas_ahorro FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- depositos_ahorro
CREATE TABLE depositos_ahorro (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    meta_id     BIGINT REFERENCES metas_ahorro(id) ON DELETE CASCADE NOT NULL,
    monto       FLOAT NOT NULL,
    fecha       DATE NOT NULL DEFAULT CURRENT_DATE
);
ALTER TABLE depositos_ahorro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON depositos_ahorro FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- categorias
CREATE TABLE categorias (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    nombre      TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#6366f1',
    activa      INTEGER NOT NULL DEFAULT 1,
    UNIQUE(user_id, nombre)
);
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON categorias FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
