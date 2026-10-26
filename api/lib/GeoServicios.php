<?php
/**
 * Servicios de datos geoespaciales reales (proxy).
 * Cada método arma la URL de la API externa, la pide vía HttpCliente (con caché MySQL)
 * y devuelve un JSON normalizado e independiente del proveedor.
 */
class GeoServicios {
    const POWER_PARAMS = 'T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,PRECTOTCORR_SUM,ALLSKY_SFC_SW_DWN,RH2M';
    const ANIOS_HISTORICO = 7;

    /* ---------------- utilidades ---------------- */

    public static function coordenadas($lat, $lon) {
        $lat = filter_var($lat, FILTER_VALIDATE_FLOAT);
        $lon = filter_var($lon, FILTER_VALIDATE_FLOAT);
        if ($lat === false || $lon === false || $lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
            return null;
        }
        $d = Database::config()['decimales_cache'];
        return [round($lat, $d), round($lon, $d)];
    }

    private static function ttl($fuente) {
        return Database::config()['ttl'][$fuente];
    }

    private static function f($v) {
        return sprintf('%.2f', $v);
    }

    private static function valido($v) {
        return $v !== null && $v > -990;   // NASA POWER usa -999 como valor faltante
    }

    /* ---------------- NASA POWER: clima histórico agroclimático ---------------- */

    public static function peticionClima($lat, $lon) {
        $fin = (int)date('Y') - 1;
        $inicio = $fin - self::ANIOS_HISTORICO + 1;
        $url = 'https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=' . self::POWER_PARAMS
             . '&community=AG&longitude=' . self::f($lon) . '&latitude=' . self::f($lat)
             . "&start=$inicio&end=$fin&format=JSON";
        return ['fuente' => 'nasa_power', 'url' => $url, 'ttl' => self::ttl('nasa_power')];
    }

    public static function normalizarClima($r) {
        if (!$r['ok'] || empty($r['datos']['properties']['parameter'])) {
            return ['disponible' => false, 'fuente' => 'NASA POWER', 'error' => $r['error'] ?? 'Sin datos', 'cache' => $r['cache']];
        }
        $p = $r['datos']['properties']['parameter'];
        $elevacion = $r['datos']['geometry']['coordinates'][2] ?? null;

        $anios = [];
        foreach (array_keys($p['T2M']) as $clave) {
            if (substr($clave, 4, 2) === '13') $anios[] = (int)substr($clave, 0, 4);
        }
        sort($anios);

        $porAnio = [];
        $mensual = array_fill(1, 12, ['temp' => [], 'precip' => [], 'rad' => []]);
        foreach ($anios as $y) {
            $et0 = 0; $mesesValidos = 0;
            for ($m = 1; $m <= 12; $m++) {
                $k = sprintf('%d%02d', $y, $m);
                $t = $p['T2M'][$k] ?? null;
                $rs = $p['ALLSKY_SFC_SW_DWN'][$k] ?? null;
                $pr = $p['PRECTOTCORR_SUM'][$k] ?? null;
                if (self::valido($t) && self::valido($rs)) {
                    // Hargreaves-Samani con radiación medida: ET0 = 0.0135·(T+17.8)·Rs/2.45 (mm/día)
                    $et0 += 0.0135 * ($t + 17.8) * ($rs / 2.45) * (int)date('t', mktime(0, 0, 0, $m, 1, $y));
                    $mesesValidos++;
                    $mensual[$m]['temp'][] = $t;
                    $mensual[$m]['rad'][] = $rs;
                }
                if (self::valido($pr)) $mensual[$m]['precip'][] = $pr;
            }
            $k13 = $y . '13';
            $temp = $p['T2M'][$k13] ?? null;
            if (!self::valido($temp) || $mesesValidos < 10) continue;   // año incompleto
            $porAnio[] = [
                'anio' => $y,
                'temp_media' => round($temp, 2),
                'temp_max_abs' => self::valido($p['T2M_MAX'][$k13] ?? null) ? round($p['T2M_MAX'][$k13], 2) : null,
                'temp_min_abs' => self::valido($p['T2M_MIN'][$k13] ?? null) ? round($p['T2M_MIN'][$k13], 2) : null,
                'precipitacion_mm' => self::valido($p['PRECTOTCORR_SUM'][$k13] ?? null) ? round($p['PRECTOTCORR_SUM'][$k13], 1) : null,
                'radiacion_mj' => self::valido($p['ALLSKY_SFC_SW_DWN'][$k13] ?? null) ? round($p['ALLSKY_SFC_SW_DWN'][$k13], 2) : null,
                'humedad_relativa' => self::valido($p['RH2M'][$k13] ?? null) ? round($p['RH2M'][$k13], 1) : null,
                'et0_mm' => round($et0 * 12 / max(1, $mesesValidos), 1),
            ];
        }
        if (!$porAnio) {
            return ['disponible' => false, 'fuente' => 'NASA POWER', 'error' => 'Serie incompleta', 'cache' => $r['cache']];
        }

        $prom = function ($campo, $fn = 'avg') use ($porAnio) {
            $vals = array_values(array_filter(array_column($porAnio, $campo), fn($v) => $v !== null));
            if (!$vals) return null;
            if ($fn === 'min') return min($vals);
            if ($fn === 'max') return max($vals);
            return round(array_sum($vals) / count($vals), 2);
        };
        $avg = fn($a) => $a ? round(array_sum($a) / count($a), 2) : null;

        $promedio = [
            'temp_media' => $prom('temp_media'),
            'temp_max_abs' => $prom('temp_max_abs', 'max'),
            'temp_min_abs' => $prom('temp_min_abs', 'min'),
            'precipitacion_mm' => $prom('precipitacion_mm'),
            'radiacion_mj' => $prom('radiacion_mj'),
            'humedad_relativa' => $prom('humedad_relativa'),
            'et0_mm' => $prom('et0_mm'),
        ];
        $promedio['indice_aridez'] = ($promedio['et0_mm'] && $promedio['precipitacion_mm'] !== null)
            ? round($promedio['precipitacion_mm'] / $promedio['et0_mm'], 3) : null;

        $climatologia = [];
        foreach ($mensual as $m => $v) {
            $climatologia[] = ['mes' => $m, 'temp' => $avg($v['temp']), 'precip_mm' => $avg($v['precip']), 'radiacion_mj' => $avg($v['rad'])];
        }

        return [
            'disponible' => true,
            'fuente' => 'NASA POWER (comunidad AG, mensual)',
            'periodo' => $porAnio[0]['anio'] . '-' . end($porAnio)['anio'],
            'elevacion_m' => $elevacion,
            'promedio' => $promedio,
            'anios' => $porAnio,
            'climatologia_mensual' => $climatologia,
            'cache' => $r['cache'],
        ];
    }

    /* ---------------- Open-Meteo: condiciones actuales y humedad del suelo ---------------- */

    public static function peticionActual($lat, $lon) {
        $url = 'https://api.open-meteo.com/v1/forecast?latitude=' . self::f($lat) . '&longitude=' . self::f($lon)
             . '&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code'
             . '&hourly=soil_moisture_0_to_1cm,soil_moisture_9_to_27cm,soil_temperature_6cm'
             . '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration'
             . '&forecast_days=7&timezone=auto';
        return ['fuente' => 'open_meteo', 'url' => $url, 'ttl' => self::ttl('open_meteo')];
    }

    public static function normalizarActual($r) {
        if (!$r['ok'] || empty($r['datos']['current'])) {
            return ['disponible' => false, 'fuente' => 'Open-Meteo', 'error' => $r['error'] ?? 'Sin datos', 'cache' => $r['cache']];
        }
        $d = $r['datos'];
        $hora = substr($d['current']['time'], 0, 13) . ':00';
        $idx = array_search($hora, $d['hourly']['time'] ?? []);
        if ($idx === false) $idx = 0;
        $h = $d['hourly'];
        $dl = $d['daily'];
        $suma = fn($a) => round(array_sum(array_filter($a ?? [], 'is_numeric')), 1);

        return [
            'disponible' => true,
            'fuente' => 'Open-Meteo Forecast',
            'hora_local' => $d['current']['time'],
            'zona_horaria' => $d['timezone'] ?? null,
            'temperatura' => $d['current']['temperature_2m'] ?? null,
            'humedad_relativa' => $d['current']['relative_humidity_2m'] ?? null,
            'precipitacion' => $d['current']['precipitation'] ?? null,
            'viento_kmh' => $d['current']['wind_speed_10m'] ?? null,
            'codigo_clima' => $d['current']['weather_code'] ?? null,
            'humedad_suelo_0_1cm' => $h['soil_moisture_0_to_1cm'][$idx] ?? null,
            'humedad_suelo_9_27cm' => $h['soil_moisture_9_to_27cm'][$idx] ?? null,
            'temp_suelo_6cm' => $h['soil_temperature_6cm'][$idx] ?? null,
            'pronostico_7d' => [
                'precipitacion_mm' => $suma($dl['precipitation_sum'] ?? []),
                'et0_mm' => $suma($dl['et0_fao_evapotranspiration'] ?? []),
                'temp_min' => isset($dl['temperature_2m_min']) ? min(array_filter($dl['temperature_2m_min'], 'is_numeric')) : null,
                'temp_max' => isset($dl['temperature_2m_max']) ? max(array_filter($dl['temperature_2m_max'], 'is_numeric')) : null,
            ],
            'cache' => $r['cache'],
        ];
    }

    /* ---------------- SoilGrids (ISRIC): propiedades del suelo ---------------- */

    public static function peticionSuelo($lat, $lon) {
        $props = ['phh2o', 'clay', 'sand', 'silt', 'soc', 'nitrogen', 'cec'];
        $url = 'https://rest.isric.org/soilgrids/v2.0/properties/query?lon=' . self::f($lon) . '&lat=' . self::f($lat)
             . '&property=' . implode('&property=', $props)
             . '&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean';
        return ['fuente' => 'soilgrids', 'url' => $url, 'ttl' => self::ttl('soilgrids')];
    }

    public static function normalizarSuelo($r) {
        $base = ['disponible' => false, 'fuente' => 'SoilGrids 2.0 (ISRIC)', 'cache' => $r['cache'] ?? null];
        if (!$r['ok'] || empty($r['datos']['properties']['layers'])) {
            $msg = ($r['http'] ?? 0) == 429 ? 'Límite de uso de SoilGrids alcanzado (5 consultas/min); reintenta en un minuto' : ($r['error'] ?? 'Sin datos');
            return $base + ['error' => $msg];
        }
        $pesos = ['0-5cm' => 5, '5-15cm' => 10, '15-30cm' => 15];   // promedio ponderado 0-30 cm
        $valores = [];
        foreach ($r['datos']['properties']['layers'] as $capa) {
            $suma = 0; $pesoTotal = 0;
            foreach ($capa['depths'] as $prof) {
                $v = $prof['values']['mean'] ?? null;
                if ($v === null) continue;
                $w = $pesos[$prof['label']] ?? 5;
                $suma += $v * $w;
                $pesoTotal += $w;
            }
            $valores[$capa['name']] = $pesoTotal ? ($suma / $pesoTotal) / $capa['unit_measure']['d_factor'] : null;
        }
        if (!isset($valores['phh2o']) || $valores['phh2o'] === null) {
            return $base + ['error' => 'SoilGrids no tiene dato en esta celda (zona urbana, cuerpo de agua o roca)'];
        }
        // d_factor convierte a: pH, %, g/kg, cmol(c)/kg
        return [
            'disponible' => true,
            'fuente' => 'SoilGrids 2.0 (ISRIC), media ponderada 0-30 cm',
            'ph' => round($valores['phh2o'], 1),
            'arcilla_pct' => self::r1($valores['clay'] ?? null),
            'arena_pct' => self::r1($valores['sand'] ?? null),
            'limo_pct' => self::r1($valores['silt'] ?? null),
            'carbono_organico_gkg' => self::r1($valores['soc'] ?? null),
            'nitrogeno_gkg' => isset($valores['nitrogen']) ? round($valores['nitrogen'], 2) : null,
            'cec_cmolkg' => self::r1($valores['cec'] ?? null),
            'cache' => $r['cache'],
        ];
    }

    private static function r1($v) {
        return $v === null ? null : round($v, 1);
    }

    /** SoilGrids deja huecos (ciudades, lagos). Si el punto exacto no tiene dato se prueba un vecino a ~8 km. */
    public static function suelo($lat, $lon) {
        $suelo = self::normalizarSuelo(HttpCliente::get('soilgrids', self::peticionSuelo($lat, $lon)['url'], self::ttl('soilgrids')));
        if ($suelo['disponible'] || strpos($suelo['error'] ?? '', 'no tiene dato') === false) return $suelo;

        foreach ([[0.08, 0], [-0.08, 0], [0, 0.08], [0, -0.08]] as [$dLat, $dLon]) {
            $p = self::peticionSuelo($lat + $dLat, $lon + $dLon);
            $vecino = self::normalizarSuelo(HttpCliente::get('soilgrids', $p['url'], $p['ttl']));
            if ($vecino['disponible']) {
                $vecino['nota'] = 'Dato tomado de la celda vecina más cercana con información (~8 km)';
                return $vecino;
            }
            if (strpos($vecino['error'] ?? '', 'no tiene dato') === false) break;   // límite o error: no insistir
        }
        return $suelo;
    }

    /* ---------------- GBIF: biodiversidad ---------------- */

    /** Obtiene (y persiste en MySQL) el taxonKey de GBIF de una especie del catálogo. */
    public static function taxonKey(array $especie) {
        if (!empty($especie['gbif_taxon_key'])) return (int)$especie['gbif_taxon_key'];
        $nombre = $especie['nombre_gbif'] ?: $especie['nombre_cientifico'];
        $r = HttpCliente::get('gbif_especie', 'https://api.gbif.org/v1/species/match?name=' . rawurlencode($nombre), self::ttl('gbif_especie'));
        $key = $r['ok'] ? ($r['datos']['speciesKey'] ?? $r['datos']['usageKey'] ?? null) : null;
        if ($key && ($pdo = Database::tryConnection())) {
            $pdo->prepare("UPDATE especies SET gbif_taxon_key = ? WHERE id = ?")->execute([$key, $especie['id']]);
        }
        return $key ? (int)$key : null;
    }

    public static function peticionConteo($taxonKey, $lat, $lon, $radioKm) {
        $url = "https://api.gbif.org/v1/occurrence/search?taxonKey=$taxonKey&geoDistance=" . self::f($lat) . ',' . self::f($lon) . ",{$radioKm}km"
             . '&hasGeospatialIssue=false&limit=0';
        return ['fuente' => 'gbif_conteo', 'url' => $url, 'ttl' => self::ttl('gbif_conteo')];
    }

    public static function peticionesOcurrencias($taxonKey, $limite) {
        $peticiones = [
            'facetas' => ['fuente' => 'gbif_puntos', 'url' => "https://api.gbif.org/v1/occurrence/search?taxonKey=$taxonKey&hasCoordinate=true&hasGeospatialIssue=false&limit=0&facet=country&facetLimit=8", 'ttl' => self::ttl('gbif_puntos')],
        ];
        for ($offset = 0; $offset < $limite; $offset += 300) {
            $peticiones["p$offset"] = [
                'fuente' => 'gbif_puntos',
                'url' => "https://api.gbif.org/v1/occurrence/search?taxonKey=$taxonKey&hasCoordinate=true&hasGeospatialIssue=false&limit=300&offset=$offset",
                'ttl' => self::ttl('gbif_puntos'),
            ];
        }
        return $peticiones;
    }

    public static function urlMapaDensidad($taxonKey, $x) {
        // Tiles EPSG:4326 (equirectangular): en zoom 0 hay 2 tiles (oeste x=0, este x=1), ideales para texturizar una esfera
        return "https://api.gbif.org/v2/map/occurrence/density/0/$x/0@1x.png?srs=EPSG:4326&taxonKey=$taxonKey&style=purpleYellow.point";
    }

    /* ---------------- Geocodificación ---------------- */

    public static function peticionLugar($lat, $lon) {
        // Open-Meteo Geocoding solo hace búsqueda por nombre; para coordenadas → nombre se usa Nominatim (OSM)
        $url = 'https://nominatim.openstreetmap.org/reverse?lat=' . self::f($lat) . '&lon=' . self::f($lon)
             . '&format=jsonv2&zoom=10&accept-language=es';
        return ['fuente' => 'geocodificar', 'url' => $url, 'ttl' => self::ttl('geocodificar')];
    }

    public static function normalizarLugar($r, $lat, $lon) {
        $coord = sprintf('%.2f°, %.2f°', $lat, $lon);
        if (!$r['ok'] || !empty($r['datos']['error'])) {
            return ['disponible' => false, 'nombre' => "Punto $coord", 'region' => null, 'pais' => 'Sin país (océano o zona remota)', 'codigo_pais' => null, 'cache' => $r['cache'] ?? null];
        }
        $a = $r['datos']['address'] ?? [];
        $nombre = $a['city'] ?? $a['town'] ?? $a['village'] ?? $a['municipality'] ?? $a['county'] ?? $r['datos']['name'] ?? "Punto $coord";
        return [
            'disponible' => true,
            'nombre' => $nombre,
            'region' => $a['state'] ?? $a['region'] ?? null,
            'pais' => $a['country'] ?? null,
            'codigo_pais' => isset($a['country_code']) ? strtoupper($a['country_code']) : null,
            'descripcion' => $r['datos']['display_name'] ?? null,
            'cache' => $r['cache'],
        ];
    }

    public static function buscarLugares($texto) {
        $url = 'https://geocoding-api.open-meteo.com/v1/search?name=' . rawurlencode($texto) . '&count=8&language=es&format=json';
        $r = HttpCliente::get('geocodificar', $url, self::ttl('geocodificar'));
        if (!$r['ok']) return ['resultados' => [], 'error' => $r['error']];
        $res = array_map(fn($x) => [
            'nombre' => $x['name'],
            'region' => $x['admin1'] ?? null,
            'pais' => $x['country'] ?? null,
            'codigo_pais' => $x['country_code'] ?? null,
            'lat' => $x['latitude'],
            'lon' => $x['longitude'],
            'elevacion' => $x['elevation'] ?? null,
            'poblacion' => $x['population'] ?? null,
        ], $r['datos']['results'] ?? []);
        return ['resultados' => $res, 'cache' => $r['cache']];
    }
}
