CREATE DATABASE IF NOT EXISTS practica05_bioinformatica
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE practica05_bioinformatica;

-- 1. Tabla de Especies (Catálogo biológico)
CREATE TABLE IF NOT EXISTS especies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_cientifico VARCHAR(100) NOT NULL,
    nombre_comun VARCHAR(100) NOT NULL,
    tasa_r_base DECIMAL(5,3) NOT NULL COMMENT 'Tasa intrínseca de crecimiento r',
    capacidad_k_base DECIMAL(8,2) NOT NULL COMMENT 'Capacidad máxima de biomasa K (g)',
    altura_max_m DECIMAL(5,2) NOT NULL DEFAULT 3.50,
    luz_optima DECIMAL(5,2) NOT NULL COMMENT 'Horas luz o índice solar (0-100)',
    agua_optima DECIMAL(5,2) NOT NULL COMMENT 'Humedad óptima del suelo (%)',
    temp_optima DECIMAL(5,2) NOT NULL COMMENT 'Temperatura óptima (°C)',
    nutrientes_optimos DECIMAL(5,2) NOT NULL COMMENT 'Nivel NPK óptimo (0-100)',
    co2_optimo DECIMAL(6,2) NOT NULL COMMENT 'Concentración CO2 óptima (ppm)',
    dias_madurez INT NOT NULL DEFAULT 120,
    color_hex VARCHAR(10) NOT NULL DEFAULT '#5a7d71',
    descripcion TEXT
) ENGINE=InnoDB;

-- 2. Tabla de Simulaciones (Cabecera de cada corrida experimental)
CREATE TABLE IF NOT EXISTS simulaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    especie_id INT NOT NULL,
    modelo_matematico ENUM('logistico', 'gompertz', 'exponencial', 'lineal') NOT NULL DEFAULT 'logistico',
    tasa_r DECIMAL(5,3) NOT NULL,
    capacidad_k DECIMAL(8,2) NOT NULL,
    luz DECIMAL(5,2) NOT NULL,
    agua DECIMAL(5,2) NOT NULL,
    temperatura DECIMAL(5,2) NOT NULL,
    nutrientes DECIMAL(5,2) NOT NULL,
    co2 DECIMAL(6,2) NOT NULL,
    biomasa_final DECIMAL(8,2) NOT NULL DEFAULT 0,
    altura_final DECIMAL(5,2) NOT NULL DEFAULT 0,
    estres_promedio DECIMAL(5,2) NOT NULL DEFAULT 0,
    icr_promedio DECIMAL(6,4) NOT NULL DEFAULT 0,
    dias_simulados INT NOT NULL DEFAULT 0,
    dias_estimados_cosecha INT NOT NULL DEFAULT 120,
    es_escenario_ab TINYINT(1) NOT NULL DEFAULT 0,
    notas TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (especie_id) REFERENCES especies(id) ON DELETE CASCADE,
    INDEX idx_biomasa (biomasa_final DESC),
    INDEX idx_especie (especie_id)
) ENGINE=InnoDB;

-- 3. Tabla de Mediciones (Serie temporal por tick)
CREATE TABLE IF NOT EXISTS mediciones (
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
    FOREIGN KEY (simulacion_id) REFERENCES simulaciones(id) ON DELETE CASCADE,
    INDEX idx_sim_tick (simulacion_id, tick_dia)
) ENGINE=InnoDB;

-- 4. Tabla de Decisiones (Bitácora del motor agronómico)
CREATE TABLE IF NOT EXISTS decisiones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    simulacion_id INT NOT NULL,
    tick_dia INT NOT NULL,
    tipo_alerta VARCHAR(50) NOT NULL,
    indicador_valor DECIMAL(6,2) NOT NULL,
    umbral DECIMAL(6,2) NOT NULL,
    recomendacion VARCHAR(255) NOT NULL,
    FOREIGN KEY (simulacion_id) REFERENCES simulaciones(id) ON DELETE CASCADE
) ENGINE=InnoDB;