USE practica05_bioinformatica;

INSERT INTO especies (id, nombre_cientifico, nombre_comun, tasa_r_base, capacidad_k_base, altura_max_m, luz_optima, agua_optima, temp_optima, nutrientes_optimos, co2_optimo, dias_madurez, color_hex, descripcion) VALUES
(1, 'Agave tequilana Weber', 'Agave Azul (Tequilero)', 0.140, 4500.00, 3.80, 85.0, 45.0, 26.0, 75.0, 420.0, 100, '#5a7d71', 'Variedad oficial para producción de tequila en Los Altos de Jalisco. Alta acumulación de inulina en la piña.'),
(2, 'Agave angustifolia Haw', 'Agave Espadín (Mezcalero)', 0.165, 5200.00, 4.20, 80.0, 40.0, 28.0, 70.0, 415.0, 95, '#4e8c6f', 'Especie rústica de rápido crecimiento y alta resistencia al déficit hídrico moderado.'),
(3, 'Agave salmiana Otto', 'Maguey Pulquero / Manso', 0.120, 6800.00, 4.80, 75.0, 55.0, 22.0, 85.0, 430.0, 120, '#3b6e52', 'Agave de gran porte y biomasa foliar masiva, adaptado a climas templados y suelos profundos.'),
(4, 'Agave cupreata Trel', 'Agave Papalote', 0.110, 3800.00, 3.10, 78.0, 50.0, 25.0, 80.0, 420.0, 110, '#6e8c5a', 'Especie silvestre de pencas anchas con alta sensibilidad al estrés térmico extremo.'),
(5, 'Arabidopsis thaliana', 'Arabidopsis (Modelo Genético)', 0.250, 850.00, 1.20, 70.0, 65.0, 23.0, 80.0, 400.0, 45, '#7a9c59', 'Organismo modelo en bioinformática vegetal de ciclo corto para validación de curvas logísticas.');

INSERT INTO simulaciones (id, nombre, especie_id, modelo_matematico, tasa_r, capacidad_k, luz, agua, temperatura, nutrientes, co2, biomasa_final, altura_final, estres_promedio, icr_promedio, dias_simulados, dias_estimados_cosecha, es_escenario_ab, notas) VALUES
(1, 'Cultivo Óptimo Altos de Jalisco', 1, 'logistico', 0.145, 4500.00, 85.0, 46.0, 26.0, 78.0, 420.0, 4412.50, 3.72, 4.20, 0.0480, 100, 98, 0, 'Condiciones ideales de radiación y humedad controlada.'),
(2, 'Ensayo Estrés Hídrico Severo', 1, 'gompertz', 0.110, 4500.00, 92.0, 18.0, 33.0, 60.0, 410.0, 2680.30, 2.25, 42.80, 0.0290, 100, 145, 0, 'Simulación de sequía prolongada; se observa inhibición del quiote.'),
(3, 'Rendimiento Intensivo Espadín', 2, 'logistico', 0.170, 5200.00, 82.0, 42.0, 27.5, 75.0, 425.0, 5095.80, 4.10, 5.10, 0.0540, 95, 92, 1, 'Comparativa A/B ganadora con biofertilización NPK.'),
(4, 'Biomasa Máxima Maguey Pulquero', 3, 'gompertz', 0.125, 6800.00, 75.0, 54.0, 22.5, 85.0, 435.0, 6540.00, 4.65, 3.80, 0.0410, 120, 118, 0, 'Mayor captura de carbono e incremento de masa en pencas.'),
(5, 'Control Rápido Arabidopsis', 5, 'exponencial', 0.240, 850.00, 70.0, 65.0, 23.0, 80.0, 405.0, 842.10, 1.18, 2.10, 0.0820, 45, 44, 0, 'Curva de calibración bioinformática.');

INSERT INTO mediciones (simulacion_id, tick_dia, altura, biomasa, num_hojas, num_ramas, icr, estres_hidrico, estres_termico, estres_global) VALUES
(1, 20, 0.85, 620.00, 15, 1, 0.0720, 3.0, 2.0, 3.5),
(1, 40, 1.90, 1850.00, 32, 1, 0.0610, 4.0, 3.0, 4.0),
(1, 60, 2.95, 3280.00, 48, 1, 0.0450, 4.5, 3.5, 4.2),
(1, 80, 3.50, 4120.00, 58, 2, 0.0280, 5.0, 4.0, 4.5),
(1, 100, 3.72, 4412.50, 60, 2, 0.0120, 4.0, 3.5, 4.2),
(2, 20, 0.50, 380.00, 10, 1, 0.0450, 55.0, 35.0, 41.0),
(2, 50, 1.35, 1420.00, 26, 1, 0.0310, 58.0, 38.0, 43.5),
(2, 100, 2.25, 2680.30, 40, 1, 0.0110, 60.0, 36.0, 42.8),
(3, 50, 2.60, 2950.00, 38, 1, 0.0580, 5.0, 4.0, 5.1),
(3, 95, 4.10, 5095.80, 60, 2, 0.0190, 5.2, 4.5, 5.1);

INSERT INTO decisiones (simulacion_id, tick_dia, tipo_alerta, indicador_valor, umbral, recomendacion) VALUES
(1, 50, 'Óptimo Fisiológico', 4.20, 25.00, 'Mantener régimen actual. Tasa de asimilación neta en rango ideal.'),
(2, 25, 'Estrés Hídrico Crítico', 55.00, 35.00, 'Aumentar riego inmediatamente (+25% humedad) para evitar cierre estomático y coloración rojiza.'),
(2, 60, 'Estrés Térmico', 38.00, 30.00, 'Reducir temperatura o aplicar malla sombra; riesgo de fotoinhibición foliar.'),
(3, 80, 'Madurez Próxima', 92.00, 90.00, 'Programar desquiote y cosecha en 12 días para maximizar azúcares reductores en la piña.');