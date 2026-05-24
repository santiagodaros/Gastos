# SDD Roadmap: Refactor de Gestor Gastos

Este es el plan de acción maestro guardado en tu carpeta del proyecto para asegurar la persistencia y que podamos retomarlo en cualquier momento.

**Misión**: Migrar de un monolito `gestor_gastos.pyw` de Tkinter, a una aplicación moderna 100% desacoplada con FastAPI y UI en React + Tauri (usando Vanilla CSS). Manteniendo **PARIDAD TOTAL** de funcionalidades. Ningún feature existente debe perderse.

## Fase 1: Motor de Backend Puro (Isolado) ✅ COMPLETA
El objetivo de esta fase es extraer las entrañas de Tkinter sin romperlo y exponerlas como una API HTTP consumible.
- [x] Crear el proyecto `/api` (FastAPI).
- [x] Conectar la nueva API a la base de datos `finanzas.db` existente a través de `api/dependencies.py`.
- [x] Crear modelos iniciales Pydantic (`gastos_mensuales`, `fijos`).
- [x] Extraer funciones lógicas del `.pyw` al FastAPI:
  - [x] Lógica de cotización Dólar Oficial (`dolarapi.com`) — `api/services/dolar.py` con caché in-memory 1h.
  - [x] Funciones de Resumen (`_resumen`, `_ing`, etc.) — `api/routers/resumen.py`.
  - [x] Clonado de mes — `POST /api/resumen/clonar/{anio}/{mes}`.
- [x] Escribir los Routers (CRUD completo de tarjetas, metas de ahorro, sueldos y cuotas).
- [x] Probar la API de forma aislada para asegurar paridad 1:1. — resumen 3/2026 verificado: números idénticos al monolito.

## Fase 2: Chasis del Frontend (Integración) ✅ COMPLETA
El objetivo es levantar Tauri con React comunicándose con la nueva API Python.
- [x] Crear el esqueleto en la carpeta `/frontend` con `create-tauri-app` (React/Vite/TS).
- [x] Configurar llamadas HTTP strict mode desde el front — CSP null en tauri.conf.json, CORS wildcard en FastAPI.
- [x] Integrar un cliente TypeScript (`api_client.ts`) — tipos 1:1 con schemas.py, todos los endpoints.
- [x] Configurar compilación en paralelo — `npm run dev:full` (concurrently uvicorn + tauri dev).

## Fase 3: Diseño Premium (Vanilla CSS) 🔄 EN PROGRESO
El objetivo visual, armar la interfaz más linda posible, superior a lo actual y usando sólo variables nativas.
- [x] Archivo base de Tokens CSS (`src/styles/tokens.css`) — paleta dark profesional, espaciados, tipografía.
- [x] Reset CSS minimal (`src/styles/reset.css`) — scrollbar custom, base limpia.
- [x] Sidebar colapsable dinámicamente con React State (`src/components/Sidebar.tsx`).
- [x] Layout principal con Topbar (`src/components/Layout.tsx`).
- [x] Card + MetricCard con Glassmorphism sutil (`src/components/Card.tsx`).
- [x] DonutChart SVG puro con animación de entrada (`src/components/DonutChart.tsx`).
- [x] Dashboard conectado a API real — métricas, donut, barras de composición (`src/views/Dashboard/`).
- [x] Vistas ABM completas: GastosMensuales, Fijos, Cuotas, Sueldos — CRUD con modal de confirmación de borrado.
- [x] Metas de Ahorro — grid de cards con barra de progreso y modal de depósito.
- [x] Modal animado compartido (`Modal.tsx`) + `ConfirmModal`.
- [x] `PeriodSelector` reutilizable, `abm.css` sistema de estilos compartido.

## Fase 3: ✅ COMPLETA

## Fase 4: Desacople final (Eliminación Monolito)
Donde el hijo mata al padre y queda como versión final de escritorio profesional de "Gastos".
- [ ] Paridad de test de usuario manual. (Ver que ingresos == egresos y den los mismos números en ambas versiones).
- [ ] Eliminar definitivamente `gestor_gastos.pyw`.
- [ ] Archivar progreso en `@engram` como el SDD concluido.
- [ ] Configurar un `RUN.bat` o macro para levantar la versión instalada en Windows para producción.

## Fase 5: Analítica Avanzada y Reportes (Nuevas Funcionalidades)
Acá es donde pasas de tener un "registro" a una verdadera herramienta de inteligencia financiera personal.
- [ ] **Gráficos Históricos (Tendencias)**: Gráfico de líneas (Line Chart) que muestre la evolución del patrimonio y la comparativa Gastos vs Ingresos a lo largo de un año entero.
- [ ] **Buscador Global (Spotlight)**: Un modal tipo Cmd/Ctrl + K que te permita buscar cualquier gasto o concepto histórico sin importar en qué mes estás parado.
- [ ] **Exportación de Datos**: Botón para exportar reportes mensuales o anuales a PDF y CSV/Excel, ideal para uso personal pesado o contador.
- [ ] **Módulo de Proyección / Inflación**: Tomar datos del IPC (inflación) y poder ver los gráficos históricos "ajustados a moneda constante" o proyectar cuánto necesitarás el mes que viene.

## Fase 6: UI/UX Premium y Micro-interacciones (Estética)
Estos son los detalles que le dan una sensación de app de "clase mundial".
- [ ] **Skeleton Loaders**: Reemplazar los textos de "Cargando..." o spinners horribles por esqueletos animados que simulan el layout de las tablas o las tarjetas mientras la API responde.
- [ ] **Sistema de Toast Notifications**: Alertas no intrusivas flotantes (abajo a la derecha) con barra de progreso de vida útil, para confirmar cuando algo se guarda, edita o elimina con éxito.
- [ ] **Soporte Light/Dark Mode Nativo**: Un toggle en el sidebar que cambie las paletas de `tokens.css` y que por defecto respete la configuración nativa de tu Windows.
- [ ] **Animaciones de Transición (View Transitions)**: Hacer que navegar del Dashboard a una pestaña de ABM no sea un corte seco, sino un 'fade' suave y elegante usando CSS puro.

## Fase 7: Robustez Máxima (Producción)
Para no perder nunca un registro financiero y dormir tranquilo.
- [ ] **Backups Automáticos DB**: Un script o cron dentro de FastAPI que semanalmente haga una copia de `finanzas.db` con timestamp en una carpeta de tu OneDrive automáticamente.
- [ ] **Release de Ejecutable (CI/CD)**: Ahora sí, un workflow de GitHub que cuando hacés un *release*, te compile automáticamente tu app de Tauri y te devuelva un `.msi` o `.exe` oficial instalable.
