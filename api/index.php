<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (file_exists(__DIR__ . '/vendor/autoload.php')) {
    require __DIR__ . '/vendor/autoload.php';
} else {
    require __DIR__ . '/Flight.php';
}
require __DIR__ . '/db.php';
require __DIR__ . '/lib/HttpCliente.php';
require __DIR__ . '/lib/GeoServicios.php';

// Catálogo mínimo para que el proxy GBIF funcione aunque MySQL no esté disponible
const ESPECIES_RESPALDO = [
    ['id' => 1, 'nombre_cientifico' => 'Agave tequilana Weber', 'nombre_comun' => 'Agave Azul (Tequilero)', 'nombre_gbif' => 'Agave tequilana', 'gbif_taxon_key' => null],
    ['id' => 2, 'nombre_cientifico' => 'Agave angustifolia Haw', 'nombre_comun' => 'Agave Espadín (Mezcalero)', 'nombre_gbif' => 'Agave angustifolia', 'gbif_taxon_key' => null],
    ['id' => 3, 'nombre_cientifico' => 'Agave salmiana Otto', 'nombre_comun' => 'Maguey Pulquero / Manso', 'nombre_gbif' => 'Agave salmiana', 'gbif_taxon_key' => null],
    ['id' => 4, 'nombre_cientifico' => 'Agave cupreata Trel', 'nombre_comun' => 'Agave Papalote', 'nombre_gbif' => 'Agave cupreata', 'gbif_taxon_key' => null],
    ['id' => 5, 'nombre_cientifico' => 'Arabidopsis thaliana', 'nombre_comun' => 'Arabidopsis (Modelo Genético)', 'nombre_gbif' => 'Arabidopsis thaliana', 'gbif_taxon_key' => null],
];
const GBIF_GENERO_AGAVE = 2766430;

function especiesParaGbif() {
    $pdo = Database::tryConnection();
    if ($pdo) {
        try {
            return $pdo->query("SELECT id, nombre_cientifico, nombre_comun, nombre_gbif, gbif_taxon_key FROM especies ORDER BY id")->fetchAll();
        } catch (PDOException $e) {}
    }
    return ESPECIES_RESPALDO;
}

function especiePorId($id) {
    foreach (especiesParaGbif() as $e) {
        if ((int)$e['id'] === (int)$id) return $e;
    }
    return null;
}

function coordenadasDeQuery() {
    $q = Flight::request()->query;
    $c = GeoServicios::coordenadas($q->lat ?? null, $q->lon ?? null);
    if (!$c) Flight::json(['error' => 'Parámetros lat/lon inválidos. Rango: lat [-90, 90], lon [-180, 180].'], 400);
    return $c;
}

function radioDeQuery() {
    $radio = (int)(Flight::request()->query->radio ?? 100);
    return max(10, min(500, $radio));
}

/** Conteos GBIF por especie dentro de un radio (peticiones en paralelo). */
function conteosGbif($lat, $lon, $radio, $especies) {
    $peticiones = [];
    foreach ($especies as $e) {
        $key = GeoServicios::taxonKey($e);
        if ($key) $peticiones['e' . $e['id']] = GeoServicios::peticionConteo($key, $lat, $lon, $radio);
    }
    $peticiones['genero'] = GeoServicios::peticionConteo(GBIF_GENERO_AGAVE, $lat, $lon, $radio);
    $res = HttpCliente::multi($peticiones);
    return normalizarConteos($res, $especies, $radio);
}

function normalizarConteos($res, $especies, $radio) {
    $porEspecie = [];
    foreach ($especies as $e) {
        $r = $res['e' . $e['id']] ?? null;
        $porEspecie[] = [
            'especie_id' => (int)$e['id'],
            'nombre_cientifico' => $e['nombre_cientifico'],
            'conteo' => ($r && $r['ok']) ? (int)$r['datos']['count'] : null,
        ];
    }
    $g = $res['genero'] ?? null;
    $estados = array_column(array_filter($res, fn($r) => is_array($r)), 'cache');
    return [
        'disponible' => (bool)array_filter($porEspecie, fn($x) => $x['conteo'] !== null),
        'fuente' => 'GBIF Occurrence API',
        'radio_km' => $radio,
        'genero_agave' => ($g && $g['ok']) ? (int)$g['datos']['count'] : null,
        'especies' => $porEspecie,
        'cache' => in_array('MISS', $estados) ? 'MISS' : (in_array('ERROR', $estados) ? 'ERROR' : 'HIT'),
    ];
}

function guardarUbicacion(PDO $pdo, array $u) {
    $lat = round((float)$u['lat'], 5);
    $lon = round((float)$u['lon'], 5);
    $stmt = $pdo->prepare("SELECT id FROM ubicaciones WHERE ABS(latitud - ?) < 0.005 AND ABS(longitud - ?) < 0.005 LIMIT 1");
    $stmt->execute([$lat, $lon]);
    $id = $stmt->fetchColumn();
    if ($id) return (int)$id;

    $pdo->prepare("INSERT INTO ubicaciones (nombre, region, pais, codigo_pais, latitud, longitud, elevacion_m, tipo) VALUES (?, ?, ?, ?, ?, ?, ?, 'usuario')")
        ->execute([
            mb_substr(strip_tags($u['nombre'] ?? 'Punto sin nombre'), 0, 150),
            isset($u['region']) ? mb_substr(strip_tags($u['region']), 0, 120) : null,
            isset($u['pais']) ? mb_substr(strip_tags($u['pais']), 0, 80) : null,
            isset($u['codigo_pais']) ? substr(preg_replace('/[^A-Z]/', '', strtoupper($u['codigo_pais'])), 0, 2) : null,
            $lat, $lon,
            isset($u['elevacion']) && is_numeric($u['elevacion']) ? (float)$u['elevacion'] : null,
        ]);
    return (int)$pdo->lastInsertId();
}

function numeroONulo($v) {
    return is_numeric($v) ? (float)$v : null;
}

/** Inserta un análisis geoespacial (con sus decisiones geo) dentro de la transacción en curso. */
function guardarAnalisis(PDO $pdo, array $a, $simulacionId = null) {
    if (empty($a['ubicacion']) || empty($a['especie_id']) || !isset($a['idoneidad'])) {
        throw new InvalidArgumentException('Análisis incompleto: se requieren ubicacion, especie_id e idoneidad');
    }
    if (!GeoServicios::coordenadas($a['ubicacion']['lat'] ?? null, $a['ubicacion']['lon'] ?? null)) {
        throw new InvalidArgumentException('Coordenadas inválidas en el análisis');
    }
    $ubicacionId = guardarUbicacion($pdo, $a['ubicacion']);
    $clases = ['alta', 'media', 'baja', 'no_apta'];
    $d = $a['datos'] ?? [];

    $stmt = $pdo->prepare("
        INSERT INTO analisis_geo (ubicacion_id, especie_id, simulacion_id, periodo_clima, temp_media, temp_max_abs, temp_min_abs,
            precipitacion_anual, radiacion_solar, humedad_relativa, evapotranspiracion, humedad_suelo_actual, ph_suelo, arcilla_pct,
            arena_pct, carbono_organico, nitrogeno, ocurrencias_gbif, radio_gbif_km, idoneidad, clase_idoneidad,
            detalle_idoneidad, params_simulacion, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $ubicacionId,
        (int)$a['especie_id'],
        $simulacionId,
        isset($d['periodo_clima']) ? mb_substr(strip_tags($d['periodo_clima']), 0, 20) : null,
        numeroONulo($d['temp_media'] ?? null),
        numeroONulo($d['temp_max_abs'] ?? null),
        numeroONulo($d['temp_min_abs'] ?? null),
        numeroONulo($d['precipitacion_anual'] ?? null),
        numeroONulo($d['radiacion_solar'] ?? null),
        numeroONulo($d['humedad_relativa'] ?? null),
        numeroONulo($d['evapotranspiracion'] ?? null),
        numeroONulo($d['humedad_suelo_actual'] ?? null),
        numeroONulo($d['ph_suelo'] ?? null),
        numeroONulo($d['arcilla_pct'] ?? null),
        numeroONulo($d['arena_pct'] ?? null),
        numeroONulo($d['carbono_organico'] ?? null),
        numeroONulo($d['nitrogeno'] ?? null),
        isset($d['ocurrencias_gbif']) && is_numeric($d['ocurrencias_gbif']) ? (int)$d['ocurrencias_gbif'] : null,
        (int)($d['radio_gbif_km'] ?? 100),
        max(0, min(100, (float)$a['idoneidad'])),
        in_array($a['clase_idoneidad'] ?? '', $clases, true) ? $a['clase_idoneidad'] : 'no_apta',
        json_encode($a['detalle_idoneidad'] ?? null, JSON_UNESCAPED_UNICODE),
        json_encode($a['params_simulacion'] ?? null, JSON_UNESCAPED_UNICODE),
        isset($a['notas']) ? mb_substr(htmlspecialchars(strip_tags($a['notas'])), 0, 255) : null,
    ]);
    $analisisId = (int)$pdo->lastInsertId();

    if (!empty($a['decisiones']) && is_array($a['decisiones'])) {
        $stmtDec = $pdo->prepare("
            INSERT INTO decisiones (simulacion_id, analisis_id, categoria, severidad, tick_dia, tipo_alerta, indicador_valor, umbral, recomendacion)
            VALUES (?, ?, 'geo', ?, 0, ?, ?, ?, ?)
        ");
        foreach ($a['decisiones'] as $dec) {
            $stmtDec->execute([
                $simulacionId,
                $analisisId,
                in_array($dec['severidad'] ?? '', ['info', 'advertencia', 'critica'], true) ? $dec['severidad'] : 'info',
                mb_substr(htmlspecialchars(strip_tags($dec['tipo_alerta'] ?? '')), 0, 60),
                (float)($dec['indicador_valor'] ?? 0),
                (float)($dec['umbral'] ?? 0),
                mb_substr(htmlspecialchars(strip_tags($dec['recomendacion'] ?? '')), 0, 255),
            ]);
        }
    }
    return ['analisis_id' => $analisisId, 'ubicacion_id' => $ubicacionId];
}

/* =====================================================================
 *  RUTAS DE LA PRÁCTICA 05 (ampliadas)
 * ===================================================================== */

// RUTA 1: Catálogo de especies con sus umbrales ambientales
Flight::route('GET /especies', function() {
    $pdo = Database::getConnection();
    $especies = $pdo->query("SELECT * FROM especies ORDER BY id ASC")->fetchAll();
    $umbrales = $pdo->query("SELECT * FROM umbrales_ambientales")->fetchAll();
    foreach ($especies as &$e) {
        $e['umbrales'] = [];
        foreach ($umbrales as $u) {
            if ((int)$u['especie_id'] !== (int)$e['id']) continue;
            $e['umbrales'][$u['variable']] = [
                'letal_min' => (float)$u['letal_min'], 'critico_min' => (float)$u['critico_min'],
                'optimo_min' => (float)$u['optimo_min'], 'optimo_max' => (float)$u['optimo_max'],
                'critico_max' => (float)$u['critico_max'], 'letal_max' => (float)$u['letal_max'],
                'tol_bajo_dias' => (int)$u['tol_bajo_dias'], 'tol_alto_dias' => (int)$u['tol_alto_dias'],
            ];
        }
    }
    Flight::json($especies);
});

// RUTA 2: Historial de simulaciones
Flight::route('GET /simulaciones', function() {
    $pdo = Database::getConnection();
    $sql = "SELECT s.*, e.nombre_comun, e.nombre_cientifico, e.color_hex, u.nombre AS ubicacion_nombre, u.pais AS ubicacion_pais
            FROM simulaciones s
            INNER JOIN especies e ON s.especie_id = e.id
            LEFT JOIN ubicaciones u ON s.ubicacion_id = u.id
            ORDER BY s.fecha_creacion DESC LIMIT 30";
    Flight::json($pdo->query($sql)->fetchAll());
});

// RUTA 3: Una simulación con sus mediciones, decisiones y análisis geo asociado
Flight::route('GET /simulaciones/@id', function($id) {
    $pdo = Database::getConnection();
    $id = filter_var($id, FILTER_VALIDATE_INT);
    if (!$id) Flight::json(['error' => 'ID inválido'], 400);

    $stmt = $pdo->prepare("SELECT s.*, e.nombre_comun, e.nombre_cientifico FROM simulaciones s JOIN especies e ON s.especie_id = e.id WHERE s.id = ?");
    $stmt->execute([$id]);
    $sim = $stmt->fetch();
    if (!$sim) Flight::json(['error' => 'Simulación no encontrada'], 404);

    $stmtMed = $pdo->prepare("SELECT * FROM mediciones WHERE simulacion_id = ? ORDER BY tick_dia ASC");
    $stmtMed->execute([$id]);
    $sim['mediciones'] = $stmtMed->fetchAll();

    $stmtDec = $pdo->prepare("SELECT * FROM decisiones WHERE simulacion_id = ? ORDER BY categoria, tick_dia ASC");
    $stmtDec->execute([$id]);
    $sim['decisiones'] = $stmtDec->fetchAll();

    $stmtGeo = $pdo->prepare("SELECT a.*, u.nombre AS ubicacion_nombre, u.latitud, u.longitud, u.pais FROM analisis_geo a JOIN ubicaciones u ON a.ubicacion_id = u.id WHERE a.simulacion_id = ?");
    $stmtGeo->execute([$id]);
    $sim['analisis_geo'] = $stmtGeo->fetch() ?: null;
    if ($sim['analisis_geo']) {
        $sim['analisis_geo']['params_simulacion'] = json_decode($sim['analisis_geo']['params_simulacion'], true);
    }

    Flight::json($sim);
});

// RUTA 4: Guardar simulación (+ mediciones, decisiones y, si viene del globo, el análisis geoespacial)
Flight::route('POST /simulaciones', function() {
    $pdo = Database::getConnection();
    $body = json_decode(Flight::request()->getBody(), true);

    if (!$body || empty($body['nombre']) || empty($body['especie_id'])) {
        Flight::json(['error' => 'Datos incompletos para guardar la simulación'], 400);
    }
    $estados = ['saludable', 'estres_reversible', 'danio_parcial', 'danio_severo', 'muerta'];
    $modelos = ['logistico', 'gompertz', 'exponencial', 'lineal'];

    try {
        $pdo->beginTransaction();

        $geo = null;
        if (!empty($body['analisis_geo']) && is_array($body['analisis_geo'])) {
            $geo = guardarAnalisis($pdo, $body['analisis_geo']);
        }

        $stmt = $pdo->prepare("
            INSERT INTO simulaciones
            (nombre, especie_id, ubicacion_id, origen, modelo_matematico, tasa_r, capacidad_k, luz, agua, temperatura, temp_minima, nutrientes, ph, co2,
             biomasa_final, altura_final, estres_promedio, icr_promedio, danio_final, danio_permanente, estado_final,
             dias_simulados, dias_estimados_cosecha, es_escenario_ab, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            htmlspecialchars(strip_tags($body['nombre'])),
            (int)$body['especie_id'],
            $geo ? $geo['ubicacion_id'] : null,
            $geo ? 'geo' : 'manual',
            in_array($body['modelo_matematico'] ?? '', $modelos, true) ? $body['modelo_matematico'] : 'logistico',
            (float)$body['tasa_r'],
            (float)$body['capacidad_k'],
            (float)$body['luz'],
            (float)$body['agua'],
            (float)$body['temperatura'],
            numeroONulo($body['temp_minima'] ?? null),
            (float)$body['nutrientes'],
            numeroONulo($body['ph'] ?? null),
            (float)$body['co2'],
            (float)$body['biomasa_final'],
            (float)$body['altura_final'],
            (float)$body['estres_promedio'],
            (float)($body['icr_promedio'] ?? 0.04),
            (float)($body['danio_final'] ?? 0),
            (float)($body['danio_permanente'] ?? 0),
            in_array($body['estado_final'] ?? '', $estados, true) ? $body['estado_final'] : 'saludable',
            (int)$body['dias_simulados'],
            (int)$body['dias_estimados_cosecha'],
            !empty($body['es_escenario_ab']) ? 1 : 0,
            htmlspecialchars(strip_tags($body['notas'] ?? ''))
        ]);
        $simId = (int)$pdo->lastInsertId();

        if ($geo) {
            $pdo->prepare("UPDATE analisis_geo SET simulacion_id = ? WHERE id = ?")->execute([$simId, $geo['analisis_id']]);
            $pdo->prepare("UPDATE decisiones SET simulacion_id = ? WHERE analisis_id = ?")->execute([$simId, $geo['analisis_id']]);
        }

        if (!empty($body['mediciones']) && is_array($body['mediciones'])) {
            $stmtMed = $pdo->prepare("
                INSERT INTO mediciones (simulacion_id, tick_dia, altura, biomasa, num_hojas, num_ramas, icr, estres_hidrico, estres_termico, estres_global, danio_acumulado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            foreach ($body['mediciones'] as $m) {
                $stmtMed->execute([
                    $simId,
                    (int)$m['tick_dia'],
                    (float)$m['altura'],
                    (float)$m['biomasa'],
                    (int)$m['num_hojas'],
                    (int)($m['num_ramas'] ?? 1),
                    (float)$m['icr'],
                    (float)$m['estres_hidrico'],
                    (float)$m['estres_termico'],
                    (float)$m['estres_global'],
                    (float)($m['danio_acumulado'] ?? 0)
                ]);
            }
        }

        if (!empty($body['decisiones']) && is_array($body['decisiones'])) {
            $stmtDec = $pdo->prepare("
                INSERT INTO decisiones (simulacion_id, categoria, severidad, tick_dia, tipo_alerta, indicador_valor, umbral, recomendacion)
                VALUES (?, 'fisiologica', ?, ?, ?, ?, ?, ?)
            ");
            foreach ($body['decisiones'] as $d) {
                $stmtDec->execute([
                    $simId,
                    in_array($d['severidad'] ?? '', ['info', 'advertencia', 'critica'], true) ? $d['severidad'] : 'info',
                    (int)$d['tick_dia'],
                    mb_substr(htmlspecialchars(strip_tags($d['tipo_alerta'])), 0, 60),
                    (float)$d['indicador_valor'],
                    (float)$d['umbral'],
                    mb_substr(htmlspecialchars(strip_tags($d['recomendacion'])), 0, 255)
                ]);
            }
        }

        $pdo->commit();
        Flight::json(['mensaje' => 'Simulación guardada exitosamente en MySQL', 'id' => $simId, 'analisis_id' => $geo['analisis_id'] ?? null], 201);
    } catch (Exception $e) {
        $pdo->rollBack();
        Flight::json(['error' => 'Error al guardar en base de datos', 'detalle' => $e->getMessage()], 500);
    }
});

// RUTA 5: Reportes analíticos
Flight::route('GET /reportes', function() {
    $pdo = Database::getConnection();

    $top5 = $pdo->query("
        SELECT s.id, s.nombre, s.modelo_matematico, s.biomasa_final, s.altura_final, s.estres_promedio, s.estado_final, s.dias_simulados,
               e.nombre_comun, u.nombre AS ubicacion_nombre
        FROM simulaciones s
        INNER JOIN especies e ON s.especie_id = e.id
        LEFT JOIN ubicaciones u ON s.ubicacion_id = u.id
        ORDER BY s.biomasa_final DESC
        LIMIT 5
    ")->fetchAll();

    $eficiencia = $pdo->query("
        SELECT e.nombre_comun, e.nombre_cientifico,
               COUNT(s.id) AS total_corridas,
               ROUND(AVG(s.biomasa_final), 2) AS biomasa_promedio,
               ROUND(AVG(s.biomasa_final / NULLIF(s.dias_simulados, 0)), 2) AS eficiencia_diaria,
               ROUND(AVG(s.dias_estimados_cosecha), 1) AS tiempo_promedio_madurez,
               SUM(s.estado_final = 'muerta') AS corridas_muertas
        FROM especies e
        INNER JOIN simulaciones s ON s.especie_id = e.id
        GROUP BY e.id
        ORDER BY eficiencia_diaria DESC
    ")->fetchAll();

    $resumen = $pdo->query("
        SELECT COUNT(*) AS total_simulaciones,
               ROUND(AVG(dias_estimados_cosecha), 1) AS promedio_madurez_global,
               ROUND(MAX(biomasa_final), 2) AS record_biomasa,
               SUM(origen = 'geo') AS simulaciones_geo
        FROM simulaciones
    ")->fetch();

    $mejoresSitios = $pdo->query("
        SELECT a.id, u.nombre, u.pais, e.nombre_comun, a.idoneidad, a.clase_idoneidad, a.ocurrencias_gbif, a.fecha_creacion
        FROM analisis_geo a
        JOIN ubicaciones u ON a.ubicacion_id = u.id
        JOIN especies e ON a.especie_id = e.id
        ORDER BY a.idoneidad DESC
        LIMIT 10
    ")->fetchAll();

    Flight::json([
        'top5_biomasa' => $top5,
        'eficiencia_especies' => $eficiencia,
        'resumen_global' => $resumen,
        'mejores_sitios' => $mejoresSitios
    ]);
});

/* =====================================================================
 *  RUTAS GEOESPACIALES (proxy seguro a APIs públicas)
 *  frontend → FlightPHP → caché MySQL → cURL → API externa → JSON normalizado
 * ===================================================================== */

// Clima histórico agroclimático (NASA POWER, últimos 7 años completos)
Flight::route('GET /geo/clima', function() {
    [$lat, $lon] = coordenadasDeQuery();
    $p = GeoServicios::peticionClima($lat, $lon);
    $clima = GeoServicios::normalizarClima(HttpCliente::get($p['fuente'], $p['url'], $p['ttl']));
    Flight::json(['lat' => $lat, 'lon' => $lon] + $clima, $clima['disponible'] ? 200 : 502);
});

// Condiciones actuales y humedad del suelo (Open-Meteo)
Flight::route('GET /geo/actual', function() {
    [$lat, $lon] = coordenadasDeQuery();
    $p = GeoServicios::peticionActual($lat, $lon);
    $actual = GeoServicios::normalizarActual(HttpCliente::get($p['fuente'], $p['url'], $p['ttl']));
    Flight::json(['lat' => $lat, 'lon' => $lon] + $actual, $actual['disponible'] ? 200 : 502);
});

// Propiedades del suelo (SoilGrids)
Flight::route('GET /geo/suelo', function() {
    [$lat, $lon] = coordenadasDeQuery();
    $suelo = GeoServicios::suelo($lat, $lon);
    Flight::json(['lat' => $lat, 'lon' => $lon] + $suelo, $suelo['disponible'] ? 200 : 502);
});

// Biodiversidad: ocurrencias GBIF de cada especie del catálogo en un radio
Flight::route('GET /geo/biodiversidad', function() {
    [$lat, $lon] = coordenadasDeQuery();
    $radio = radioDeQuery();
    Flight::json(['lat' => $lat, 'lon' => $lon] + conteosGbif($lat, $lon, $radio, especiesParaGbif()));
});

// Geocodificación inversa (coordenadas → nombre)
Flight::route('GET /geo/lugar', function() {
    [$lat, $lon] = coordenadasDeQuery();
    $p = GeoServicios::peticionLugar($lat, $lon);
    Flight::json(GeoServicios::normalizarLugar(HttpCliente::get($p['fuente'], $p['url'], $p['ttl']), $lat, $lon));
});

// Búsqueda de lugares por nombre (Open-Meteo Geocoding)
Flight::route('GET /geo/buscar', function() {
    $q = trim((string)(Flight::request()->query->q ?? ''));
    if (mb_strlen($q) < 2 || mb_strlen($q) > 80) Flight::json(['error' => 'Escribe entre 2 y 80 caracteres'], 400);
    Flight::json(GeoServicios::buscarLugares($q));
});

// Endpoint agregado: todo lo de un punto en una sola llamada (peticiones externas en paralelo)
Flight::route('GET /geo/punto', function() {
    [$lat, $lon] = coordenadasDeQuery();
    $radio = radioDeQuery();
    $especies = especiesParaGbif();
    $inicio = microtime(true);

    $peticiones = [
        'clima' => GeoServicios::peticionClima($lat, $lon),
        'actual' => GeoServicios::peticionActual($lat, $lon),
        'lugar' => GeoServicios::peticionLugar($lat, $lon),
        'suelo' => GeoServicios::peticionSuelo($lat, $lon),
        'genero' => GeoServicios::peticionConteo(GBIF_GENERO_AGAVE, $lat, $lon, $radio),
    ];
    foreach ($especies as $e) {
        $key = GeoServicios::taxonKey($e);
        if ($key) $peticiones['e' . $e['id']] = GeoServicios::peticionConteo($key, $lat, $lon, $radio);
    }
    $res = HttpCliente::multi($peticiones);

    $suelo = GeoServicios::normalizarSuelo($res['suelo']);
    if (!$suelo['disponible'] && strpos($suelo['error'] ?? '', 'no tiene dato') !== false) {
        $suelo = GeoServicios::suelo($lat, $lon);   // intenta celdas vecinas
    }

    Flight::json([
        'lat' => $lat,
        'lon' => $lon,
        'lugar' => GeoServicios::normalizarLugar($res['lugar'], $lat, $lon),
        'clima' => GeoServicios::normalizarClima($res['clima']),
        'actual' => GeoServicios::normalizarActual($res['actual']),
        'suelo' => $suelo,
        'gbif' => normalizarConteos($res, $especies, $radio),
        'cache_por_fuente' => array_map(fn($r) => $r['cache'], $res),
        'tiempo_ms' => (int)round((microtime(true) - $inicio) * 1000),
    ]);
});

// Ocurrencias GBIF de una especie (puntos para el globo) + países con más registros
Flight::route('GET /geo/ocurrencias', function() {
    $q = Flight::request()->query;
    $especie = especiePorId((int)($q->especie_id ?? 0));
    if (!$especie) Flight::json(['error' => 'Especie no encontrada'], 404);
    $limite = max(300, min(1500, (int)($q->limite ?? 900)));
    $key = GeoServicios::taxonKey($especie);
    if (!$key) Flight::json(['error' => 'No se pudo resolver la especie en GBIF'], 502);

    $res = HttpCliente::multi(GeoServicios::peticionesOcurrencias($key, $limite));
    $puntos = [];
    $total = null;
    foreach ($res as $id => $r) {
        if (!$r['ok']) continue;
        if ($id === 'facetas') {
            $total = (int)$r['datos']['count'];
            continue;
        }
        foreach ($r['datos']['results'] ?? [] as $o) {
            if (!isset($o['decimalLatitude'], $o['decimalLongitude'])) continue;
            $puntos[] = [
                round($o['decimalLatitude'], 4),
                round($o['decimalLongitude'], 4),
                $o['countryCode'] ?? null,
                $o['year'] ?? null,
                $o['basisOfRecord'] ?? null,
            ];
        }
    }
    $paises = [];
    foreach (($res['facetas']['datos']['facets'][0]['counts'] ?? []) as $c) {
        $paises[] = ['codigo' => $c['name'], 'conteo' => (int)$c['count']];
    }
    Flight::json([
        'especie_id' => (int)$especie['id'],
        'taxon_key' => $key,
        'total_registros' => $total,
        'mostrados' => count($puntos),
        'campos' => ['lat', 'lon', 'pais', 'anio', 'tipo_registro'],
        'puntos' => $puntos,
        'paises' => $paises,
        'cache' => $res['facetas']['cache'] ?? null,
    ]);
});

// Mapa de densidad GBIF (tile PNG EPSG:4326) servido por el proxy para usarlo como textura WebGL
Flight::route('GET /geo/mapa-densidad', function() {
    $q = Flight::request()->query;
    $especie = especiePorId((int)($q->especie_id ?? 0));
    $x = (int)($q->x ?? 0) === 1 ? 1 : 0;
    $key = $especie ? GeoServicios::taxonKey($especie) : null;
    if (!$key) Flight::json(['error' => 'Especie no encontrada en GBIF'], 404);

    $r = HttpCliente::get('gbif_mapa', GeoServicios::urlMapaDensidad($key, $x), Database::config()['ttl']['gbif_mapa'], true);
    if (!$r['ok']) Flight::json(['error' => 'GBIF Maps no respondió', 'detalle' => $r['error']], 502);
    header('Content-Type: image/png');
    header('Cache-Control: public, max-age=86400');
    header('X-Cache: ' . $r['cache']);
    echo $r['datos'];
    exit;
});

// Ubicaciones de referencia y guardadas (marcadores del globo)
Flight::route('GET /geo/ubicaciones', function() {
    $pdo = Database::getConnection();
    Flight::json($pdo->query("
        SELECT u.*, COUNT(a.id) AS total_analisis, MAX(a.idoneidad) AS mejor_idoneidad
        FROM ubicaciones u
        LEFT JOIN analisis_geo a ON a.ubicacion_id = u.id
        GROUP BY u.id
        ORDER BY u.tipo, u.nombre
    ")->fetchAll());
});

// Historial de análisis geoespaciales (para ranking y marcadores)
Flight::route('GET /geo/analisis', function() {
    $pdo = Database::getConnection();
    $especieId = filter_var(Flight::request()->query->especie_id ?? null, FILTER_VALIDATE_INT);
    $sql = "SELECT a.id, a.especie_id, a.simulacion_id, a.idoneidad, a.clase_idoneidad, a.ocurrencias_gbif, a.temp_media,
                   a.precipitacion_anual, a.radiacion_solar, a.ph_suelo, a.arcilla_pct, a.periodo_clima, a.fecha_creacion,
                   u.id AS ubicacion_id, u.nombre, u.region, u.pais, u.latitud, u.longitud,
                   e.nombre_comun, s.biomasa_final, s.estado_final
            FROM analisis_geo a
            JOIN ubicaciones u ON a.ubicacion_id = u.id
            JOIN especies e ON a.especie_id = e.id
            LEFT JOIN simulaciones s ON a.simulacion_id = s.id";
    if ($especieId) {
        $stmt = $pdo->prepare("$sql WHERE a.especie_id = ? ORDER BY a.idoneidad DESC LIMIT 100");
        $stmt->execute([$especieId]);
        Flight::json($stmt->fetchAll());
    }
    Flight::json($pdo->query("$sql ORDER BY a.fecha_creacion DESC LIMIT 100")->fetchAll());
});

// Guardar un análisis geoespacial (sin simulación)
Flight::route('POST /geo/analisis', function() {
    $pdo = Database::getConnection();
    $body = json_decode(Flight::request()->getBody(), true);
    if (!is_array($body)) Flight::json(['error' => 'JSON inválido'], 400);
    try {
        $pdo->beginTransaction();
        $ids = guardarAnalisis($pdo, $body);
        $pdo->commit();
        Flight::json(['mensaje' => 'Análisis geoespacial guardado', 'id' => $ids['analisis_id'], 'ubicacion_id' => $ids['ubicacion_id']], 201);
    } catch (InvalidArgumentException $e) {
        $pdo->rollBack();
        Flight::json(['error' => $e->getMessage()], 400);
    } catch (Exception $e) {
        $pdo->rollBack();
        Flight::json(['error' => 'Error al guardar el análisis', 'detalle' => $e->getMessage()], 500);
    }
});

// Estado del caché de APIs (transparencia sobre el uso de las APIs externas)
Flight::route('GET /geo/cache', function() {
    $pdo = Database::getConnection();
    Flight::json([
        'por_fuente' => $pdo->query("
            SELECT fuente, COUNT(*) AS entradas, SUM(hits) AS hits, ROUND(SUM(bytes) / 1024, 1) AS kb,
                   SUM(expira_en > NOW()) AS vigentes, MIN(expira_en) AS proxima_expiracion
            FROM api_cache GROUP BY fuente ORDER BY fuente
        ")->fetchAll(),
        'ttl_segundos' => Database::config()['ttl'],
    ]);
});

Flight::start();
