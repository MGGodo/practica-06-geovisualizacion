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

// RUTA 1: Obtener el catálogo completo de especies biológicas
Flight::route('GET /especies', function() {
    $pdo = Database::getConnection();
    $stmt = $pdo->query("SELECT * FROM especies ORDER BY id ASC");
    Flight::json($stmt->fetchAll());
});

// RUTA 2: Obtener historial de simulaciones guardadas
Flight::route('GET /simulaciones', function() {
    $pdo = Database::getConnection();
    $sql = "SELECT s.*, e.nombre_comun, e.nombre_cientifico, e.color_hex
            FROM simulaciones s
            INNER JOIN especies e ON s.especie_id = e.id
            ORDER BY s.fecha_creacion DESC LIMIT 30";
    $stmt = $pdo->query($sql);
    Flight::json($stmt->fetchAll());
});

// RUTA 3: Consultar una simulación específica con sus mediciones y decisiones
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

    $stmtDec = $pdo->prepare("SELECT * FROM decisiones WHERE simulacion_id = ? ORDER BY tick_dia ASC");
    $stmtDec->execute([$id]);
    $sim['decisiones'] = $stmtDec->fetchAll();

    Flight::json($sim);
});

// RUTA 4: Guardar una nueva simulación con sus mediciones por tick y decisiones
Flight::route('POST /simulaciones', function() {
    $pdo = Database::getConnection();
    $body = json_decode(Flight::request()->getBody(), true);

    if (!$body || empty($body['nombre']) || empty($body['especie_id'])) {
        Flight::json(['error' => 'Datos incompletos para guardar la simulación'], 400);
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            INSERT INTO simulaciones 
            (nombre, especie_id, modelo_matematico, tasa_r, capacidad_k, luz, agua, temperatura, nutrientes, co2,
             biomasa_final, altura_final, estres_promedio, icr_promedio, dias_simulados, dias_estimados_cosecha, es_escenario_ab, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            htmlspecialchars(strip_tags($body['nombre'])),
            (int)$body['especie_id'],
            $body['modelo_matematico'] ?? 'logistico',
            (float)$body['tasa_r'],
            (float)$body['capacidad_k'],
            (float)$body['luz'],
            (float)$body['agua'],
            (float)$body['temperatura'],
            (float)$body['nutrientes'],
            (float)$body['co2'],
            (float)$body['biomasa_final'],
            (float)$body['altura_final'],
            (float)$body['estres_promedio'],
            (float)($body['icr_promedio'] ?? 0.04),
            (int)$body['dias_simulados'],
            (int)$body['dias_estimados_cosecha'],
            !empty($body['es_escenario_ab']) ? 1 : 0,
            htmlspecialchars(strip_tags($body['notas'] ?? ''))
        ]);

        $simId = $pdo->lastInsertId();

        // Insertar mediciones cada N ticks
        if (!empty($body['mediciones']) && is_array($body['mediciones'])) {
            $stmtMed = $pdo->prepare("
                INSERT INTO mediciones (simulacion_id, tick_dia, altura, biomasa, num_hojas, num_ramas, icr, estres_hidrico, estres_termico, estres_global)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    (float)$m['estres_global']
                ]);
            }
        }

        // Insertar decisiones emitidas por el motor
        if (!empty($body['decisiones']) && is_array($body['decisiones'])) {
            $stmtDec = $pdo->prepare("
                INSERT INTO decisiones (simulacion_id, tick_dia, tipo_alerta, indicador_valor, umbral, recomendacion)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            foreach ($body['decisiones'] as $d) {
                $stmtDec->execute([
                    $simId,
                    (int)$d['tick_dia'],
                    htmlspecialchars(strip_tags($d['tipo_alerta'])),
                    (float)$d['indicador_valor'],
                    (float)$d['umbral'],
                    htmlspecialchars(strip_tags($d['recomendacion']))
                ]);
            }
        }

        $pdo->commit();
        Flight::json(['mensaje' => 'Simulación guardada exitosamente en MySQL', 'id' => $simId], 201);
    } catch (Exception $e) {
        $pdo->rollBack();
        Flight::json(['error' => 'Error al guardar en base de datos', 'detalle' => $e->getMessage()], 500);
    }
});

// RUTA 5: Generar Reportes Analíticos (Top 5 Biomasa, Especie más eficiente, Tiempo promedio a madurez)
Flight::route('GET /reportes', function() {
    $pdo = Database::getConnection();

    // Top 5 simulaciones por biomasa
    $top5 = $pdo->query("
        SELECT s.id, s.nombre, s.modelo_matematico, s.biomasa_final, s.altura_final, s.estres_promedio, s.dias_simulados, e.nombre_comun
        FROM simulaciones s
        INNER JOIN especies e ON s.especie_id = e.id
        ORDER BY s.biomasa_final DESC
        LIMIT 5
    ")->fetchAll();

    // Especie con mayor eficiencia (relación biomasa promedio / días simulados)
    $eficiencia = $pdo->query("
        SELECT e.nombre_comun, e.nombre_cientifico,
               COUNT(s.id) AS total_corridas,
               ROUND(AVG(s.biomasa_final), 2) AS biomasa_promedio,
               ROUND(AVG(s.biomasa_final / NULLIF(s.dias_simulados, 0)), 2) AS eficiencia_diaria,
               ROUND(AVG(s.dias_estimados_cosecha), 1) AS tiempo_promedio_madurez
        FROM especies e
        INNER JOIN simulaciones s ON s.especie_id = e.id
        GROUP BY e.id
        ORDER BY eficiencia_diaria DESC
    ")->fetchAll();

    // Resumen global
    $resumen = $pdo->query("
        SELECT COUNT(*) AS total_simulaciones,
               ROUND(AVG(dias_estimados_cosecha), 1) AS promedio_madurez_global,
               ROUND(MAX(biomasa_final), 2) AS record_biomasa
        FROM simulaciones
    ")->fetch();

    Flight::json([
        'top5_biomasa' => $top5,
        'eficiencia_especies' => $eficiencia,
        'resumen_global' => $resumen
    ]);
});

Flight::start();