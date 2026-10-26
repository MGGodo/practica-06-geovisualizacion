<?php
/**
 * Configuración del servidor (Práctica 06).
 *
 * Copia este archivo como `config.php` y ajusta los valores. `config.php` está en .gitignore:
 * las credenciales y API keys viven solo en el servidor y NUNCA se envían al navegador.
 * Si `config.php` no existe, la API usa este archivo de ejemplo.
 */
return [
    'db' => [
        'host'    => '127.0.0.1',
        'nombre'  => 'practica06_geovisualizacion',
        'usuario' => 'root',
        'clave'   => '',          // En XAMPP por defecto es vacío
        'charset' => 'utf8mb4',
    ],

    // Identificación ante las APIs públicas (va en el User-Agent). Nominatim rechaza correos de
    // dominios de ejemplo (example.com): usa un correo real o déjalo vacío.
    'contacto' => '',

    // API keys opcionales. Ninguna de las APIs integradas exige key, pero si se agregan
    // (p. ej. un token de Mapbox o credenciales de descarga de GBIF) se colocan aquí y
    // solo las usa el proxy PHP. El frontend jamás las recibe.
    'keys' => [
        'gbif_usuario' => '',
        'gbif_clave'   => '',
        'mapbox_token' => '',
    ],

    // Tiempos de vida del caché en MySQL (segundos)
    'ttl' => [
        'nasa_power'   => 60 * 60 * 24 * 30,   // 30 días: históricos de años cerrados, casi nunca cambian
        'open_meteo'   => 60 * 60,             // 1 hora: condiciones actuales
        'soilgrids'    => 60 * 60 * 24 * 180,  // 180 días: mapa de suelos estático (versión 2.0)
        'gbif_conteo'  => 60 * 60 * 24 * 7,    // 7 días: GBIF indexa registros nuevos semanalmente
        'gbif_puntos'  => 60 * 60 * 24 * 7,
        'gbif_mapa'    => 60 * 60 * 24 * 7,
        'gbif_especie' => 60 * 60 * 24 * 90,
        'geocodificar' => 60 * 60 * 24 * 90,   // nombres de lugares
    ],

    // Redondeo de coordenadas para la llave de caché (2 decimales ≈ 1.1 km)
    'decimales_cache' => 2,

    'curl' => [
        'timeout'         => 30,
        'connect_timeout' => 8,
    ],
];
