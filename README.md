# Práctica 06 - Observatorio Global de Cultivos (Geovisualización)

**Autores:** Chavarin & Godinez
**Materia:** Bioinformática y Biología Computacional Avanzados

## Descripción

Evolución del Laboratorio Bioinformático de Cultivo (Práctica 05) a un **visor geoespacial global**. Un globo terráqueo 3D construido con Three.js permite consultar en cualquier punto del planeta **datos reales** de clima (NASA POWER, Open-Meteo), suelo (SoilGrids) y biodiversidad (GBIF), calcular la idoneidad de cada especie de agave, comparar ubicaciones A/B y lanzar la simulación de crecimiento de 7 años con el clima real del lugar.

Los umbrales del simulador (desde el crecimiento favorable hasta la muerte irreversible) están fundamentados en [docs/investigacion_metricas_agave.md](docs/investigacion_metricas_agave.md).

## Arquitectura de tres capas

```
┌──────────────────────── Navegador ────────────────────────┐
│ index.html + style.css                                    │
│ js/globo.js        Globo 3D desde cero (proyección, pines,│
│                    ocurrencias GBIF, densidad, arco A/B)  │
│ js/observatorio.js Panel de datos reales, A/B, ranking    │
│ js/agronomia.js    Motor: zonas cardinales, Liebig, daño, │
│                    idoneidad, reglas geo-agronómicas      │
│ main.js            Parcela 3D (P05) + línea del tiempo    │
└───────────────┬───────────────────────────────────────────┘
                │ fetch (solo a nuestro servidor)
┌───────────────▼──────────── PHP (FlightPHP) ──────────────┐
│ api/index.php          Rutas REST                         │
│ api/lib/HttpCliente.php  cURL + curl_multi + caché MySQL  │
│ api/lib/GeoServicios.php Normalización por proveedor      │
│ api/config.php         Credenciales y TTL (no versionado) │
└───────┬───────────────────────────────┬───────────────────┘
        │ PDO                           │ cURL (HTTPS)
┌───────▼──────── MySQL ────────┐  ┌────▼── APIs públicas ──────────────┐
│ especies, umbrales_ambientales│  │ NASA POWER · Open-Meteo · SoilGrids │
│ ubicaciones, analisis_geo     │  │ GBIF (occurrence, species, maps)    │
│ simulaciones, mediciones      │  │ Nominatim (geocodificación inversa) │
│ decisiones, api_cache         │  └─────────────────────────────────────┘
└───────────────────────────────┘
```

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/geo/clima?lat&lon` | NASA POWER: 7 años (temperatura, mínima/máxima absolutas, lluvia, radiación, HR, ET₀) |
| GET | `/geo/actual?lat&lon` | Open-Meteo: condiciones actuales, humedad del suelo, pronóstico de 7 días |
| GET | `/geo/suelo?lat&lon` | SoilGrids: pH, textura, COS, N, CIC (0-30 cm), con respaldo de celda vecina |
| GET | `/geo/biodiversidad?lat&lon&radio` | GBIF: ocurrencias de cada especie del catálogo en el radio |
| GET | `/geo/lugar?lat&lon` | Geocodificación inversa (Nominatim) |
| GET | `/geo/buscar?q` | Búsqueda de lugares (Open-Meteo Geocoding) |
| GET | `/geo/punto?lat&lon&radio` | **Todo lo anterior en paralelo** (`curl_multi`) |
| GET | `/geo/ocurrencias?especie_id&limite` | Puntos GBIF para el globo y top de países |
| GET | `/geo/mapa-densidad?especie_id&x` | Tile PNG de densidad GBIF (EPSG:4326) |
| GET / POST | `/geo/analisis` | Historial y guardado de análisis geoespaciales |
| GET | `/geo/ubicaciones` | Ubicaciones de referencia y guardadas |
| GET | `/geo/cache` | Estadísticas del caché por fuente |
| GET | `/especies` | Catálogo con umbrales ambientales |
| GET / POST | `/simulaciones`, `/simulaciones/@id` | Corridas (con análisis geo vinculado) |
| GET | `/reportes` | Top 5, eficiencia, mejores sitios |

Con Apache (incluido `api/.htaccess`) funcionan rutas limpias:

```bash
curl "http://localhost/git/practica-06-geovisualizacion/api/geo/clima?lat=20.88&lon=-103.84"
```

Sin mod_rewrite: `api/index.php?route=/geo/clima&lat=20.88&lon=-103.84`.

## Cómo ejecutar en XAMPP

1. Iniciar **Apache** y **MySQL** en el panel de XAMPP. PHP necesita la extensión `curl` (activa por defecto en XAMPP).
2. Importar `database/schema.sql` y luego `database/seed.sql` desde phpMyAdmin, o por consola:
   ```bash
   mysql -u root --default-character-set=utf8mb4 < database/schema.sql
   ```
   ```bash
   mysql -u root --default-character-set=utf8mb4 < database/seed.sql
   ```
3. (Opcional) Copiar `api/config.example.php` a `api/config.php` para cambiar credenciales, el contacto del User-Agent o los TTL del caché.
4. Colocar la carpeta `practica-06-geovisualizacion` en `xampp/htdocs/git/` y abrir `http://localhost/git/practica-06-geovisualizacion/`.

Se requiere conexión a internet: las APIs se consultan en vivo la primera vez y después salen del caché MySQL.

## Uso rápido

1. **Globo:** clic en cualquier punto, en una zona de referencia o búsqueda por nombre.
2. **Panel de datos reales:** idoneidad desglosada, decisiones geo-agronómicas, ranking de especies en el punto, clima, suelo y GBIF.
3. **▶️ Simular aquí:** abre la parcela 3D con la línea del tiempo rellenada con los 7 años reales (2019-2025).
4. **Fijar como A / B → ⚖️ Comparar**, o usar el ejemplo 🇬🇹 vs 🇪🇸 (Jutiapa vs Córdoba).
5. **🏆 Ranking:** especie × ubicación con datos reales.
6. **💾 Guardar:** el análisis (y la simulación vinculada) quedan en MySQL.

## Documentación

- [docs/investigacion_metricas_agave.md](docs/investigacion_metricas_agave.md): métricas ambientales, zonas de favorable a letal, modelo de daño y recuperación, y referencias.
- [docs/RESPUESTAS.md](docs/RESPUESTAS.md): respuestas a las preguntas de la práctica (también en el botón "❓ Preguntas" de la app).
