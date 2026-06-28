# Backlog

Features listed here are picked up automatically by the Planner agent.

**How to trigger planning:**
- **Single push**: add a new `##` section below and push to `main` — the Planner
  reads the diff, creates ordered GitHub issues for each new entry, and stops.
  It will not re-process entries that already have a matching issue.
- **Manual full-pass**: run the `Agent - Plan` workflow manually via the Actions UI
  and point it at this file to process all entries (with deduplication).
- **Ad-hoc idea**: open a GitHub issue with your idea, add the `plan` label — the
  Planner reads that issue and creates sub-issues from it.

After the Planner runs, review the created issues and add the `auto` label to each
one (in dependency order) to hand it off to the Implementer.

---

<!-- Add new features below. Use a ## heading per feature and describe the goal,
     the target user, and what "done" looks like. Be as specific or as vague as you
     like — the Planner will ask clarifying questions before creating issues if the
     idea is too ambiguous to decompose safely. -->

# Sunscout — Backlog del MVP

> **Stack:** Next.js (React, App Router, TypeScript) · FastAPI (Python 3.11+) · PostgreSQL · Prisma o SQLAlchemy según capa.
> **Mercado:** California (US). **Datos:** carga manual / CSV. **Única integración externa:** Google Solar.
> **Cómo leer este backlog:** cada tarea es autodescriptiva y pensada para ejecutarse por un agente sin contexto adicional. Respeta los IDs para las dependencias.

## Convenciones

- **ID:** `AREA-NN` (EPIC abreviado + número). Úsalo en `Depende de`.
- **Capa:** `DB` · `BE` (FastAPI) · `FE` (Next.js) · `INFRA` · `DOC`.
- **Cada tarea incluye:** objetivo, archivos/rutas a tocar, dependencias, criterios de aceptación (DoD) y notas técnicas.
- **Convención de rutas (asumida; ajustar al template):**
  - Backend: `backend/app/` (FastAPI), modelos en `backend/app/models/`, routers en `backend/app/routers/`, esquemas Pydantic en `backend/app/schemas/`, servicios en `backend/app/services/`.
  - Frontend: `frontend/src/app/` (App Router), componentes en `frontend/src/components/`, llamadas API en `frontend/src/lib/api/`.
  - Tests backend: `backend/tests/`. Tests frontend: `frontend/src/**/__tests__/`.

---

# EPIC 0 — Fundaciones del proyecto (INFRA)

### INFRA-01 — Adaptar el template base y estructura de monorepo
- **Capa:** INFRA
- **Objetivo:** Partir de la app template y dejar la estructura `frontend/` + `backend/` operativa con un “hello world” en ambos extremos.
- **Archivos/rutas:** raíz del repo, `frontend/`, `backend/`, `README.md`, `docker-compose.yml`.
- **Depende de:** —
- **DoD:**
  - `docker-compose up` levanta frontend (Next.js), backend (FastAPI) y Postgres.
  - `GET /health` del backend responde `200 {"status":"ok"}`.
  - La home de Next.js consume `/health` y muestra el estado.
- **Notas:** Documentar en el README los comandos de arranque y las variables de entorno necesarias.

### INFRA-02 — Configuración de entorno y secretos
- **Capa:** INFRA
- **Objetivo:** Gestión de variables de entorno para ambos servicios.
- **Archivos/rutas:** `backend/.env.example`, `frontend/.env.example`, `backend/app/config.py`.
- **Depende de:** INFRA-01
- **DoD:**
  - `.env.example` documenta: `DATABASE_URL`, `GOOGLE_SOLAR_API_KEY`, `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_API_BASE_URL`.
  - `config.py` carga y valida variables con Pydantic Settings; falla con error claro si falta una obligatoria.
- **Notas:** Las claves de Google nunca se exponen en el frontend salvo `GOOGLE_MAPS_API_KEY` (restringida por dominio/referrer).

### INFRA-03 — Conexión a Postgres y migraciones
- **Capa:** INFRA / DB
- **Objetivo:** Conexión a Postgres y framework de migraciones.
- **Archivos/rutas:** `backend/app/db.py`, `backend/alembic/`, `backend/alembic.ini`.
- **Depende de:** INFRA-01
- **DoD:**
  - Engine + sesión SQLAlchemy configurados.
  - Alembic inicializado; `alembic upgrade head` corre sin error sobre una BDD vacía.
- **Notas:** Una migración por cambio de esquema; nunca editar migraciones ya aplicadas.

### INFRA-04 — CI básico (lint + tests + migraciones)
- **Capa:** INFRA
- **Objetivo:** Pipeline que valide cada push.
- **Archivos/rutas:** `.github/workflows/ci.yml`.
- **Depende de:** INFRA-01
- **DoD:** El workflow corre lint (ruff + eslint), tests (pytest + vitest/jest) y `alembic upgrade head` sobre Postgres de servicio. Falla si algo falla.

---

# EPIC 1 — Base de datos y modelo de dominio (DB)

### DB-01 — Esquema: tabla `properties`
- **Capa:** DB
- **Objetivo:** Tabla de propiedades con los campos del CSV.
- **Archivos/rutas:** `backend/app/models/property.py`, migración Alembic.
- **Depende de:** INFRA-03
- **DoD:** Tabla `properties` con columnas: `id` (PK), `external_id` (del CSV), `address`, `lat`, `lon`, `solar_rooftop_area`, `building_area`, `parcel_area`, `stories`, `zoning`, `parcel_use`, `apn`, `structure_year_built`, `total_parcel_value`, `notes`, `created_at`, `updated_at`. Tipos numéricos correctos; campos de texto nullable.
- **Notas:** `lat`/`lon` como `Numeric`/`Float` separados (el CSV los trae juntos como “lat, lon”; se parsean en la importación). Índice en `external_id`.

### DB-02 — Esquema: tabla `companies` (empresas)
- **Capa:** DB
- **Objetivo:** Empresas reutilizables entre propiedades. Cualquier stakeholder es una empresa; la misma empresa (p. ej. Costco) puede ser stakeholder de muchas propiedades, por lo que no se duplica por propiedad.
- **Archivos/rutas:** `backend/app/models/company.py`, migración.
- **Depende de:** INFRA-03
- **DoD:** Tabla `companies` con: `id` (PK), `name`, `website`, `business_industry`, `annual_revenue`, `created_at`, `updated_at`. Índice único (o de deduplicación) por `name` (+ `website` si está) para poder reutilizar la empresa en varias propiedades.
- **Notas:** En la importación se hace upsert por nombre/website para no crear duplicados de la misma empresa.

### DB-03 — Esquema: tabla `stakeholders` (relación empresa↔propiedad)
- **Capa:** DB
- **Objetivo:** Modelar el rol que una empresa juega frente a una propiedad (Owner / Property Manager / Tenant).
- **Archivos/rutas:** `backend/app/models/stakeholder.py`, migración.
- **Depende de:** DB-01, DB-02
- **DoD:** Tabla `stakeholders` con: `id` (PK), `property_id` (FK→properties, cascade delete), `company_id` (FK→companies), `role` (enum: `owner` | `property_manager` | `tenant`), `created_at`. Restricción única `(property_id, role)` (un stakeholder por rol y propiedad). Índices en `property_id` y `company_id`.
- **Notas:** El stakeholder es solo la relación + rol; los datos de empresa viven en `companies` y los contactos en `leads`. En el MVP solo se materializa `owner`; el modelo soporta los tres roles.

### DB-04 — Esquema: tabla `leads` (personas de contacto)
- **Capa:** DB
- **Objetivo:** Personas de contacto con las que se interactúa (llamada, email, teléfono, LinkedIn). Una empresa tiene uno o más leads. Alimenta la pantalla Generate Leads.
- **Archivos/rutas:** `backend/app/models/lead.py`, migración.
- **Depende de:** DB-02
- **DoD:** Tabla `leads` con: `id` (PK), `company_id` (FK→companies, cascade delete), `name`, `job_title`, `email`, `phone`, `linkedin`, `lead_location`, `created_at`. Índice en `company_id`.
- **Notas:** Los leads cuelgan de la **empresa**, no de la propiedad: los decisores de Costco son los mismos en todas sus propiedades. La pantalla Generate Leads de una propiedad obtiene sus leads vía stakeholders → companies → leads. El caso “el stakeholder es un lead en sí mismo” = una empresa con un único lead que la representa. El rol (Owner/Tenant/PM) y la propiedad se derivan del stakeholder, no se duplican en el lead.

### DB-05 — Esquema: tabla `estimates`
- **Capa:** DB
- **Objetivo:** Persistir estimaciones generadas, incluido el resultado del lookup de Google Solar.
- **Archivos/rutas:** `backend/app/models/estimate.py`, migración.
- **Depende de:** DB-01
- **DoD:** Tabla `estimates` con: `id`, `property_id` (FK), inputs (`system_size_kw`, `price_per_watt`, `system_losses_pct`, `shading_pct`, `annual_consumption_kwh`, `blended_utility_rate`, `rate_escalation_pct`, `include_bess`, incentivos aplicados como JSON), outputs (`annual_production_kwh`, `system_cost`, `net_cost`, `annual_savings`, `savings_20yr`, `irr`, `npv`, `simple_payback_years`, `co2_offset_20yr`), `google_solar_raw` (JSONB), `status`, `created_at`, `updated_at`.
- **Notas:** `google_solar_raw` guarda la respuesta cruda de buildingInsights para no re-llamar a la API. Un estimate “vivo” por propiedad puede recalcularse en local.

### DB-06 — Seed de datos de ejemplo
- **Capa:** DB
- **Objetivo:** Datos de prueba para desarrollo (incluida la fila Costco del CSV de ejemplo).
- **Archivos/rutas:** `backend/app/seed.py`, `backend/data/sample_properties.csv`.
- **Depende de:** DB-01, DB-02, DB-03, DB-04
- **DoD:** `python -m app.seed` inserta ≥5 propiedades de California con su empresa owner y al menos un lead por empresa. Idempotente (no duplica en reruns).

### DB-07 — Esquema: tabla `industry_energy_benchmarks`
- **Capa:** DB
- **Objetivo:** Intensidad energética eléctrica (EUI) por tipo de industria, para estimar el consumo anual Class 5 a partir del Building Area.
- **Archivos/rutas:** `backend/app/models/industry_energy_benchmark.py`, migración.
- **Depende de:** INFRA-03
- **DoD:** Tabla `industry_energy_benchmarks` con: `id` (PK), `business_industry` (clave de cruce, coincide con `companies.business_industry`), `eui_kwh_per_sqft_year` (Numeric), `region` (`california` | `us`, default `us`), `source` (texto: p. ej. "CBECS 2018"), `notes`, `created_at`, `updated_at`. Índice único por `(business_industry, region)`.
- **Notas:** Solo consumo **eléctrico** (kWh), no energía total. En el MVP el cruce es directo `business_industry` ↔ `business_industry` (sin tabla de mapeo). Las cifras se cargan por CSV (ver CSV-05); puede crearse vacía y poblarse después.

---

# EPIC 2 — Importación de CSV (BE + FE)

### CSV-01 — Definir y documentar la plantilla CSV canónica
- **Capa:** DOC
- **Objetivo:** Plantilla CSV oficial que reproduce la estructura del ejemplo (propiedad + 3 bloques de stakeholder repetidos).
- **Archivos/rutas:** `backend/data/template.csv`, `docs/csv-format.md`.
- **Depende de:** DB-01, DB-02, DB-03, DB-04
- **DoD:** Documento que lista cada columna, su tipo, si es obligatoria y a qué campo de BDD mapea. Incluye la fila de cabecera exacta y una fila de ejemplo (Costco).
- **Notas:** Los tres bloques de stakeholder comparten nombres de columna (`Name, Phone, Email, Linkedin, Website, Business Industry, Annual Revenue, Leads`); se distinguen por posición/orden (Owner, luego Property Manager, luego Tenant).

### CSV-02 — Parser y validador de CSV (backend)
- **Capa:** BE
- **Objetivo:** Servicio que parsea un CSV subido, valida y mapea a las tablas.
- **Archivos/rutas:** `backend/app/services/csv_import.py`, `backend/tests/test_csv_import.py`.
- **Depende de:** CSV-01, DB-04
- **DoD:**
  - Parsea la cabecera canónica; separa el bloque de propiedad de los 3 bloques de stakeholder por posición.
  - Parsea `lat, lon` desde el campo combinado.
  - Por cada bloque de stakeholder no vacío: upsert de la empresa (`companies`) por nombre/website, creación del `stakeholder` (property + company + role) y de su(s) `lead(s)`.
  - Valida tipos numéricos y reporta errores por fila (sin abortar todo el lote).
  - Devuelve un resumen: filas OK, filas con error y motivo.
  - Tests cubren: fila válida (Costco), lat/lon malformado, número no parseable, stakeholders vacíos, y reutilización de la misma empresa en dos propiedades (no se duplica).
- **Notas:** Upsert de propiedad por `external_id` y de empresa por nombre/website para permitir reimportar sin duplicar.

### CSV-03 — Endpoint de importación
- **Capa:** BE
- **Objetivo:** `POST /api/imports/csv` que recibe un archivo y dispara la importación.
- **Archivos/rutas:** `backend/app/routers/imports.py`, `backend/tests/test_imports_endpoint.py`.
- **Depende de:** CSV-02
- **DoD:** Acepta `multipart/form-data` con un `.csv`; responde `200` con el resumen de CSV-02; responde `422` con detalle si el archivo es inválido. Test de integración con un CSV de ejemplo.

### CSV-04 — UI de importación de CSV
- **Capa:** FE
- **Objetivo:** Pantalla de administración para subir el CSV y ver el resultado.
- **Archivos/rutas:** `frontend/src/app/admin/import/page.tsx`, `frontend/src/lib/api/imports.ts`.
- **Depende de:** CSV-03
- **DoD:** Input de archivo + botón Subir; llama al endpoint; muestra resumen (OK/errores) en tabla; permite descargar la plantilla (CSV-01). Estados de carga y error visibles.

### CSV-05 — Importación de la tabla de benchmarks de consumo
- **Capa:** BE + FE
- **Objetivo:** Cargar por CSV la intensidad energética (EUI) por industria a la tabla `industry_energy_benchmarks`.
- **Archivos/rutas:** `backend/app/services/benchmarks_import.py`, `backend/app/routers/imports.py`, `docs/benchmarks-csv-format.md`, `frontend/src/app/admin/import/page.tsx` (sección adicional).
- **Depende de:** DB-07, CSV-03
- **DoD:**
  - Endpoint `POST /api/imports/benchmarks` que acepta un CSV con columnas: `business_industry`, `eui_kwh_per_sqft_year`, `region`, `source`, `notes`.
  - Upsert por `(business_industry, region)`; valida que el EUI sea numérico y positivo; reporta errores por fila.
  - Plantilla y formato documentados.
  - UI: segunda zona de subida en la pantalla de import para los benchmarks.
- **Notas:** **TODO:** las cifras reales de EUI las proporcionará el cliente más adelante (CBECS/CEUS). La tarea entrega el mecanismo de carga; la tabla puede quedar vacía hasta entonces.

---

# EPIC 3 — API de propiedades y leads (BE)

### BE-01 — Listado de propiedades con filtros, orden y paginación
- **Capa:** BE
- **Objetivo:** `GET /api/properties` que alimenta la pantalla Results.
- **Archivos/rutas:** `backend/app/routers/properties.py`, `backend/app/schemas/property.py`, `backend/tests/test_properties_list.py`.
- **Depende de:** DB-06
- **DoD:**
  - Query params: `industry`, `city`, `sort_by` (`rooftop_area`|`building_area`|`leads`|`company_name`), `order` (`asc`|`desc`), `page`, `page_size`.
  - Responde con items + total + página. Cada item incluye métricas de área, empresa owner (vía stakeholder role=owner → company), industria, ciudad, nº de leads y flag `has_estimate`.
  - Tests para filtro, orden y paginación.
- **Notas:** `nº de leads` = count de leads de las empresas stakeholder de la propiedad. `has_estimate` = existe estimate.

### BE-02 — Detalle de propiedad
- **Capa:** BE
- **Objetivo:** `GET /api/properties/{id}` con propiedad + stakeholders (con su empresa) + estimate vigente.
- **Archivos/rutas:** `backend/app/routers/properties.py`, `backend/tests/test_property_detail.py`.
- **Depende de:** DB-05
- **DoD:** Devuelve todos los campos de la propiedad, sus stakeholders con la empresa asociada (owner en el MVP), y el estimate más reciente si existe. `404` si no existe.

### BE-03 — Listado de leads por propiedad
- **Capa:** BE
- **Objetivo:** `GET /api/properties/{id}/leads` para la pantalla Generate Leads.
- **Archivos/rutas:** `backend/app/routers/leads.py`, `backend/tests/test_leads_list.py`.
- **Depende de:** DB-04
- **DoD:** Resuelve los leads de la propiedad vía stakeholders → companies → leads. Filtros `job_title`, `role` (owner/tenant/pm), `location`, búsqueda libre `q`; paginación 25/página. Cada lead incluye su empresa y el rol del stakeholder. Tests de filtros y paginación.

### BE-04 — Export CSV de leads
- **Capa:** BE
- **Objetivo:** `GET /api/properties/{id}/leads/export` que devuelve CSV.
- **Archivos/rutas:** `backend/app/routers/leads.py`.
- **Depende de:** BE-03
- **DoD:** Devuelve `text/csv` con los leads (respetando filtros aplicados). Cabeceras correctas para descarga.

---

# EPIC 4 — Integración Google Solar (BE)

### SOLAR-01 — Cliente de Google Solar (buildingInsights)
- **Capa:** BE
- **Objetivo:** Servicio que llama a buildingInsights por lat/lon y normaliza la respuesta.
- **Archivos/rutas:** `backend/app/services/google_solar.py`, `backend/tests/test_google_solar.py`.
- **Depende de:** INFRA-02
- **DoD:**
  - Función `get_building_insights(lat, lon) -> dict` que llama al endpoint con `GOOGLE_SOLAR_API_KEY`.
  - Maneja `NOT_FOUND` (~5% de edificios sin datos) devolviendo un resultado tipado “sin datos” en vez de excepción.
  - Extrae: segmentos de tejado, capacidad de paneles, área utilizable, producción anual estimada.
  - Tests con respuesta mockeada (OK y NOT_FOUND). Nunca llama a la API real en tests.
- **Notas:** Respetar límite 600 qpm. No usar `dataLayers` (más caro) salvo necesidad explícita de GeoTIFF.

### SOLAR-02 — Motor de cálculo financiero/energético
- **Capa:** BE
- **Objetivo:** Cálculo determinista de producción y economía a partir de inputs + datos solares.
- **Archivos/rutas:** `backend/app/services/estimate_engine.py`, `backend/tests/test_estimate_engine.py`.
- **Depende de:** SOLAR-01, DB-07
- **DoD:**
  - Funciones puras: `estimated_annual_consumption(building_area, eui)` (= building_area × EUI, solo eléctrico), `annual_production(size, losses, shading)`, `system_cost(size, price_per_watt)`, `apply_incentives(cost, incentives)`, `annual_savings(...)`, `cashflows_20yr(...)`, `npv(...)`, `irr_bisection(...)`, `simple_payback(...)`, `co2_offset(production)` (~0.35 kg/kWh).
  - IRR por bisección con tolerancia documentada.
  - Incentivos California fijos: ITC federal + SGIP (constantes en un módulo `incentives_ca.py`).
  - Tests con valores conocidos y casos límite (payback infinito, IRR sin solución, EUI ausente).
- **Notas:** Funciones puras y sin I/O para poder recalcular en local desde el frontend con la misma lógica si hace falta replicarla. El EUI lo provee la capa de servicio (lookup en `industry_energy_benchmarks` por `business_industry`), no la función pura.

### SOLAR-03 — Endpoint de generación y recálculo de estimate
- **Capa:** BE
- **Objetivo:** Crear y recalcular estimaciones.
- **Archivos/rutas:** `backend/app/routers/estimates.py`, `backend/tests/test_estimates.py`.
- **Depende de:** SOLAR-02, DB-05
- **DoD:**
  - `POST /api/properties/{id}/estimate` → hace **un** lookup a Google Solar (si no hay `google_solar_raw` previo), calcula y persiste. Reusa `google_solar_raw` si ya existe.
  - Al crear, autocompleta `annual_consumption_kwh` = Building Area × EUI (lookup en `industry_energy_benchmarks` por la industria del owner). Si el usuario envía un valor manual, ese prevalece. Si no hay EUI para la industria, deja el campo vacío y marca el motivo.
  - `PUT /api/estimates/{id}` → recalcula con nuevos inputs (sliders) **sin** volver a llamar a Google Solar.
  - Tests verifican que el segundo cálculo NO invoca el cliente solar, y que el autocompletado de consumo y el override manual funcionan.
- **Notas:** Es la regla de coste clave: 1 lookup por propiedad; los sliders recalculan sobre datos persistidos.

---

# EPIC 5 — Frontend: layout y navegación (FE)

### FE-01 — Layout principal y navegación por pestañas
- **Capa:** FE
- **Objetivo:** Shell de la app con las pestañas del MVP: Find Leads · Results · RFP (+ acceso a Admin/Import).
- **Archivos/rutas:** `frontend/src/app/layout.tsx`, `frontend/src/components/TabNav.tsx`.
- **Depende de:** INFRA-01
- **DoD:** Navegación entre rutas funcionando, estado activo visible, responsive básico.

### FE-02 — Cliente API y manejo de estados
- **Capa:** FE
- **Objetivo:** Capa central de llamadas al backend con manejo de loading/error.
- **Archivos/rutas:** `frontend/src/lib/api/client.ts`, hook `useApi`.
- **Depende de:** INFRA-02
- **DoD:** Wrapper de `fetch` con base URL desde env, tipado de respuestas, manejo uniforme de errores. Usado por el resto de pantallas.

---

# EPIC 6 — Frontend: Find Leads (FE)

### FE-03 — Pestaña Find Leads con Google Maps de demostración
- **Capa:** FE
- **Objetivo:** Mapa centrado en una zona de California con edificaciones; sin búsqueda funcional.
- **Archivos/rutas:** `frontend/src/app/find-leads/page.tsx`, `frontend/src/components/MapView.tsx`.
- **Depende de:** FE-01, INFRA-02
- **DoD:** Carga Google Maps JS con `GOOGLE_MAPS_API_KEY`, centrado en un punto de California (p. ej. Santa Clara) con zoom que muestre edificaciones (vista satélite). Incluye nota visible de “vista de demostración”.
- **Notas:** La búsqueda por zona/industria/nombre se documenta como “aplazado”, no se implementa.

---

# EPIC 7 — Frontend: Properties Results (FE)

### FE-04 — Grid de resultados de propiedades
- **Capa:** FE
- **Objetivo:** Pantalla Results consumiendo `GET /api/properties`.
- **Archivos/rutas:** `frontend/src/app/results/page.tsx`, `frontend/src/components/PropertyCard.tsx`.
- **Depende de:** BE-01, FE-02
- **DoD:** Grid de tarjetas con thumbnail, empresa, industria, ciudad, nº de leads y métricas de área; badge estimated/no-estimated; estados loading/empty/error.

### FE-05 — Filtros, orden y paginación en Results
- **Capa:** FE
- **Objetivo:** Controles de filtro/orden/paginación enlazados a la API.
- **Archivos/rutas:** `frontend/src/app/results/page.tsx`, `frontend/src/components/ResultsToolbar.tsx`.
- **Depende de:** FE-04
- **DoD:** Filtros por industria/ubicación, sort por las 4 claves (asc/desc), “Load more” o paginación. Cambios reflejan en la query a la API. Chips de filtro eliminables.

---

# EPIC 8 — Frontend: Create Estimate (FE)

### FE-06 — Pantalla Estimate: panel de inputs (acordeón)
- **Capa:** FE
- **Objetivo:** Formulario en acordeón con todas las secciones de input.
- **Archivos/rutas:** `frontend/src/app/properties/[id]/estimate/page.tsx`, `frontend/src/components/estimate/InputsPanel.tsx`.
- **Depende de:** BE-02, FE-02
- **DoD:** Secciones General / Property / Energy Usage / PV System / Include BESS / Applicable Incentives, precargadas desde el detalle de propiedad. Autosave (debounced) que crea/actualiza el estimate. En Energy Usage, el campo Annual Energy Consumption llega autocompletado desde el backend (Building Area × EUI); el usuario puede editarlo, y la UI indica cuándo el valor es estimado vs. manual. Si no hay EUI para la industria, muestra aviso y exige entrada manual.

### FE-07 — Pantalla Estimate: panel de resultados y economía
- **Capa:** FE
- **Objetivo:** Mostrar Project Economics + mapa de parcela.
- **Archivos/rutas:** `frontend/src/components/estimate/ResultsPanel.tsx`.
- **Depende de:** SOLAR-03, FE-06
- **DoD:** Muestra Annual Savings, 20-Yr Savings, IRR, NPV, Simple Payback, CO2; color por tier; mapa con boundary de parcela y footprint dimensionado al sistema. Maneja el caso “sin datos solares”.

### FE-08 — Pantalla Estimate: sliders de ajuste (recálculo local)
- **Capa:** FE
- **Objetivo:** Sliders Adjust Estimate + Advanced que recalculan vía `PUT /api/estimates/{id}` sin re-llamar a Google Solar.
- **Archivos/rutas:** `frontend/src/components/estimate/AdjustSliders.tsx`.
- **Depende de:** FE-07
- **DoD:** Price/Watt ($2.50–5.00), System Size (50–250 kW, tope = max tejado), Shading (0–30%), Blended Utility Rate, Rate Escalation, Annual Consumption. Cada cambio actualiza resultados (debounced). Verificable que no dispara lookup solar.
- **Notas:** Acciones de la pantalla: Back · Share · Export PDF · Save · Get Leads (Export PDF puede ser stub que enlaza a EPIC 10).

---

# EPIC 9 — Frontend: Generate Leads (FE)

### FE-09 — Tabla de leads (decision-makers)
- **Capa:** FE
- **Objetivo:** Pantalla Generate Leads consumiendo `GET /api/properties/{id}/leads`.
- **Archivos/rutas:** `frontend/src/app/properties/[id]/leads/page.tsx`, `frontend/src/components/leads/LeadsTable.tsx`.
- **Depende de:** BE-03, FE-02
- **DoD:** Tabla con Job Title, Lead Location, Role (rol del stakeholder), Company, Name, Email, Phone, LinkedIn. Paginación 25/pág. Selección múltiple.
- **Notas:** Company viene de la empresa del lead; Role viene del stakeholder (owner en el MVP). En el MVP los datos NO se difuminan (vienen de la BDD propia del cliente); el gating de pago queda como decisión posterior.

### FE-10 — Filtros, export y acciones de leads
- **Capa:** FE
- **Objetivo:** Filtros + Save Lead List + Export CSV + modal Set Appointments.
- **Archivos/rutas:** `frontend/src/components/leads/LeadsToolbar.tsx`, `frontend/src/components/leads/AppointmentsModal.tsx`.
- **Depende de:** FE-09, BE-04
- **DoD:** Filtros (Job Title, Relationship, ubicación, búsqueda); Export CSV llama a BE-04; modal con (a) Handle In-House → My Leads, (b) Let Our Experts Handle It → CTA. “My Leads” puede ser una vista simple persistida en BDD o estado local en el MVP (documentar cuál).

---

# EPIC 10 — Frontend: RFP (FE)

### FE-11 — Pestaña RFP (formulario básico)
- **Capa:** FE
- **Objetivo:** Pestaña RFP con formulario para abrir conversación.
- **Archivos/rutas:** `frontend/src/app/rfp/page.tsx`, `frontend/src/components/rfp/RfpForm.tsx`.
- **Depende de:** FE-01, BE-02
- **DoD:** Formulario con: datos de propiedad/organización (precargados si se llega desde una propiedad), alcance solicitado (tipo de sistema, tamaño aprox., incluir BESS), datos de contacto, notas. Botón “Generar/Enviar RFP”.
- **Notas:** En el MVP el envío puede generar un resumen/PDF o simplemente persistir la RFP; definir el destino exacto en BE-05.

### BE-05 — Persistencia de RFP
- **Capa:** BE / DB
- **Objetivo:** Guardar las RFP generadas.
- **Archivos/rutas:** `backend/app/models/rfp.py`, `backend/app/routers/rfp.py`, migración.
- **Depende de:** DB-01
- **DoD:** Tabla `rfps` (id, property_id nullable, payload JSON, contacto, status, created_at). `POST /api/rfp` valida y persiste; `GET /api/rfp/{id}` recupera. Tests básicos.

---

# EPIC 11 — Export e infraestructura de soporte

### EXP-01 — Export PDF del estimate
- **Capa:** BE
- **Objetivo:** Generar un PDF del estimate (Project Economics + datos de propiedad).
- **Archivos/rutas:** `backend/app/services/pdf_export.py`, `backend/app/routers/estimates.py`.
- **Depende de:** SOLAR-03
- **DoD:** `GET /api/estimates/{id}/pdf` devuelve un PDF con los resultados. Render server-side (p. ej. WeasyPrint o reportlab).

### QA-01 — Tests end-to-end del flujo principal
- **Capa:** INFRA
- **Objetivo:** E2E del flujo Results → Estimate → Leads.
- **Archivos/rutas:** `frontend/e2e/` (Playwright).
- **Depende de:** FE-09, FE-08
- **DoD:** Un test recorre: abrir Results, abrir una propiedad, generar estimate (con Google Solar mockeado), ajustar un slider, ir a Leads, exportar CSV. Verde en CI.

---

## Orden sugerido de ejecución (rutas críticas)

1. **Fundaciones:** INFRA-01 → INFRA-02 → INFRA-03 → (INFRA-04)
2. **Datos:** DB-01 → DB-02 (companies) → DB-03 (stakeholders) → DB-04 (leads) → DB-05 (estimates) → DB-06 (seed) → DB-07 (benchmarks EUI)
3. **Importación (paralelizable):** CSV-01 → CSV-02 → CSV-03 → CSV-04 · CSV-05 (benchmarks, tras DB-07)
4. **API core:** BE-01 → BE-02 → BE-03 → BE-04
5. **Solar y consumo:** SOLAR-01 → SOLAR-02 → SOLAR-03
6. **Frontend base:** FE-01 → FE-02
7. **Pantallas:** FE-03 (Find Leads) · FE-04/FE-05 (Results) · FE-06/FE-07/FE-08 (Estimate) · FE-09/FE-10 (Leads) · FE-11/BE-05 (RFP)
8. **Soporte:** EXP-01 · QA-01

## Decisiones pendientes señaladas en el backlog

- **Modelo de leads (RESUELTO):** Property → Stakeholder (rol) → Company → Lead(s). Los leads cuelgan de la empresa; una empresa puede ser stakeholder de varias propiedades y tener varios leads; un stakeholder puede ser su propio lead (empresa con un único lead). Reflejado en DB-02/03/04 y CSV-02.
- **Cálculo de consumo (RESUELTO):** Annual Consumption = Building Area × EUI por industria (solo eléctrico), autocompletado y sobrescribible. EUI en tabla `industry_energy_benchmarks`, cruce directo por `business_industry`. Reflejado en DB-07, CSV-05, SOLAR-02/03 y FE-06.
- **Cifras de EUI** (CSV-05): **TODO** — las proporcionará el cliente por CSV más adelante (CBECS/CEUS). El mecanismo de carga queda listo; la tabla puede arrancar vacía.
- **Extracción de leads del campo `Leads` del CSV** (CSV-02): definir el formato exacto de ese campo (¿número, lista de nombres, JSON?) para saber cuántos leads se generan por empresa.
- **Gating de pago en Generate Leads:** fuera del MVP (datos propios), pero conviene fijar si se reintroduce y cómo.
- **“My Leads” (FE-10):** persistido en BDD vs estado local en el MVP.
- **Salida de la RFP (FE-11/BE-05):** PDF, email o solo persistencia.
