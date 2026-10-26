# Práctica 06: respuestas

### 1. ¿Qué APIs públicas integraste y por qué las elegiste? ¿Qué tipo de datos aporta cada una?

| API | Datos que aporta | Por qué |
|---|---|---|
| **NASA POWER** (comunidad AG, mensual) | Temperatura media, máxima y mínima absolutas; precipitación (`PRECTOTCORR_SUM`); radiación solar (MJ/m²/día); humedad relativa. Últimos 7 años completos (2019-2025) | Cobertura global desde 1981 sin registro. Da **un año real por cada año** de la línea del tiempo del agave |
| **Open-Meteo** Forecast | Temperatura y humedad actuales, humedad del suelo a 0-1 y 9-27 cm, ET₀ y pronóstico de 7 días | Sin API key; aporta el estado de *hoy* para decidir riegos inmediatos |
| **Open-Meteo** Geocoding | Búsqueda por nombre (texto → coordenadas) | Sin API key |
| **SoilGrids 2.0** (ISRIC) | pH, arcilla, arena, limo, carbono orgánico, nitrógeno, CIC a 0-30 cm | Única fuente global de suelo a 250 m sin registro |
| **GBIF** Occurrence, Species y Maps | Conteo de ocurrencias por especie en un radio, puntos georreferenciados, países y mapa de densidad (tiles EPSG:4326) | Evidencia empírica de *dónde vive realmente* cada especie |
| **Nominatim** (OpenStreetMap) | Geocodificación inversa (coordenadas → nombre) | Open-Meteo Geocoding **no** hace búsqueda inversa (solo por nombre), así que se usa Nominatim desde el proxy, respetando su política de uso |

### 2. ¿Cómo implementaste el proxy PHP para proteger las API keys? Muestra el flujo frontend → FlightPHP → cURL → API externa → MySQL (caché) → JSON.

El navegador **nunca** llama a una API externa: solo habla con `api/index.php`. Las credenciales y el contacto viven en `api/config.php` (excluido del repositorio por `.gitignore`; se versiona `config.example.php`). Ninguna respuesta las incluye.

```
main.js / observatorio.js
  └─ fetch('api/index.php?route=/geo/punto&lat=20.88&lon=-103.84')
       └─ FlightPHP (Flight::route('GET /geo/punto'))
            ├─ valida lat/lon (filter_var, rangos) y redondea a 2 decimales (~1.1 km)
            ├─ HttpCliente::multi([...])         ← api/lib/HttpCliente.php
            │    ├─ ApiCache::leer(sha1(fuente|url))  → MySQL api_cache
            │    │    └─ HIT vigente → se devuelve sin tocar la red
            │    ├─ MISS → curl_multi en paralelo (NASA POWER, Open-Meteo, SoilGrids, GBIF ×6, Nominatim)
            │    │    └─ timeout 30 s, User-Agent propio, verificación TLS
            │    ├─ 2xx → ApiCache::guardar(..., TTL por fuente)
            │    └─ error con copia vieja → STALE (stale-if-error)
            ├─ GeoServicios::normalizar*() → JSON independiente del proveedor
            └─ Flight::json([...lugar, clima, actual, suelo, gbif, cache_por_fuente, tiempo_ms])
```

Medido: la primera consulta de un punto tarda ~6 s (10 llamadas en paralelo). La segunda tarda **~45 ms** (10/10 fuentes desde MySQL).

### 3. ¿Cómo construiste el globo terráqueo 3D? ¿Usaste three-globe, lithosphere, o lo hiciste desde cero? Explica la proyección de coordenadas.

**Desde cero con Three.js** (`js/globo.js`). De three-globe solo se toma la *imagen* Blue Marble (textura equirectangular) y el mapa de relieve. El globo tiene:
- Esfera `SphereGeometry(100, 128, 96)` con `MeshPhongMaterial` (textura y bump map).
- Atmósfera con un `ShaderMaterial` de tipo Fresnel sobre una esfera mayor (`BackSide`, aditiva).
- Estrellas (`Points`), retícula de 30° (`LineSegments`), `OrbitControls` sin paneo y etiquetas `CSS2DRenderer` que se ocultan cuando quedan del otro lado del planeta.

**Proyección.** La textura es equirectangular (lon −180..180 → u 0..1; lat 90..−90 → v 0..1), igual que la parametrización UV de `SphereGeometry`. Por eso:

```
φ = (90 − lat)·π/180          (ángulo polar)
θ = (lon + 180)·π/180         (azimut)
x = −R·sen φ·cos θ,   y = R·cos φ,   z = R·sen φ·sen θ
```

La inversa (clic → coordenadas) es `lat = 90 − acos(y/R)` y `lon = atan2(z, −x) − 180`.

### 4. ¿Cómo georreferenciaste los marcadores y las ocurrencias GBIF sobre la esfera?

- **Marcadores (pines).** Se colocan en `latLonAVector3(lat, lon)` y se orientan con `quaternion.setFromUnitVectors(Y, normal)`, de modo que el tallo sale perpendicular a la superficie. Hay cuatro tipos: referencia (azul), análisis guardados (color según idoneidad), selección (anillo pulsante amarillo) y A/B (azul y naranja).
- **Ocurrencias GBIF.** Hasta 900 puntos reales (3 páginas de 300 de `/occurrence/search`) en **un solo `THREE.Points`**: un solo draw call aunque sean miles. Se elevan 0.45 unidades para evitar *z-fighting*. Al pasar el cursor se ve país, año y tipo de registro, y al hacer clic se consulta ese punto.
- **Densidad GBIF (millones de registros).** El proxy descarga los 2 tiles de zoom 0 en EPSG:4326 (oeste y este, 512×512) y el frontend los une en un canvas 1024×512. Eso ya es una textura equirectangular que se aplica a una esfera transparente de radio 100.25.
- **Arco A→B.** Interpola en círculo máximo entre los dos vectores unitarios, eleva la curva con `sin(πt)` en proporción a la distancia angular y la dibuja con `TubeGeometry`. Una esfera blanca recorre el arco.

### 5. ¿Cómo calculas el índice de idoneidad? ¿Qué variables consideraste y con qué pesos?

```
I = 100 · (0.25·f_T + 0.25·f_agua + 0.10·f_luz + 0.10·f_nut + 0.10·f_pH + 0.20·g_GBIF) · (1 − daño_helada/100)
```

- Cada *f* ∈ [0, 1] sale de las **zonas cardinales** de la especie (`docs/investigacion_metricas_agave.md`): 1 en el óptimo, lineal en la zona subóptima y 0 en la crítica o letal.
- `g_GBIF = log₁₀(1 + n) / log₁₀(51)`: con 50 o más registros en el radio la evidencia es completa.
- **Topes:** si alguna variable cae en zona **letal**, I ≤ 10; si cae en zona **crítica**, I ≤ 35.
- Clases: ≥ 75 Alta, 50-75 Media, 25-50 Baja, < 25 No apta.
- Además se corre la **simulación de 7 años con el clima real**. El panel muestra la biomasa esperada o el año de muerte y la causa.

Pesos: temperatura y agua pesan más (25 % cada una) porque son las que más limitan al agave en la literatura. GBIF (20 %) aporta evidencia empírica. Luz, nutrientes y pH (10 % cada uno) son corregibles con manejo (poda de sombra, fertilización, encalado).

### 6. ¿Qué reglas de decisión geo-agronómicas implementaste? Da 3 ejemplos con su umbral y recomendación.

En `reglasGeoAgronomicas()` se guardan con `categoria='geo'` en la tabla `decisiones`. Ejemplos:

1. **Precipitación < 400 mm/año** (crítica): "Riego suplementario obligatorio". Entre 400 y 600 mm, riego de auxilio; más de 1500 mm, camellones y drenaje.
2. **Mínima extrema ≤ umbral letal de la especie** (−6 °C para el agave azul): "Helada letal, sitio no apto sin protección". Entre 0 y −6 °C: "Daño foliar estimado de X %; evitar hondonadas".
3. **0 ocurrencias GBIF en el radio** (crítica): "Especie no reportada en esta región, alto riesgo". Con 20 o más: "Presencia confirmada".
4. **pH < 5.5**: "Suelo ácido, encalar antes de sembrar"; pH > 8.2: aplicar azufre o materia orgánica.
5. **Arcilla > 40 %**: "Drenaje lento; se recomienda maguey pulquero con camellones".
6. **Radiación > 25 MJ/m²/día**: "Alta radiación, sombra parcial en plántulas".
7. **Temperatura media > 35 °C**: "Estrés térmico severo, considerar variedad resistente".

### 7. ¿Cómo manejas el caché de APIs para no exceder los límites de uso? ¿Qué tiempo de expiración usaste?

- Tabla `api_cache` con llave `sha1(fuente|url)`. Guarda la respuesta cruda (o el PNG en base64), `http_code`, `bytes`, `hits`, `creado_en`, `expira_en` y `ultimo_acceso`.
- **Redondeo de coordenadas a 2 decimales** (~1.1 km): clics cercanos reutilizan la misma entrada.
- **TTL por fuente** (configurable en `config.php`):

| Fuente | TTL | Razón |
|---|---|---|
| NASA POWER | 30 días | Años cerrados: casi no cambian |
| SoilGrids | 180 días | Mapa estático (v2.0); límite de 5 consultas/min |
| GBIF (conteos, puntos, mapa) | 7 días | GBIF indexa semanalmente |
| Especie GBIF (taxonKey) | 90 días | Además se persiste en `especies.gbif_taxon_key` |
| Nominatim / geocodificación | 90 días | Política de Nominatim: ≤ 1 consulta/s |
| Open-Meteo (actual) | 1 hora | Dato "de hoy" |

- **Stale-if-error:** si la API falla o responde 429 y existe una copia vencida, se sirve esa copia.
- **Caché del frontend:** un `Map` en memoria evita repetir la misma consulta durante la sesión.
- **Transparencia:** `GET /geo/cache` muestra entradas, hits y KB por fuente, y el panel indica cuántas fuentes vinieron de caché.

### 8. ¿Cómo lanzas una simulación de crecimiento usando los datos reales de una ubicación? Describe el flujo completo.

1. Clic en el globo (o búsqueda o marcador) → `GET /geo/punto` → JSON normalizado.
2. `parametrosDesdeDatosReales()` convierte **cada uno de los 7 años reales** a parámetros del simulador:
   - temperatura = `T2M` anual; mínima extrema = `T2M_MIN`;
   - agua = tabla por tramos del índice de aridez P/ET₀ (ET₀ por Hargreaves-Samani), corregida por la arcilla;
   - luz = MJ × 3.636;
   - nutrientes = índice de N, COS y CIC; pH de SoilGrids; CO₂ = 425 ppm.
3. "▶️ Simular aquí" → `lanzarSimulacionGeo()` cambia a la parcela 3D. La **línea del tiempo se rellena con los años 2019…2025** (cada nodo muestra su año real) y se reinicia la corrida.
4. El motor `simularCiclo()` avanza 140 pasos (18.25 días cada uno) con la ley del mínimo, el CO₂, el daño y la recuperación. Las plantas 3D crecen, se marchitan según el daño o mueren (color café, pencas caídas).
5. "💾 Guardar en MySQL" hace una sola transacción con: `ubicaciones` (reutiliza una ubicación existente a menos de 0.005°), `analisis_geo` (datos reales, idoneidad y la línea del tiempo en JSON), `simulaciones` (`origen='geo'`, `ubicacion_id`), `mediciones` y `decisiones` (fisiológicas y geo).
6. Desde "Reportes → Cargar", la simulación se reproduce **con la misma línea del tiempo real**.

### 9. ¿Cómo funciona el comparador A/B geográfico? ¿Qué métricas comparas y cómo declaras un ganador?

- "Fijar como A" y "Fijar como B" guardan dos puntos; el globo dibuja un arco animado entre ellos. El botón 🇬🇹 vs 🇪🇸 carga el ejemplo del enunciado (Jutiapa vs Córdoba).
- **Métricas** para la especie elegida: idoneidad, biomasa simulada en el año 7, daño final, estrés promedio, ocurrencias GBIF, temperatura media, mínima extrema, precipitación, aridez P/ET₀, radiación, pH, arcilla y agua estimada. Las que tienen un criterio de mejora se marcan en verde.
- **Ganador:** puntaje compuesto = 50 % idoneidad + 50 % biomasa simulada (% de K). **Si la planta muere en una ubicación, gana automáticamente la otra.** Resultado del ejemplo con agave azul: **Jutiapa gana** (idoneidad 78, 4494 g). En Córdoba la planta muere por la helada de −4.8 °C, cerca del umbral letal de −6 °C.
- "▶️ Simular A vs B en la parcela" pone A en la fila frontal y B en la trasera, cada una con su clima real de 7 años, y declara el ganador en vivo.

### 10. ¿Qué dificultades encontraste al integrar datos reales con la simulación procedural? ¿Cómo las resolviste?

1. **Unidades incompatibles.** Los sliders usaban porcentajes abstractos y las APIs dan mm, MJ y g/kg. Se definieron unidades físicas para cada métrica y conversiones documentadas (aridez → agua, MJ → luz, N/COS/CIC → nutrientes).
2. **Umbrales arbitrarios** en la v5 ("agua ≤ 8 % = muerte"). Se investigaron y se formalizaron en zonas cardinales por especie (`umbrales_ambientales`) con daño acumulado y recuperación total, parcial o nula.
3. **Calibración contra la realidad.** Al pasar datos reales, pH 4.5 mataba plantas, pero el 52 % de los suelos agaveros tiene pH < 5.5. Se relajaron los umbrales. Ahora el modelo reproduce los patrones conocidos: agave azul en Tequila, pulquero en Apan y muerte por encharcamiento en Iquitos.
4. **Huecos de datos.** SoilGrids devuelve `null` en zonas urbanas (el centro de Tequila no tiene dato): se usa la celda vecina a ~8 km. NASA POWER marca faltantes con −999: se filtran.
5. **Límites y bloqueos.** SoilGrids permite 5 consultas/min y Nominatim respondía **403** a User-Agents con correos `example.com`: se agregó caché, stale-if-error y un User-Agent configurable.
6. **Charset.** El seed importado con el cliente de Windows guardaba "Córdoba" mal codificado: se añadió `SET NAMES utf8mb4` a los SQL.
7. **Bucle de render.** Al volver de una pestaña oculta, el `delta` enorme hacía que `color.lerp(…, delta·3)` extrapolara (plantas rojas). Se limitó `delta` a 0.1 s.

### 11. ¿Qué valor añadido aporta el mapa 3D frente a un simple formulario de coordenadas? ¿En qué casos es realmente útil?

- **Contexto espacial inmediato:** se ve que las ocurrencias de *A. tequilana* se concentran en el occidente de México y que el pulquero ocupa el Altiplano. Eso orienta dónde vale la pena hacer clic.
- **Exploración en vez de adivinanza:** con un formulario hay que saber qué coordenadas probar. Con el globo, la densidad GBIF y los análisis guardados (coloreados por idoneidad) señalan dónde mirar.
- **Comparación visual:** el arco A→B y los pines coloreados muestran de un vistazo las regiones buenas y malas.
- **Cada marcador lleva a una acción** (simular, comparar, guardar). El globo es la interfaz de decisión, no decoración.
- Donde *no* aporta: si ya conoces la parcela exacta, basta con buscarla por nombre (la búsqueda existe por eso).

### 12. Si tuvieras que conectar este observatorio a sensores IoT en tiempo real y a imágenes satelitales (NDVI, Sentinel-2), ¿cómo lo harías?

- **IoT.** Nodos LoRaWAN o MQTT con humedad capacitiva a 10/30 cm, temperatura de hoja y estación meteorológica → broker MQTT (Mosquitto) → un worker PHP o Node que valida y escribe en una tabla `telemetria(sensor_id, ubicacion_id, variable, valor, ts)` particionada por mes, o en InfluxDB/TimescaleDB. El motor recibiría ese clima *observado* en lugar del anual: los sensores sustituyen la línea del tiempo, y el pronóstico de Open-Meteo extiende el futuro. Las decisiones (riego, alerta de helada) se enviarían como notificaciones push.
- **Satélite.** Sentinel-2 L2A (10 m, revisita de 5 días) vía Copernicus Data Space, Sentinel Hub o Google Earth Engine. Se calcularía NDVI = (B8 − B4)/(B8 + B4) y NDMI para estrés hídrico. En el globo se mostraría como tiles o como una textura sobre la parcela. El NDVI observado serviría para **calibrar** r y K por parcela (asimilación de datos): si el NDVI real cae por debajo del simulado, el modelo subestima el estrés.
- Las credenciales (Sentinel Hub OAuth) irían en el proxy, igual que hoy.

### 13. ¿Cómo escalarías la aplicación para consultar miles de ubicaciones simultáneamente sin saturar las APIs externas?

- **Rejilla espacial.** Redondear a celdas (como el redondeo actual a 0.01°, o H3/geohash) para que miles de puntos compartan pocas consultas. NASA POWER y SoilGrids tienen resolución de ~0.5° y 250 m, así que no tiene sentido pedir más fino.
- **Cola de trabajos** (Redis + workers, RabbitMQ o SQS). `POST /geo/lotes` encola, los workers consumen respetando un **token bucket por proveedor** (SoilGrids 5/min, Nominatim 1/s) y el frontend consulta el avance o recibe server-sent events.
- **Caché distribuida en dos niveles:** Redis (caliente) delante de MySQL (persistente), con calentamiento previo de las regiones de interés (zonas DO, por ejemplo) durante la noche.
- **Endpoints de lote:** NASA POWER tiene un endpoint `regional`; GBIF permite descargas asíncronas (`/occurrence/download`, con credenciales en el proxy) en lugar de miles de búsquedas.
- **Rasters locales:** para SoilGrids y climatologías, descargar los GeoTIFF una vez y consultarlos localmente con GDAL o PostGIS elimina por completo la dependencia de la API.
- **Horizontal:** PHP-FPM sin estado detrás de un balanceador, MySQL con réplicas de lectura e índices espaciales (`POINT` + `SPATIAL INDEX`).

### 14. ¿Qué decisiones reales puede tomar un agrónomo o investigador con esta herramienta que no podía tomar con la Práctica 05?

- **Elegir la especie según el sitio y el sitio según la especie**, con clima, suelo y biodiversidad reales: por ejemplo, ver que en Apan conviene el pulquero y no el azul, o que en Almería solo el espadín es razonable.
- **Evaluar el riesgo de heladas** con la mínima absoluta real de los últimos 7 años. La P05 no modelaba heladas, que son la principal causa histórica de pérdida de plantaciones de agave azul.
- **Estimar el riesgo de los años reales:** reproducir 2019-2025 en un sitio y ver si un año seco o húmedo concreto habría causado daño permanente.
- **Decidir inversiones de manejo:** encalar (pH), drenar (arcilla y lluvia), riego de auxilio (aridez) o malla sombra (radiación), con umbrales justificados.
- **Comparar regiones candidatas** para expandir una plantación (A/B) y priorizar con el ranking de idoneidad.
- **Validar con evidencia empírica:** GBIF indica si la especie ya prospera en la región, lo que reduce el riesgo de una apuesta agronómica.
- **Documentar el análisis** en MySQL (ubicación, datos, idoneidad, decisiones y simulación vinculada) para auditoría o seguimiento.
