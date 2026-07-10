# Gestión de Viáticos (Relación de Gastos)

Aplicación SAP Fiori/SAPUI5 para que empleados
registren gastos de viaje (viáticos) capturando o cargando facturas, extrayendo sus
datos por OCR, validándolos ante la DIAN y enviándolos para aprobación de un analista
financiero.

- **App ID:** `com.ccb.viaticos`
- **Namespace de código:** `com/ccb/viaticos`
- **Framework:** SAPUI5 1.120.1 (freestyle, sin OData — todo el backend se consume vía `fetch`/`XMLHttpRequest`)
- **Despliegue objetivo:** SAP BTP Cloud Foundry, HTML5 App Repository, vía MTA

## 1. Arquitectura general

```
webapp/
├── Component.js          # Punto de entrada: modelos globales, servicios, router
├── manifest.json          # Descriptor de la app: rutas, modelos, dependencias UI5
├── index.html              # Bootstrap standalone (SAPUI5 vía CDN)
├── controller/             # Un controller por vista/pantalla
├── view/                   # Vistas XML (una por pantalla)
├── model/
│   ├── GastoModel.js        # Reglas de negocio del "gasto" (cálculos, topes, catálogos)
│   └── formatter.js         # Formateadores de UI (moneda COP, fechas, estados)
├── service/
│   └── ApiService.js         # Cliente HTTP centralizado hacia CPI (fetch/XHR, CSRF, multipart)
├── i18n/                    # Textos en español (Colombia)
└── css/style.css
```

### Modelos globales (definidos en `Component.js`)

| Modelo      | Tipo         | Contenido                                                          |
|-------------|--------------|---------------------------------------------------------------------|
| `device`    | JSONModel    | `sap.ui.Device` — para lógica responsive (phone/tablet/desktop)     |
| `app`       | JSONModel    | Usuario autenticado (IAS), rol analista, estado online/offline, resumen mensual del dashboard |
| `gasto`     | JSONModel    | Lote de facturas en captura/revisión (`GastoModel.crearLoteVacio()`) |
| `""` (default) | JSONModel | Datos "de paso" entre vistas (filtros, resultados de registro)     |
| `i18n`      | ResourceModel | Textos de la app                                                    |

### Autenticación y servicios centralizados

- **Autenticación externa vía IAS**: la app no tiene pantalla de login ni maneja
  credenciales/tokens propios. El approuter establece la sesión autenticada con IAS
  antes de servir la app. El `Component` identifica al usuario logueado en el
  launchpad de Work Zone con el servicio estándar `UserInfo` de la shell
  (`sap/ushell/Container`), del que toma el **correo y el nombre completo**, y
  consulta sus datos de colaborador con `GET /api/v1/users/by-email?email=...`
  (respuesta `{ status, data: { employeeId, email, nombreCompleto?, rol?,
  sourceSystem } }`). Los datos del backend se combinan con los del launchpad
  (el nombre del launchpad es el respaldo si el backend no envía `nombreCompleto`)
  y se publican como `usuario` y `esAnalista` en el modelo `app`. El rol de
  analista se reconoce si `rol` contiene "analista" (sin distinguir mayúsculas).
  Si el backend responde 401 (usuario no existe en la base de colaboradores
  activos), se muestra el mensaje de error devuelto (formato OData
  `error.message.value`).
- **`ApiService`** — wrapper sobre `fetch`/`XMLHttpRequest`:
  - Las peticiones viajan con la sesión establecida por la plataforma (IAS/approuter).
  - Obtiene y cachea un token CSRF (`X-CSRF-Token: Fetch`) antes de cualquier POST.
  - `get/post/postFormData/descargarArchivo` con manejo uniforme de errores (401 → sesión expirada).
  - Todas las rutas son relativas a `/http/...`, que en tiempo de ejecución se resuelve
    contra el destino CPI configurado en `xs-app.json`.

## 2. Navegación y pantallas (router en `manifest.json`)

El router es `sap.m.routing.Router` sobre un único `sap.m.App` (`view/App.view.xml`)
que apila páginas. Flujo típico de un empleado:

```
RouteMain ("")                    → Main.view.xml         (Dashboard)
   ↓ onAbrirRegistrarGasto
RouteCapturaMobil / RouteCargaPC  → captura por cámara o carga de PDF/XML
   ↓ OCR completado (polling)
RouteRevisionDatos ("revision/{jobIds}") → revisar/corregir datos extraídos, validar DIAN
   ↓ onRegistrarGasto
RouteConfirmacion ("confirmacion/{transaccionIds}") → resumen de lo registrado
   ↓
RouteListaGastos ("gastos")        → historial / aprobación (rol Analista)
```

| Ruta | Vista | Rol/objetivo |
|---|---|---|
| `RouteMain` | `Main` | Dashboard (ruta inicial): resumen del mes, accesos rápidos, acceso a "Revisión pendiente" solo si `app>/esAnalista` |
| `RouteCapturaMobil` | `CapturaMobil` | Captura de facturas con la cámara del dispositivo (`getUserMedia`) |
| `RouteCargaPC` | `CargaPC` | Carga de PDF/XML por drag&drop o selector de archivos |
| `RouteRevisionDatos` | `RevisionDatos` | Edición asistida de los datos extraídos por OCR, cálculo de IVA/total, validación de topes y DIAN |
| `RouteConfirmacion` | `Confirmacion` | Resumen de las transacciones registradas |
| `RouteListaGastos` | `ListaGastos` | Lista con filtros; detalle, descarga de factura, aprobar/rechazar (Analista) |

## 3. Flujo de negocio (captura de un gasto)

1. **Captura**: el usuario toma foto(s) con la cámara (`CapturaMobil`) o sube PDF/XML
   (`CargaPC`, máx. 10 MB, extensiones `.pdf`/`.xml`).
2. **Envío a OCR**: los archivos se envían como `multipart/form-data` a
   `POST /api/v1/facturas/capturar` o `/api/v1/facturas/cargar`. La respuesta trae un
   arreglo de `jobs` (uno por documento).
3. **Polling**: ambas vistas hacen polling cada 2s a
   `GET /api/v1/facturas/ocr/lote?jobIds=...` hasta que todos los `jobId` reportan
   `status: "completado"` (o alguno falla). Al completar, navega automáticamente a
   `RouteRevisionDatos`.
4. **Revisión** (`RevisionDatos`): cada factura del lote se llena con
   `GastoModel.crearGastoVacio()` + los datos/():confianza que devolvió el OCR.
   - El IVA se recalcula automáticamente al 19% sobre el subtotal.
   - El total = subtotal + IVA + impuestos adicionales + propina.
   - Se valida contra `GastoModel.TOPES_VIATICOS` (valores locales de respaldo) y,
     si hay conexión, contra `GET /api/v1/topes-viaticos` (fuente de verdad en backend).
   - El NIT del proveedor puede validarse ante la DIAN (`POST /api/v1/dian/validar-nit`).
   - Se puede guardar como borrador (`POST /api/v1/gastos/borrador`) o registrar en firme
     (`POST /api/v1/gastos/registrar`), que valida campos obligatorios en **todas** las
     facturas del lote antes de enviar.
5. **Confirmación**: muestra los números de transacción devueltos por el backend.
6. **Lista de gastos / aprobación**: `ListaGastos` sirve tanto para que el empleado
   consulte su historial (`GET /api/v1/gastos`) como para que un Analista revise
   pendientes (`GET /api/v1/gastos/pendientes`) y apruebe/rechace
   (`POST /api/v1/gastos/{id}/aprobar|rechazar`).

Todos los endpoints de backend consumidos están documentados en el encabezado de
[`webapp/service/ApiService.js`](webapp/service/ApiService.js).

## 4. Integración con el backend (SAP CPI) y seguridad

- En runtime, el `sap.app/dataSources.viaticosService.uri` (`/http/`) se enruta según
  `xs-app.json`:
  - `^/http/(.*)$` → destino **`dest_int_s`** (definido en `manifest.yml` para Cloud
    Foundry directo, o como servicio `destination` en `mta.yaml` para despliegue BTP).
  - `^/resources/(.*)$` y `^/test-resources/(.*)$` → CDN de UI5 (destino `ui5`, sin auth).
  - Resto de rutas → `html5-apps-repo-rt` (contenido de la propia app), con autenticación XSUAA.
- **Autenticación**: la realiza **IAS de manera externa** (approuter); la app no
  tiene módulo de login propio.
- **Autorización**: `xs-security.json` define dos scopes (`User`, `Analyst`) y dos
  role collections desplegables (`ViaticosEmpleado`, `ViaticosAnalistaFinanciero`). El
  rol se refleja en el front únicamente vía `app>/esAnalista` (basado en el campo
  `rol` si el backend lo incluye en `GET /api/v1/users/by-email`), **no hay chequeo
  de scopes XSUAA en el cliente** — la autorización real debe reforzarse en
  CPI/backend.

## 5. Cómo ejecutar y desplegar

```bash
npm install                 # instala dependencias (UI5 CLI, herramientas Fiori, ESLint)
npm start                   # sirve la app standalone en http://localhost:8080 (index.html)
npm run start-flp           # sirve la app dentro de un FLP sandbox (flpSandbox.html)
                             # nota: este archivo no existe todavía en el proyecto, ver hallazgos
npm run build                # build de producción con @ui5/cli → carpeta dist/
npm run build:mta            # build + genera dist/comccbviaticos.zip (create-zip.js) para el MTA
npm run deploy               # build + cf push (usa manifest.yml / Cloud Foundry directo)
npm run deploy:mta            # mbt build + cf deploy del .mtar (usa mta.yaml)
npm run lint                  # eslint webapp/ (ver hallazgo: falta config)
```

El middleware de desarrollo (`ui5.yaml`) usa `fiori-tools-proxy` para redirigir
`/resources`, `/test-resources` y `/http` (con `pathPrefix: /destinations/dest_int_s`)
hacia un backend de SAP Business Application Studio — **hay que reemplazar
`<tu-subdominio-bas>`** por el subdominio real antes de desarrollar contra datos reales.

## 6. Resultado de la validación (2026-07-08)

| Chequeo | Resultado |
|---|---|
| `npm install` | OK (739 paquetes, 29 vulnerabilidades reportadas por `npm audit`, ninguna crítica bloqueante para desarrollo) |
| Validación de `manifest.json` (esquema UI5) | ❌→✅ `_version` era `"1.58.0"` (versión de esquema inexistente); se corrigió a `"1.58.1"`. Ya valida sin errores. |
| `ui5-linter` (proyecto completo) | Sin errores bloqueantes de compilación, pero señala deuda técnica (detalle abajo) |
| `npm run build` (`ui5 build --clean-dest --dest dist`) | ✅ Build de producción exitoso |
| `npm run lint` (ESLint) | ❌ Falla: **no existe archivo de configuración de ESLint** en el proyecto (falta `.eslintrc*` o `eslint.config.js`) |

### Hallazgos del linter UI5 (deuda técnica, no bloquean el build)

- **`manifest.json` en formato legado (Manifest Version 1)**: recomienda migrar a
  `_version: "2.0.0"` y `minUI5Version` ≥ `1.136.0` (actualmente `1.120.0`).
- **`index.html`**: usa la ortografía antigua de los parámetros de bootstrap
  (`data-sap-ui-resourceroots`, `data-sap-ui-oninit`, `data-sap-ui-compatVersion`,
  `data-sap-ui-frameOptions`) — funcionan pero UI5 recomienda la variante con guiones
  (`data-sap-ui-resource-roots`, etc.).
- **Manejadores de evento sin punto inicial**: en casi todas las vistas XML
  (`press="onAbrirRegistrarGasto"` en vez de `press=".onAbrirRegistrarGasto"`). Sigue
  funcionando (UI5 resuelve el nombre igual), pero el linter lo marca como ambiguo/legado.
- **Uso de tipos SAP como string global en bindings** (`ListaGastos.view.xml`,
  `RevisionDatos.view.xml`): patrones como `type="sap.ui.model.type.Date"` disparan la
  regla `no-globals`; es un patrón válido y común en vistas XML, pero requeriría
  `core:require` para eliminarse del todo.

### Otros hallazgos

- `package.json` referencia `npm run start-flp` → `flpSandbox.html`, pero ese archivo
  **no existe** en `webapp/`; el comando fallará si se ejecuta tal cual.
- `ui5.yaml`, `manifest.yml` y `mta.yaml` contienen placeholders (`<tu-subdominio-bas>`,
  `<tu-tenant-cpi>`, `<region>`) que deben reemplazarse por valores reales antes de
  correr contra un backend o desplegar.
- No hay pruebas automatizadas (`npm test` es un stub que no ejecuta nada).
