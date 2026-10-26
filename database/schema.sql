-- =====================================================================
--  Práctica 06 - Observatorio Global de Cultivos (Geovisualización)
--  Esquema MySQL / MariaDB
-- =====================================================================
CREATE DATABASE IF NOT EXISTS practica06_geovisualizacion
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE practica06_geovisualizacion;
SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS decisiones, mediciones, analisis_geo, simulaciones, ubicaciones, umbrales_ambientales, especies, api_cache;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Especies (catálogo biológico)
CREATE TABLE especies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_cientifico VARCHAR(100) NOT NULL,
    nombre_comun VARCHAR(100) NOT NULL,
    nombre_gbif VARCHAR(100) NULL COMMENT 'Nombre canónico usado en species/match de GBIF',
    gbif_taxon_key INT NULL COMMENT 'Se resuelve y persiste automáticamente al consultar GBIF',
    tipo_fotosintesis ENUM('CAM', 'C3', 'C4') NOT NULL DEFAULT 'CAM',
    tasa_r_base DECIMAL(5,3) NOT NULL COMMENT 'Tasa intrínseca de crecimiento r',
    capacidad_k_base DECIMAL(8,2) NOT NULL COMMENT 'Capacidad máxima de biomasa K (g)',
    altura_max_m DECIMAL(5,2) NOT NULL DEFAULT 3.50,
    luz_optima DECIMAL(5,2) NOT NULL COMMENT '% de radiación respecto a pleno sol (valor central del óptimo)',
    agua_optima DECIMAL(5,2) NOT NULL COMMENT '% de agua aprovechable del suelo (valor central del óptimo)',
    temp_optima DECIMAL(5,2) NOT NULL COMMENT 'Temperatura media óptima (°C)',
    nutrientes_optimos DECIMAL(5,2) NOT NULL COMMENT 'Índice de fertilidad 0-100',
    ph_optimo DECIMAL(3,1) NOT NULL DEFAULT 6.8,
    co2_optimo DECIMAL(6,2) NOT NULL COMMENT 'Concentración CO2 de referencia (ppm)',
    dias_madurez INT NOT NULL DEFAULT 120,
    color_hex VARCHAR(10) NOT NULL DEFAULT '#5a7d71',
    descripcion TEXT
) ENGINE=InnoDB;

-- 2. Umbrales ambientales por especie y variable (modelo de zonas cardinales)
--    letal_min < critico_min < optimo_min <= optimo_max < critico_max < letal_max
--    Ver docs/investigacion_metricas_agave.md
CREATE TABLE umbrales_ambientales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    especie_id INT NOT NULL,
    variable ENUM('temperatura', 'tmin', 'agua', 'luz', 'nutrientes', 'ph', 'co2') NOT NULL,
    unidad VARCHAR(12) NOT NULL,
    letal_min DECIMAL(7,2) NOT NULL,
    critico_min DECIMAL(7,2) NOT NULL,
    optimo_min DECIMAL(7,2) NOT NULL,
    optimo_max DECIMAL(7,2) NOT NULL,
    critico_max DECIMAL(7,2) NOT NULL,
    letal_max DECIMAL(7,2) NOT NULL,
    tol_bajo_dias INT NOT NULL COMMENT 'Días en zona letal inferior hasta la muerte',
    tol_alto_dias INT NOT NULL COMMENT 'Días en zona letal superior hasta la muerte',
    fuente VARCHAR(255) NULL,
    UNIQUE KEY uq_especie_variable (especie_id, variable),
    FOREIGN KEY (especie_id) REFERENCES especies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. Ubicaciones georreferenciadas (referencia, elegidas por el usuario, estaciones)
CREATE TABLE ubicaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    region VARCHAR(120) NULL,
    pais VARCHAR(80) NULL,
    codigo_pais CHAR(2) NULL,
    latitud DECIMAL(8,5) NOT NULL,
    longitud DECIMAL(8,5) NOT NULL,
    elevacion_m DECIMAL(7,1) NULL,
    tipo ENUM('referencia', 'usuario', 'estacion') NOT NULL DEFAULT 'usuario',
    descripcion VARCHAR(255) NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_coordenadas (latitud, longitud)
) ENGINE=InnoDB;

-- 4. Simulaciones (cabecera de cada corrida experimental)
CREATE TABLE simulaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    especie_id INT NOT NULL,
    ubicacion_id INT NULL COMMENT 'Ubicación real cuyos datos alimentaron la simulación',
    origen ENUM('manual', 'geo') NOT NULL DEFAULT 'manual',
    modelo_matematico ENUM('logistico', 'gompertz', 'exponencial', 'lineal') NOT NULL DEFAULT 'logistico',
    tasa_r DECIMAL(5,3) NOT NULL,
    capacidad_k DECIMAL(8,2) NOT NULL,
    luz DECIMAL(5,2) NOT NULL,
    agua DECIMAL(5,2) NOT NULL,
    temperatura DECIMAL(5,2) NOT NULL,
    temp_minima DECIMAL(5,2) NULL,
    nutrientes DECIMAL(5,2) NOT NULL,
    ph DECIMAL(3,1) NULL,
    co2 DECIMAL(6,2) NOT NULL,
    biomasa_final DECIMAL(8,2) NOT NULL DEFAULT 0,
    altura_final DECIMAL(5,2) NOT NULL DEFAULT 0,
    estres_promedio DECIMAL(5,2) NOT NULL DEFAULT 0,
    icr_promedio DECIMAL(6,4) NOT NULL DEFAULT 0,
    danio_final DECIMAL(5,2) NOT NULL DEFAULT 0,
    danio_permanente DECIMAL(5,2) NOT NULL DEFAULT 0,
    estado_final ENUM('saludable', 'estres_reversible', 'danio_parcial', 'danio_severo', 'muerta') NOT NULL DEFAULT 'saludable',
    dias_simulados INT NOT NULL DEFAULT 0,
    dias_estimados_cosecha INT NOT NULL DEFAULT 120,
    es_escenario_ab TINYINT(1) NOT NULL DEFAULT 0,
    notas TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (especie_id) REFERENCES especies(id) ON DELETE CASCADE,
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id) ON DELETE SET NULL,
    INDEX idx_biomasa (biomasa_final DESC),
    INDEX idx_especie (especie_id)
) ENGINE=InnoDB;

-- 5. Análisis geoespacial: datos reales de un punto + idoneidad para una especie
CREATE TABLE analisis_geo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ubicacion_id INT NOT NULL,
    especie_id INT NOT NULL,
    simulacion_id INT NULL,
    periodo_clima VARCHAR(20) NULL,
    temp_media DECIMAL(5,2) NULL,
    temp_max_abs DECIMAL(5,2) NULL,
    temp_min_abs DECIMAL(5,2) NULL,
    precipitacion_anual DECIMAL(7,1) NULL COMMENT 'mm/año (NASA POWER)',
    radiacion_solar DECIMAL(5,2) NULL COMMENT 'MJ/m²/día (NASA POWER)',
    humedad_relativa DECIMAL(5,1) NULL,
    evapotranspiracion DECIMAL(7,1) NULL COMMENT 'ET0 mm/año (Hargreaves-Samani)',
    humedad_suelo_actual DECIMAL(5,3) NULL COMMENT 'm³/m³ (Open-Meteo)',
    ph_suelo DECIMAL(3,1) NULL,
    arcilla_pct DECIMAL(5,1) NULL,
    arena_pct DECIMAL(5,1) NULL,
    carbono_organico DECIMAL(6,1) NULL COMMENT 'g/kg',
    nitrogeno DECIMAL(6,2) NULL COMMENT 'g/kg',
    ocurrencias_gbif INT NULL,
    radio_gbif_km INT NOT NULL DEFAULT 100,
    idoneidad DECIMAL(5,1) NOT NULL,
    clase_idoneidad ENUM('alta', 'media', 'baja', 'no_apta') NOT NULL,
    detalle_idoneidad TEXT NULL COMMENT 'JSON con componentes y zonas',
    params_simulacion TEXT NULL COMMENT 'JSON con la línea del tiempo de 7 años derivada',
    notas VARCHAR(255) NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (especie_id) REFERENCES especies(id) ON DELETE CASCADE,
    FOREIGN KEY (simulacion_id) REFERENCES simulaciones(id) ON DELETE SET NULL,
    INDEX idx_idoneidad (especie_id, idoneidad DESC)
) ENGINE=InnoDB;

-- 6. Mediciones (serie temporal por tick)
CREATE TABLE mediciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    simulacion_id INT NOT NULL,
    tick_dia INT NOT NULL,
    altura DECIMAL(5,2) NOT NULL,
    biomasa DECIMAL(8,2) NOT NULL,
    num_hojas INT NOT NULL,
    num_ramas INT NOT NULL,
    icr DECIMAL(6,4) NOT NULL,
    estres_hidrico DECIMAL(5,2) NOT NULL,
    estres_termico DECIMAL(5,2) NOT NULL,
    estres_global DECIMAL(5,2) NOT NULL,
    danio_acumulado DECIMAL(5,2) NOT NULL DEFAULT 0,
    FOREIGN KEY (simulacion_id) REFERENCES simulaciones(id) ON DELETE CASCADE,
    INDEX idx_sim_tick (simulacion_id, tick_dia)
) ENGINE=InnoDB;

-- 7. Decisiones (bitácora del motor fisiológico y de las reglas geo-agronómicas)
CREATE TABLE decisiones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    simulacion_id INT NULL,
    analisis_id INT NULL,
    categoria ENUM('fisiologica', 'geo') NOT NULL DEFAULT 'fisiologica',
    severidad ENUM('info', 'advertencia', 'critica') NOT NULL DEFAULT 'info',
    tick_dia INT NOT NULL DEFAULT 0,
    tipo_alerta VARCHAR(60) NOT NULL,
    indicador_valor DECIMAL(8,2) NOT NULL,
    umbral DECIMAL(8,2) NOT NULL,
    recomendacion VARCHAR(255) NOT NULL,
    FOREIGN KEY (simulacion_id) REFERENCES simulaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (analisis_id) REFERENCES analisis_geo(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8. Caché de respuestas de APIs externas (respeta límites de uso)
CREATE TABLE api_cache (
    cache_key CHAR(40) PRIMARY KEY COMMENT 'sha1(fuente|url)',
    fuente VARCHAR(30) NOT NULL,
    url VARCHAR(1000) NOT NULL,
    respuesta LONGTEXT NOT NULL COMMENT 'JSON crudo o PNG en base64',
    http_code SMALLINT NOT NULL DEFAULT 200,
    bytes INT NOT NULL DEFAULT 0,
    hits INT NOT NULL DEFAULT 0,
    creado_en DATETIME NOT NULL,
    expira_en DATETIME NOT NULL,
    ultimo_acceso DATETIME NOT NULL,
    INDEX idx_fuente (fuente),
    INDEX idx_expira (expira_en)
) ENGINE=InnoDB;
