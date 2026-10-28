# Verificación de APIs: de dónde sale cada dato de la página

Guía para responder dos preguntas sobre el Observatorio y comprobar las respuestas en vivo:

1. ¿Por qué ya aparecen ubicaciones en el mapa y cómo se escogieron?
2. ¿Qué APIs se usan y en qué parte de la página se ve su información?

Para cada caso se da la URL de **nuestra API** (lo que lee la página) y la de la **API original** (JSON crudo del proveedor), para abrirlas en una pestaña del navegador y compararlas con lo que muestra la página.

> **Requisitos:** Apache y MySQL encendidos en XAMPP, proyecto en `http://localhost/git/practica-06-geovisualizacion/`.
>
> **Consejo:** abre los JSON en Firefox, que los formatea solo. En Chrome marca la casilla "Dar formato al texto". También sirve la pestaña *Network* de las DevTools filtrando por `api/`.
>
> Todos los ejemplos usan **Tequila, Jalisco** (lat 20.88, lon −103.84). Los valores de ejemplo se verificaron el 2026-10-26.

---

## 1. Ubicaciones que aparecen por defecto

Al abrir la página aparecen dos cosas en el globo, y vienen de lugares distintos.

### a) Pines azules con nombre: las 10 "Zonas de referencia"

**No vienen de una API externa.** Se eligieron a mano y están en [`database/seed.sql`](../database/seed.sql), tabla `ubicaciones` con `tipo = 'referencia'`. Al cargar, la página las pide a nuestra API (`/geo/ubicaciones`) y dibuja un pin por cada una. También aparecen como botones en "Zonas de referencia" del panel izquierdo. Si la API no responde, la página usa la copia de respaldo `UBICACIONES_RESPALDO` de [`js/observatorio.js`](../js/observatorio.js).

Se eligieron con tres criterios:

| Criterio | Ubicaciones |
|---|---|
| Zona productora real de cada especie del catálogo | Tequila y Arandas (agave azul, DO Tequila); Santiago Matatlán (espadín, mezcal); Apan (maguey pulquero); Chilapa de Álvarez (papalote, *A. cupreata*) |
| Sitios de contraste para probar los extremos del modelo | Toluca (frío y heladas); Almería (árido, menos de 250 mm de lluvia); Iquitos (más de 3000 mm, encharcamiento) |
| Ejemplo que pide el enunciado para el A/B | Jutiapa (Guatemala) y Córdoba (España) |

Las coordenadas son el centro aproximado de cada municipio. Estas ubicaciones sirven para **validar el modelo**: si es correcto, el agave azul debe salir primero en Tequila, el pulquero en Apan, y los agaves deben morir en Iquitos. Eso es lo que ocurre.

**Comprobación:**

```
http://localhost/git/practica-06-geovisualizacion/api/geo/ubicaciones
```

El JSON trae 10 objetos con `nombre`, `latitud`, `longitud`, `tipo: "referencia"` y `descripcion`. Compáralos con los 10 botones de "Zonas de referencia" y con los pines. Al pasar el cursor por un pin, el texto que aparece es el campo `descripcion`.

El campo `mejor_idoneidad` sale de los análisis precargados en el seed:

| Ubicación | Mejor idoneidad |
|---|---|
| Tequila | 100.0 |
| Apan | 100.0 |
| Toluca | 100.0 |
| Chilapa | 98.0 |
| Arandas | 96.9 |
| Matatlán | 90.7 |
| Jutiapa | 78.1 |
| Almería | 61.2 |
| Iquitos | 35.0 |
| Córdoba | 12.9 |

Esos análisis también se consultan en:

```
http://localhost/git/practica-06-geovisualizacion/api/geo/analisis
```

### b) Puntos verdes pequeños: ocurrencias GBIF

Estos **sí son datos reales**: registros de la especie seleccionada en "Especie objetivo" (por defecto, el agave azul). Debajo del selector, la página dice "191 puntos en el globo de 191 registros georreferenciados".

| | URL | Qué revisar |
|---|---|---|
| Nuestra API | `http://localhost/git/practica-06-geovisualizacion/api/geo/ocurrencias?especie_id=1` | `total_registros: 191`, `mostrados`, `paises` (los "Top países" de la página) |
| GBIF directo | `https://api.gbif.org/v1/occurrence/search?taxonKey=2766899&hasCoordinate=true&hasGeospatialIssue=false&limit=0` | `"count": 191` |

La capa de densidad (imagen sobre el globo) sale de `api/geo/mapa-densidad?especie_id=1&x=0`, que devuelve un PNG del servicio de mapas de GBIF.

---

## 2. APIs utilizadas y dónde se ve su información

El navegador **nunca** llama a las APIs externas directamente. Siempre pasa por nuestro proxy PHP ([`api/index.php`](../api/index.php), [`api/lib/GeoServicios.php`](../api/lib/GeoServicios.php)), que normaliza las respuestas y las guarda en caché en MySQL (tabla `api_cache`). Por eso, para cada API hay dos URLs:

- **A (nuestra API):** devuelve el JSON normalizado, que es lo que lee la página.
- **B (la API original):** devuelve el JSON crudo del proveedor.

Para ver los datos en la página, haz clic en **📍 Tequila** de "Zonas de referencia". Todo lo de abajo aparece en el **panel derecho**, salvo que se indique otro lugar.

| API | Sección de la página |
|---|---|
| NASA POWER | "🛰️ Clima histórico" y años de la línea del tiempo de la parcela |
| SoilGrids (ISRIC) | "🪨 Suelo" |
| GBIF | "🌿 Biodiversidad", factor GBIF de la idoneidad, puntos verdes del globo |
| Open-Meteo Forecast | "🌦️ Condiciones actuales" |
| Open-Meteo Geocoding | Buscador "Buscar lugar" (panel izquierdo) |
| Nominatim (OpenStreetMap) | Título del panel derecho (nombre del lugar) |

### NASA POWER → "🛰️ Clima histórico (NASA POWER)"

- **A:** `http://localhost/git/practica-06-geovisualizacion/api/geo/clima?lat=20.88&lon=-103.84`
- **B:** `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,PRECTOTCORR_SUM,ALLSKY_SFC_SW_DWN,RH2M&community=AG&longitude=-103.84&latitude=20.88&start=2019&end=2025&format=JSON`

| En la página | En A (proxy) | En B (NASA) |
|---|---|---|
| Temp. media 20.9 °C | `promedio.temp_media: 20.9` | promedio de las claves `T2M` que terminan en `13`, de 2019 a 2025 |
| Precipitación 766 mm | `promedio.precipitacion_mm: 765.99` | promedio de `PRECTOTCORR_SUM` (`201913`, `202013`, …) |
| Mín. extrema 0.5 °C | `promedio.temp_min_abs: 0.53` | el menor de los `T2M_MIN` que terminan en `13` |
| Radiación 21.6 MJ | `promedio.radiacion_mj: 21.59` | promedio de `ALLSKY_SFC_SW_DWN` |
| Periodo 2019-2025 | `periodo` | parámetros `start` y `end` |

Ejemplo directo: en B, `T2M["201913"] = 20.83`; en A, `anios[0].temp_media = 20.83`. En la parcela, el nodo "Año 1 · 2019" de la línea del tiempo usa ese mismo valor.

En el JSON de NASA, la clave `201913` significa "año 2019, mes 13", que NASA usa para el valor anual.

La evapotranspiración (`et0_mm`, 1695 mm) y el índice de aridez (`aridez`, 0.45) **no vienen de NASA**: los calcula el proxy con Hargreaves-Samani a partir de los datos de NASA.

### SoilGrids → "🪨 Suelo (SoilGrids)"

- **A:** `http://localhost/git/practica-06-geovisualizacion/api/geo/suelo?lat=20.88&lon=-103.84`
- **B:** `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=-103.84&lat=20.96&property=phh2o&property=clay&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`

> **Ojo:** la latitud de B es **20.96**, no 20.88. En el punto exacto de Tequila, SoilGrids devuelve `"mean": null` porque es zona urbana. El proxy entonces prueba celdas vecinas (~8 km) y la página lo avisa con la nota "Dato tomado de la celda vecina…". Es un ejemplo de manejo de huecos en los datos.
>
> SoilGrids limita a **5 consultas por minuto**. Si B devuelve error 429, espera un minuto.

| En la página | En A | En B (crudo) |
|---|---|---|
| pH 6.5 | `ph: 6.5` | `phh2o` vale 65 en las tres profundidades; SoilGrids lo entrega ×10, así que es 6.5 |
| Arcilla 28 % | `arcilla_pct: 28` | `clay` vale 278, 297 y 270 g/kg; el promedio ponderado por grosor de capa (5, 10, 15 cm) da 280 g/kg = 28 % |

A también trae arena (49.3 %), limo (22.7 %), carbono orgánico (15.6 g/kg), nitrógeno (1.83 g/kg) y CIC (23.9 cmol/kg). Para verlos en B, agrega `&property=sand&property=silt&property=soc&property=nitrogen&property=cec`.

### GBIF → "🌿 Biodiversidad (GBIF)", factor GBIF de la idoneidad y puntos verdes

- **A:** `http://localhost/git/practica-06-geovisualizacion/api/geo/biodiversidad?lat=20.88&lon=-103.84&radio=100`
- **B:** `https://api.gbif.org/v1/occurrence/search?taxonKey=2766899&geoDistance=20.88,-103.84,100km&hasGeospatialIssue=false&limit=0`

| En la página | En A | En B |
|---|---|---|
| Tabla: *Agave tequilana* 90 | `especies[0].conteo: 90` | `"count": 90` |
| Regla: "90 registros de ocurrencia cercanos" | (mismo dato) | |

`2766899` es el identificador del agave azul en GBIF. Para otras especies se cambia `taxonKey`:

| Especie | taxonKey |
|---|---|
| *A. tequilana* (azul) | 2766899 |
| *A. angustifolia* (espadín) | 2766846 |
| *A. salmiana* (pulquero) | 2766660 |
| *A. cupreata* (papalote) | 2766892 |

### Open-Meteo Forecast → "🌦️ Condiciones actuales (Open-Meteo)"

- **A:** `http://localhost/git/practica-06-geovisualizacion/api/geo/actual?lat=20.88&lon=-103.84`
- **B:** `https://api.open-meteo.com/v1/forecast?latitude=20.88&longitude=-103.84&current=temperature_2m,relative_humidity_2m&hourly=soil_moisture_9_to_27cm&forecast_days=7&timezone=auto`

Compara `current.temperature_2m` (B) con `temperatura` (A) y con "Ahora" en la página. Este dato se guarda en caché solo **1 hora**, así que puede diferir unas décimas si B se consulta bastante después que A.

### Open-Meteo Geocoding → buscador "Buscar lugar" (panel izquierdo)

- **A:** `http://localhost/git/practica-06-geovisualizacion/api/geo/buscar?q=Jutiapa`
- **B:** `https://geocoding-api.open-meteo.com/v1/search?name=Jutiapa&count=8&language=es`

Los resultados que aparecen al escribir "Jutiapa" en el buscador son los de esa lista.

### Nominatim (OpenStreetMap) → título del panel derecho

- **A:** `http://localhost/git/practica-06-geovisualizacion/api/geo/lugar?lat=20.88&lon=-103.84`
- **B:** `https://nominatim.openstreetmap.org/reverse?lat=20.88&lon=-103.84&format=jsonv2&zoom=10&accept-language=es`

A devuelve "Tequila" y "Jalisco, México", que es el título y subtítulo del panel derecho.

### Todo junto: `/geo/punto`

Al hacer clic en el globo, la página en realidad hace **una sola** llamada, que consulta todas las fuentes anteriores en paralelo (`curl_multi`):

```
http://localhost/git/practica-06-geovisualizacion/api/geo/punto?lat=20.88&lon=-103.84&radio=100
```

Al final del JSON vienen `cache_por_fuente` (`HIT` = salió de MySQL, `MISS` = se consultó en vivo) y `tiempo_ms`. Corresponden a la línea "⏱️ 45 ms · caché MySQL: 10/10 fuentes" de la página. Las estadísticas del caché están en `api/geo/cache`.

---

## 3. Lo que no aparece en ningún JSON

Varios valores de la página **no vienen de una API**. Los calcula el navegador ([`js/agronomia.js`](../js/agronomia.js)) a partir de los datos anteriores:

- **Índice de idoneidad** (100 en Tequila) y sus barras por factor.
- **Decisiones geo-agronómicas** (reglas tipo "SI temperatura mínima < −3 °C ENTONCES riesgo de helada").
- **Ranking de especies** en el punto.
- **Parámetros de simulación derivados**, por ejemplo:
  - luz 79 % = 21.59 MJ × 3.636
  - agua 39 %, que sale del índice de aridez 766 / 1695 = 0.45, corregido por la arcilla
  - nutrientes 75, que sale de N, carbono orgánico y CIC del suelo

En resumen: la API entrega el dato físico y la página lo convierte a la escala del simulador. Las fórmulas están en la sección 4 de [`investigacion_metricas_agave.md`](investigacion_metricas_agave.md).

## 4. Diferencias esperadas por la caché

Nuestra API puede devolver datos guardados en MySQL, así que A y B pueden no coincidir exactamente si el proveedor actualizó sus datos:

| Fuente | Vigencia en caché |
|---|---|
| NASA POWER | 30 días |
| Open-Meteo (actual) | 1 hora |
| SoilGrids | 180 días |
| GBIF (conteos) | 7 días |
| GBIF (especie) | 90 días |
| Geocodificación | 90 días |

Por ejemplo, si GBIF agrega registros nuevos esta semana, B podría mostrar un número un poco mayor que A. Las coordenadas se redondean a 2 decimales para la clave de caché.
