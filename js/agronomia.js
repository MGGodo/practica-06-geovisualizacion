/**
 * Motor agronómico compartido (Práctica 06).
 *
 * Implementa el modelo definido en docs/investigacion_metricas_agave.md:
 *  - Zonas cardinales por variable (letal / crítica / subóptima / óptima).
 *  - Factor de crecimiento por ley del mínimo de Liebig + multiplicador de CO₂.
 *  - Daño fisiológico acumulado con recuperación total, parcial o nula (muerte).
 *  - Conversión de datos reales (NASA POWER, SoilGrids, GBIF) a parámetros de simulación.
 *  - Índice de idoneidad y reglas de decisión geo-agronómicas.
 *
 * Es un módulo puro (sin DOM ni Three.js) para poder usarlo en la parcela 3D,
 * en el globo, en el comparador A/B y en el ranking.
 */

export const TOTAL_ANIOS = 7;
export const TICKS_POR_ANIO = 20;
export const TOTAL_TICKS = TOTAL_ANIOS * TICKS_POR_ANIO;          // 140
export const DIAS_POR_TICK = (TOTAL_ANIOS * 365) / TOTAL_TICKS;    // 18.25 días reales por tick
export const CO2_REFERENCIA = 400;                                 // ppm de referencia de los estudios de CO₂ elevado

// Umbrales de estado del daño acumulado (D, 0-100)
export const ESTADOS_DANIO = [
    { id: 'saludable',         min: 0,   max: 10,  etiqueta: 'Saludable',                     recuperacion: 'No requiere' },
    { id: 'estres_reversible', min: 10,  max: 30,  etiqueta: 'Estrés reversible',             recuperacion: 'Total' },
    { id: 'danio_parcial',     min: 30,  max: 70,  etiqueta: 'Daño parcial',                  recuperacion: 'Parcial (queda daño permanente)' },
    { id: 'danio_severo',      min: 70,  max: 100, etiqueta: 'Daño severo (sin crecimiento)', recuperacion: 'Mínima, solo si el estrés cesa de inmediato' },
    { id: 'muerta',            min: 100, max: 1e9, etiqueta: 'Muerte (irreversible)',          recuperacion: 'Ninguna' }
];

// Parámetros del modelo de daño (ver sección 6 del documento de investigación)
export const PARAMS_DANIO = {
    fraccionCritica: 0.35,     // en zona crítica el daño avanza al 35% de la velocidad letal (escalado por la profundidad)
    umbralPermanente: 30,      // por encima de D=30 una parte del daño se vuelve irreversible
    fraccionPermanente: 0.7,   // Dperm = 0.7·(Dmax − 30)
    reparacionDiaria: 0.6,     // % de daño reparado por día en condiciones favorables (× factor de crecimiento)
    necrosisPorDanio: 0.6,     // fracción de biomasa perdida por cada punto de daño nuevo (0.6% por punto)
    sinCrecimientoDesde: 70    // D ≥ 70 detiene el crecimiento
};

/**
 * Umbrales por especie y variable. Deben coincidir con database/seed.sql (tabla umbrales_ambientales).
 * Formato: [letal_min, critico_min, optimo_min, optimo_max, critico_max, letal_max, tol_bajo_dias, tol_alto_dias]
 * Para 'tmin' (temperatura mínima extrema / heladas) solo se usan letal_min y critico_min.
 */
const U = (a) => ({
    letal_min: a[0], critico_min: a[1], optimo_min: a[2], optimo_max: a[3],
    critico_max: a[4], letal_max: a[5], tol_bajo_dias: a[6], tol_alto_dias: a[7]
});

export const UMBRALES_DEFECTO = {
    // Agave tequilana Weber var. azul
    1: {
        temperatura: U([6, 12, 18, 26, 32, 38, 60, 45]),
        tmin:        U([-6, 0, 5, 30, 40, 50, 1, 1]),
        agua:        U([5, 15, 35, 60, 78, 92, 150, 30]),
        luz:         U([5, 15, 45, 85, 180, 250, 120, 999]),
        nutrientes:  U([3, 15, 45, 80, 92, 98, 240, 60]),
        ph:          U([3.8, 4.5, 6.0, 7.6, 8.6, 9.5, 180, 180]),
        co2:         U([100, 180, 400, 1000, 2000, 5000, 120, 120])
    },
    // Agave angustifolia Haw (espadín)
    2: {
        temperatura: U([5, 11, 20, 30, 35, 41, 60, 50]),
        tmin:        U([-7, -1, 5, 30, 40, 50, 1, 1]),
        agua:        U([4, 10, 28, 55, 74, 90, 200, 30]),
        luz:         U([5, 15, 45, 90, 190, 250, 120, 999]),
        nutrientes:  U([3, 10, 35, 75, 92, 98, 240, 60]),
        ph:          U([3.8, 4.5, 6.0, 8.0, 8.8, 9.6, 180, 180]),
        co2:         U([100, 180, 400, 1000, 2000, 5000, 120, 120])
    },
    // Agave salmiana Otto (maguey pulquero)
    3: {
        temperatura: U([0, 6, 14, 22, 30, 35, 90, 40]),
        tmin:        U([-12, -4, 2, 30, 40, 50, 1, 1]),
        agua:        U([6, 15, 35, 65, 80, 92, 150, 35]),
        luz:         U([5, 15, 40, 85, 180, 250, 120, 999]),
        nutrientes:  U([3, 15, 50, 85, 93, 98, 240, 60]),
        ph:          U([4.0, 4.8, 6.0, 8.2, 8.9, 9.6, 180, 180]),
        co2:         U([100, 180, 400, 1000, 2000, 5000, 120, 120])
    },
    // Agave cupreata Trel. & A. Berger (papalote)
    4: {
        temperatura: U([4, 10, 16, 24, 29, 34, 60, 35]),
        tmin:        U([-5, 0, 5, 30, 40, 50, 1, 1]),
        agua:        U([7, 18, 40, 65, 78, 90, 120, 30]),
        luz:         U([5, 12, 40, 80, 170, 250, 120, 999]),
        nutrientes:  U([3, 15, 45, 80, 92, 98, 240, 60]),
        ph:          U([3.7, 4.3, 5.5, 7.2, 8.2, 9.2, 180, 180]),
        co2:         U([100, 180, 400, 1000, 2000, 5000, 120, 120])
    },
    // Arabidopsis thaliana (control C3, no agave)
    5: {
        temperatura: U([2, 6, 18, 24, 29, 33, 20, 10]),
        tmin:        U([-10, -3, 4, 30, 40, 50, 1, 1]),
        agua:        U([12, 28, 50, 75, 88, 96, 15, 10]),
        luz:         U([3, 8, 30, 70, 130, 200, 30, 999]),
        nutrientes:  U([4, 15, 50, 85, 95, 99, 30, 20]),
        ph:          U([4.0, 4.8, 5.8, 7.2, 8.0, 9.0, 30, 30]),
        co2:         U([100, 180, 400, 1000, 2000, 5000, 30, 30])
    }
};

// Respuesta al CO₂ (aumento relativo de biomasa por duplicación de CO₂)
export const BETA_CO2 = { CAM: 0.35, C3: 0.33, C4: 0.10 };

export const VARIABLES_LIEBIG = ['temperatura', 'agua', 'luz', 'nutrientes', 'ph'];

export const NOMBRES_VARIABLE = {
    temperatura: '🌡️ Temperatura media',
    tmin: '❄️ Mínima extrema',
    agua: '💧 Agua del suelo',
    luz: '☀️ Radiación',
    nutrientes: '🧪 Nutrientes',
    ph: '🪨 pH del suelo',
    co2: '🫧 CO₂'
};

export const UNIDADES = { temperatura: '°C', tmin: '°C', agua: '%', luz: '%', nutrientes: '%', ph: '', co2: 'ppm' };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function obtenerUmbrales(especie) {
    if (especie && especie.umbrales && especie.umbrales.temperatura) return especie.umbrales;
    return UMBRALES_DEFECTO[especie?.id] || UMBRALES_DEFECTO[1];
}

/**
 * Clasifica un valor dentro de las zonas cardinales y devuelve el factor de crecimiento.
 *  zona: optimo | suboptimo_bajo | suboptimo_alto | critico_bajo | critico_alto | letal_bajo | letal_alto
 *  f: factor de crecimiento 0..1
 *  profundidad: 0..1 dentro de la zona crítica (0 = recién entrando, 1 = en el borde letal)
 *  danioDiario: % de daño por día que produce estar en esa zona
 */
export function evaluarVariable(valor, u) {
    const r = { valor, f: 1, zona: 'optimo', profundidad: 0, danioDiario: 0 };
    if (valor === null || valor === undefined || Number.isNaN(valor)) return r;

    if (valor <= u.letal_min) {
        Object.assign(r, { f: 0, zona: 'letal_bajo', profundidad: 1, danioDiario: 100 / u.tol_bajo_dias });
    } else if (valor >= u.letal_max) {
        Object.assign(r, { f: 0, zona: 'letal_alto', profundidad: 1, danioDiario: 100 / u.tol_alto_dias });
    } else if (valor < u.critico_min) {
        const p = (u.critico_min - valor) / (u.critico_min - u.letal_min);
        Object.assign(r, { f: 0, zona: 'critico_bajo', profundidad: p, danioDiario: p * PARAMS_DANIO.fraccionCritica * 100 / u.tol_bajo_dias });
    } else if (valor > u.critico_max) {
        const p = (valor - u.critico_max) / (u.letal_max - u.critico_max);
        Object.assign(r, { f: 0, zona: 'critico_alto', profundidad: p, danioDiario: p * PARAMS_DANIO.fraccionCritica * 100 / u.tol_alto_dias });
    } else if (valor < u.optimo_min) {
        Object.assign(r, { f: (valor - u.critico_min) / (u.optimo_min - u.critico_min), zona: 'suboptimo_bajo' });
    } else if (valor > u.optimo_max) {
        Object.assign(r, { f: (u.critico_max - valor) / (u.critico_max - u.optimo_max), zona: 'suboptimo_alto' });
    }
    return r;
}

/** Multiplicador de CO₂: 1 + β·log2(CO₂/400), saturado en 1000 ppm. Bajo el punto crítico no hay ganancia neta. */
export function evaluarCO2(co2, u, tipo = 'CAM') {
    const beta = BETA_CO2[tipo] ?? BETA_CO2.CAM;
    const base = evaluarVariable(co2, u);
    if (base.zona.startsWith('critico') || base.zona.startsWith('letal')) {
        return { ...base, multiplicador: 0 };
    }
    const efectivo = clamp(co2, u.critico_min, u.optimo_max);
    const multiplicador = Math.max(0, 1 + beta * Math.log2(efectivo / CO2_REFERENCIA));
    return { ...base, zona: co2 < u.optimo_min ? 'suboptimo_bajo' : 'optimo', f: Math.min(1, multiplicador), multiplicador };
}

/**
 * Daño instantáneo por helada según la temperatura mínima extrema del año.
 *  tmin ≥ critico_min → 0 ; entre critico_min y letal_min → 10..100 (lineal) ; ≤ letal_min → 100 (muerte)
 */
export function danioHelada(tmin, u) {
    if (tmin === null || tmin === undefined || Number.isNaN(tmin)) return 0;
    if (tmin >= u.critico_min) return 0;
    if (tmin <= u.letal_min) return 100;
    const p = (u.critico_min - tmin) / (u.critico_min - u.letal_min);
    return 10 + p * 90;
}

/** Evalúa todas las variables de un clima {temp, agua, luz, nut, ph, co2, tmin}. */
export function evaluarClima(clima, umbrales, tipoFoto = 'CAM') {
    const ev = {
        temperatura: evaluarVariable(clima.temp, umbrales.temperatura),
        agua: evaluarVariable(clima.agua, umbrales.agua),
        luz: evaluarVariable(clima.luz, umbrales.luz),
        nutrientes: evaluarVariable(clima.nut, umbrales.nutrientes),
        ph: evaluarVariable(clima.ph ?? ((umbrales.ph.optimo_min + umbrales.ph.optimo_max) / 2), umbrales.ph),
        co2: evaluarCO2(clima.co2 ?? 420, umbrales.co2, tipoFoto)
    };

    // Ley del mínimo de Liebig con una ligera co-limitación del resto de factores
    const fs = VARIABLES_LIEBIG.map(v => ev[v].f);
    const fMin = Math.min(...fs);
    const fProm = fs.reduce((a, b) => a + b, 0) / fs.length;
    const fLiebig = fMin * (0.85 + 0.15 * fProm);
    const limitante = VARIABLES_LIEBIG.reduce((a, v) => (ev[v].f < ev[a].f ? v : a), VARIABLES_LIEBIG[0]);

    const danioDiario = Object.values(ev).reduce((a, e) => a + e.danioDiario, 0);
    return { variables: ev, fLiebig, fCO2: ev.co2.multiplicador, limitante, danioDiario };
}

export function estadoDesdeDanio(D, muerta = false) {
    if (muerta || D >= 100) return ESTADOS_DANIO[4];
    return ESTADOS_DANIO.find(e => D >= e.min && D < e.max) || ESTADOS_DANIO[0];
}

/** Índices de estrés 0-100 (para KPIs y para la tabla mediciones). */
export function indicesEstres(evaluacion) {
    const s = (v) => +((1 - evaluacion.variables[v].f) * 100).toFixed(1);
    return {
        hidrico: s('agua'),
        termico: s('temperatura'),
        luminico: s('luz'),
        nutricional: s('nutrientes'),
        ph: s('ph'),
        global: +((1 - evaluacion.fLiebig) * 100).toFixed(1)
    };
}

/**
 * Simula el ciclo completo (hasta `hastaTick`) de una planta.
 * config: { especie, umbrales?, modelo, r, K, timeline: [7 × {temp, agua, luz, nut, ph, co2, tmin}] }
 * Devuelve el estado final, el resumen anual y (opcional) la serie por tick.
 */
export function simularCiclo(config, hastaTick = TOTAL_TICKS, conSerie = false) {
    const especie = config.especie;
    const u = config.umbrales || obtenerUmbrales(especie);
    const tipoFoto = especie?.tipo_fotosintesis || 'CAM';
    const K = config.K;
    const N0 = Math.max(15, K * 0.02);
    const pasos = clamp(Math.floor(hastaTick), 0, TOTAL_TICKS);

    let biomasa = N0;
    let D = 0, Dperm = 0, Dmax = 0;
    let muerta = false;
    let tickMuerte = null, causaMuerte = null, biomasaAlMorir = null;
    let ultimaEval = evaluarClima(config.timeline[0], u, tipoFoto);
    let ultimaREf = config.r;
    let sumaEstres = 0;
    const anual = [];
    const serie = [];

    for (let t = 1; t <= pasos; t++) {
        const anioIdx = Math.min(TOTAL_ANIOS - 1, Math.floor((t - 1) / TICKS_POR_ANIO));
        const clima = config.timeline[anioIdx] || config.timeline[config.timeline.length - 1];
        const ev = evaluarClima(clima, u, tipoFoto);
        ultimaEval = ev;
        const Danterior = D;

        if (!muerta) {
            // 1) Daño por exposición a zonas crítica/letal durante el tick
            let incremento = ev.danioDiario * DIAS_POR_TICK;
            let causa = incremento > 0
                ? Object.entries(ev.variables).sort((a, b) => b[1].danioDiario - a[1].danioDiario)[0][0]
                : null;

            // 2) Helada: evento puntual una vez al año (mitad del invierno simulado)
            if ((t - 1) % TICKS_POR_ANIO === Math.floor(TICKS_POR_ANIO / 2)) {
                const dh = danioHelada(clima.tmin, u.tmin);
                if (dh > 0) {
                    incremento += dh;
                    if (dh >= incremento - dh) causa = 'tmin';
                }
            }

            if (incremento > 0) {
                D = Math.min(100, D + incremento);
            } else {
                // 3) Reparación: solo si ninguna variable está en zona crítica/letal
                const reparacion = PARAMS_DANIO.reparacionDiaria * ev.fLiebig * DIAS_POR_TICK;
                D = Math.max(Dperm, D - reparacion);
            }

            Dmax = Math.max(Dmax, D);
            if (Dmax > PARAMS_DANIO.umbralPermanente) {
                Dperm = Math.max(Dperm, (Dmax - PARAMS_DANIO.umbralPermanente) * PARAMS_DANIO.fraccionPermanente);
            }

            // 4) Necrosis: el daño nuevo destruye tejido
            if (D > Danterior) {
                biomasa *= Math.max(0, 1 - (D - Danterior) * PARAMS_DANIO.necrosisPorDanio / 100);
            }

            if (D >= 100) {
                muerta = true;
                biomasaAlMorir = biomasa;
                tickMuerte = t;
                causaMuerte = causa;
            }
        }

        if (muerta) {
            biomasa = Math.max(N0 * 0.3, biomasa * 0.94);   // descomposición del tejido
            ultimaREf = 0;
        } else {
            const Kef = K * (1 - Dperm / 100);
            const rEf = D >= PARAMS_DANIO.sinCrecimientoDesde
                ? 0
                : Math.max(0, config.r * ev.fLiebig * ev.fCO2 * (1 - D / 100));

            let dN = 0;
            if (config.modelo === 'lineal') {
                dN = (Kef * rEf) / 14;
            } else if (config.modelo === 'exponencial') {
                dN = (rEf * 0.32) * biomasa;
            } else if (config.modelo === 'gompertz') {
                const ratio = Math.max(0.0001, biomasa / Kef);
                dN = (rEf * 0.48) * biomasa * Math.max(0, -Math.log(ratio));
            } else {
                dN = (rEf * 0.65) * biomasa * Math.max(0, 1 - (biomasa / Kef));
            }
            biomasa = Math.max(N0 * 0.3, Math.min(Math.max(Kef, N0 * 0.3), biomasa + dN));
            ultimaREf = rEf;
        }

        const estres = indicesEstres(ev);
        sumaEstres += muerta ? 100 : estres.global;

        if (t % TICKS_POR_ANIO === 0 || t === pasos) {
            anual[anioIdx] = {
                anio: anioIdx + 1,
                biomasa: +biomasa.toFixed(1),
                danio: +D.toFixed(1),
                danioPermanente: +Dperm.toFixed(1),
                estresGlobal: muerta ? 100 : estres.global,
                muerta,
                estado: estadoDesdeDanio(D, muerta).id
            };
        }
        if (conSerie) {
            serie.push({ tick: t, anio: anioIdx + 1, biomasa: +biomasa.toFixed(1), danio: +D.toFixed(1), estresGlobal: muerta ? 100 : estres.global });
        }
    }

    const Kef = K * (1 - Dperm / 100);
    const fraccion = clamp(biomasa / K, 0.001, 1);
    const estres = indicesEstres(ultimaEval);
    const diasReales = Math.round(pasos * DIAS_POR_TICK);
    const ritmo = Math.max(0.2, ultimaEval.fLiebig * (1 - D / 100));
    const diasCosecha = muerta ? 0 : Math.max(0, Math.round((TOTAL_ANIOS * 365) / ritmo - diasReales));

    return {
        biomasa: +biomasa.toFixed(1),
        fraccion,
        // Tamaño de los restos secos que se dibujan cuando la planta muere (la biomasa viva sí se descompone)
        fraccionVisual: muerta ? clamp(biomasaAlMorir / K, 0.001, 1) * 0.85 : fraccion,
        altura: +(fraccion * (especie?.altura_max_m || 3.5)).toFixed(2),
        hojas: Math.round(fraccion * 60),
        ramas: (!muerta && fraccion > 0.62) ? 2 : 1,
        icr: muerta ? 0 : +Math.max(0, ultimaREf * (1 - biomasa / Math.max(1, Kef))).toFixed(4),
        estresHidrico: muerta ? 100 : estres.hidrico,
        estresTermico: muerta ? 100 : estres.termico,
        estresGlobal: muerta ? 100 : estres.global,
        estresPromedio: pasos ? +(sumaEstres / pasos).toFixed(1) : 0,
        danio: +D.toFixed(1),
        danioPermanente: +Dperm.toFixed(1),
        estado: estadoDesdeDanio(D, muerta),
        muerta,
        tickMuerte,
        causaMuerte,
        diasCosecha,
        evaluacion: ultimaEval,
        anual,
        serie
    };
}

/* ======================================================================
 *  CONVERSIÓN DE DATOS REALES → PARÁMETROS DE SIMULACIÓN
 * ====================================================================== */

/** Interpolación lineal por tramos sobre una tabla [[x, y], ...]. */
function tramos(x, tabla) {
    if (x <= tabla[0][0]) return tabla[0][1];
    for (let i = 1; i < tabla.length; i++) {
        if (x <= tabla[i][0]) {
            const [x0, y0] = tabla[i - 1], [x1, y1] = tabla[i];
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
        }
    }
    return tabla[tabla.length - 1][1];
}

// Índice de aridez (P/ET0, clasificación UNEP) → % de agua aprovechable del suelo
const TABLA_ARIDEZ_AGUA = [[0, 2], [0.05, 8], [0.2, 20], [0.5, 42], [0.65, 50], [1.0, 62], [1.5, 75], [2.5, 88], [4, 95]];

export function aguaDesdePrecipitacion(precipMm, et0Mm, arcillaPct = null) {
    if (precipMm === null || precipMm === undefined) return null;
    const et0 = et0Mm && et0Mm > 0 ? et0Mm : 1500;
    let agua = tramos(precipMm / et0, TABLA_ARIDEZ_AGUA);
    if (arcillaPct !== null && arcillaPct !== undefined) {
        agua += (arcillaPct - 25) * 0.25;   // la arcilla retiene agua; la arena drena
    }
    return +clamp(agua, 0, 100).toFixed(1);
}

/** Radiación global (MJ/m²/día) → % de luz (100% ≈ 27.5 MJ ≈ 60 mol PAR/m²/día). */
export function luzDesdeRadiacion(mj) {
    if (mj === null || mj === undefined) return null;
    return +clamp(mj * 3.636, 0, 100).toFixed(1);
}

/** Fertilidad natural del suelo (SoilGrids) → índice de nutrientes 0-100 (tope 85 sin fertilización). */
export function nutrientesDesdeSuelo(suelo) {
    if (!suelo || suelo.nitrogeno_gkg === null || suelo.nitrogeno_gkg === undefined) return null;
    const rN = Math.min(2, (suelo.nitrogeno_gkg ?? 0) / 1.5);
    const rC = Math.min(2, (suelo.carbono_organico_gkg ?? 0) / 15);
    const rCec = Math.min(2, (suelo.cec_cmolkg ?? 15) / 20);
    return +clamp(25 * rN + 20 * rC + 20 * rCec, 0, 85).toFixed(1);
}

/**
 * Convierte el bloque de datos reales de un punto (respuesta de /geo/punto) en
 * parámetros de simulación promedio y en una línea del tiempo de 7 años reales.
 */
export function parametrosDesdeDatosReales(datos, especie) {
    const u = obtenerUmbrales(especie);
    const clima = datos?.clima || {};
    const suelo = datos?.suelo?.disponible ? datos.suelo : null;
    const prom = clima.promedio || {};
    const arcilla = suelo ? suelo.arcilla_pct : null;

    const defectoNut = (u.nutrientes.optimo_min + u.nutrientes.optimo_max) / 2;
    const defectoPh = +((u.ph.optimo_min + u.ph.optimo_max) / 2).toFixed(1);
    const nut = nutrientesDesdeSuelo(suelo) ?? defectoNut;
    const ph = suelo?.ph ?? defectoPh;
    const co2 = 425;   // concentración atmosférica global actual (Mauna Loa ~425 ppm)

    const desdeAnio = (a) => ({
        anioReal: a.anio,
        temp: +(a.temp_media ?? 20).toFixed(1),
        tmin: a.temp_min_abs !== undefined ? +a.temp_min_abs.toFixed(1) : null,
        agua: aguaDesdePrecipitacion(a.precipitacion_mm, a.et0_mm, arcilla) ?? 40,
        luz: luzDesdeRadiacion(a.radiacion_mj) ?? 70,
        nut, ph, co2
    });

    const anios = (clima.anios || []).slice(-TOTAL_ANIOS);
    let timeline = anios.map(desdeAnio);
    while (timeline.length && timeline.length < TOTAL_ANIOS) {
        timeline.push({ ...timeline[timeline.length - 1], anioReal: null });
    }

    const promedio = {
        temp: +(prom.temp_media ?? 20).toFixed(1),
        tmin: prom.temp_min_abs !== undefined ? +(+prom.temp_min_abs).toFixed(1) : null,
        agua: aguaDesdePrecipitacion(prom.precipitacion_mm, prom.et0_mm, arcilla) ?? 40,
        luz: luzDesdeRadiacion(prom.radiacion_mj) ?? 70,
        nut, ph, co2
    };
    if (!timeline.length) timeline = Array.from({ length: TOTAL_ANIOS }, () => ({ ...promedio, anioReal: null }));

    return { promedio, timeline, sueloEstimado: !suelo };
}

/* ======================================================================
 *  ÍNDICE DE IDONEIDAD
 * ====================================================================== */

export const PESOS_IDONEIDAD = {
    temperatura: 0.25,
    agua: 0.25,
    luz: 0.10,
    nutrientes: 0.10,
    ph: 0.10,
    gbif: 0.20
};

/** Evidencia empírica GBIF: 0 registros → 0 ; ≥ 50 registros en el radio → 1 (escala logarítmica). */
export function puntajeGbif(n) {
    if (!n || n <= 0) return 0;
    return clamp(Math.log10(1 + n) / Math.log10(51), 0, 1);
}

export function clasificarIdoneidad(indice) {
    if (indice >= 75) return { id: 'alta', etiqueta: 'Alta', color: '#2ecc71' };
    if (indice >= 50) return { id: 'media', etiqueta: 'Media', color: '#f1c40f' };
    if (indice >= 25) return { id: 'baja', etiqueta: 'Baja', color: '#e67e22' };
    return { id: 'no_apta', etiqueta: 'No apta', color: '#e74c3c' };
}

/**
 * I = 100 · Σ wᵢ·fᵢ · penalización_helada · penalización_letal
 *  - fᵢ: factor de la zona cardinal (0..1) para temperatura, agua, luz, nutrientes, pH
 *  - GBIF: puntaje logarítmico de ocurrencias en el radio
 *  - helada: × (1 − daño_helada/100)
 *  - si alguna variable cae en zona letal el índice se limita a 10; en zona crítica, a 35
 */
export function indiceIdoneidad(params, especie, ocurrenciasGbif = 0) {
    const u = obtenerUmbrales(especie);
    const ev = evaluarClima(params, u, especie?.tipo_fotosintesis || 'CAM');
    const g = puntajeGbif(ocurrenciasGbif);
    const componentes = {
        temperatura: ev.variables.temperatura.f,
        agua: ev.variables.agua.f,
        luz: ev.variables.luz.f,
        nutrientes: ev.variables.nutrientes.f,
        ph: ev.variables.ph.f,
        gbif: g
    };
    let base = Object.entries(PESOS_IDONEIDAD).reduce((a, [k, w]) => a + w * componentes[k], 0);
    const dh = danioHelada(params.tmin, u.tmin);
    base *= (1 - dh / 100);
    const hayLetal = Object.values(ev.variables).some(v => v.zona.startsWith('letal'));
    const hayCritico = Object.values(ev.variables).some(v => v.zona.startsWith('critico'));
    let indice = base * 100;
    if (hayLetal) indice = Math.min(indice, 10);
    else if (hayCritico) indice = Math.min(indice, 35);

    // Factor limitante: la variable con menor factor; la helada si su penalización pesa más; ninguno si todo es óptimo
    const fLim = ev.variables[ev.limitante].f;
    let limitante = fLim < 1 ? ev.limitante : null;
    if (dh > 0 && dh / 100 >= 1 - fLim) limitante = 'tmin';

    return {
        indice: +indice.toFixed(1),
        clase: clasificarIdoneidad(indice),
        componentes,
        zonas: Object.fromEntries(Object.entries(ev.variables).map(([k, v]) => [k, v.zona])),
        danioHelada: +dh.toFixed(1),
        limitante,
        hayLetal
    };
}

/* ======================================================================
 *  REGLAS DE DECISIÓN GEO-AGRONÓMICAS
 * ====================================================================== */

/**
 * Evalúa las reglas sobre los datos reales de un punto para una especie.
 * Devuelve [{ tipo_alerta, severidad, indicador_valor, umbral, recomendacion }]
 */
export function reglasGeoAgronomicas(datos, especie, params, ocurrencias) {
    const u = obtenerUmbrales(especie);
    const prom = datos?.clima?.promedio || {};
    const suelo = datos?.suelo?.disponible ? datos.suelo : null;
    const reglas = [];
    const add = (tipo_alerta, severidad, indicador_valor, umbral, recomendacion) =>
        reglas.push({ tipo_alerta, severidad, indicador_valor: +(+indicador_valor).toFixed(2), umbral, recomendacion });

    const precip = prom.precipitacion_mm;
    if (precip !== undefined && precip !== null) {
        if (precip < 400) add('Déficit hídrico estructural', 'critica', precip, 400, `Precipitación anual de ${Math.round(precip)} mm (< 400 mm): riego suplementario obligatorio.`);
        else if (precip < 600) add('Precipitación marginal', 'advertencia', precip, 600, `Precipitación de ${Math.round(precip)} mm: planear riego de auxilio en estiaje y acolchado.`);
        else if (precip > 1500) add('Exceso de lluvia', 'advertencia', precip, 1500, `Precipitación de ${Math.round(precip)} mm: usar camellones y drenaje para evitar pudrición (Fusarium, Erwinia).`);
    }

    const tmed = prom.temp_media;
    if (tmed !== undefined && tmed !== null) {
        if (tmed > 35) add('Estrés térmico severo', 'critica', tmed, 35, `Temperatura media de ${tmed.toFixed(1)} °C (> 35 °C): estrés térmico severo, considerar variedad resistente o descartar el sitio.`);
        else if (tmed > u.temperatura.critico_max) add('Calor sobre umbral crítico', 'critica', tmed, u.temperatura.critico_max, `Media de ${tmed.toFixed(1)} °C supera el umbral crítico de la especie (${u.temperatura.critico_max} °C): el crecimiento se detiene.`);
        else if (tmed < u.temperatura.critico_min) add('Frío sobre umbral crítico', 'critica', tmed, u.temperatura.critico_min, `Media de ${tmed.toFixed(1)} °C por debajo del mínimo crítico (${u.temperatura.critico_min} °C): metabolismo CAM casi detenido.`);
    }

    const tmin = prom.temp_min_abs;
    if (tmin !== undefined && tmin !== null) {
        const dh = danioHelada(tmin, u.tmin);
        if (dh >= 100) add('Helada letal', 'critica', tmin, u.tmin.letal_min, `Mínima extrema de ${tmin.toFixed(1)} °C (≤ ${u.tmin.letal_min} °C): helada letal para ${especie.nombre_comun}. Sitio no apto sin protección.`);
        else if (dh > 0) add('Riesgo de helada', 'advertencia', tmin, u.tmin.critico_min, `Mínima extrema de ${tmin.toFixed(1)} °C: daño foliar estimado del ${Math.round(dh)}%. Evitar hondonadas y plantar en laderas con buen drenaje de aire.`);
    }

    if (ocurrencias !== undefined && ocurrencias !== null) {
        if (ocurrencias === 0) add('Sin registros GBIF', 'critica', 0, 1, `Especie no reportada en GBIF dentro del radio: alto riesgo, no hay evidencia de que prospere aquí.`);
        else if (ocurrencias >= 20) add('Presencia confirmada GBIF', 'info', ocurrencias, 20, `${ocurrencias} registros de ocurrencia cercanos: evidencia empírica de adaptación local.`);
    }

    if (suelo) {
        if (suelo.ph < 5.5) add('Suelo ácido', 'advertencia', suelo.ph, 5.5, `pH ${suelo.ph} (< 5.5): encalar antes de sembrar (cal agrícola o dolomita).`);
        else if (suelo.ph > 8.2) add('Suelo alcalino', 'advertencia', suelo.ph, 8.2, `pH ${suelo.ph} (> 8.2): aplicar materia orgánica/azufre; vigilar deficiencias de Fe y Zn.`);
        if (suelo.arcilla_pct > 40) add('Suelo arcilloso', 'advertencia', suelo.arcilla_pct, 40, `Arcilla ${suelo.arcilla_pct}%: drenaje lento. Se recomienda ${recomendarEspeciePorTextura('arcilloso')}.`);
        else if (suelo.arena_pct > 70) add('Suelo arenoso', 'info', suelo.arena_pct, 70, `Arena ${suelo.arena_pct}%: baja retención; se recomienda ${recomendarEspeciePorTextura('arenoso')}.`);
    }

    const rad = prom.radiacion_mj;
    if (rad !== undefined && rad !== null && rad > 25) {
        add('Alta radiación', 'advertencia', rad, 25, `Radiación de ${rad.toFixed(1)} MJ/m²/día (> 25): considerar sombra parcial en plántulas y riego en ola de calor.`);
    }

    if (params) {
        const ev = evaluarClima(params, u, especie?.tipo_fotosintesis || 'CAM');
        if (ev.variables.agua.zona === 'critico_alto' || ev.variables.agua.zona === 'letal_alto') {
            add('Riesgo de encharcamiento', 'critica', params.agua, u.agua.critico_max, `Humedad estimada ${params.agua}% (> ${u.agua.critico_max}%): asfixia radicular y pudrición; solo con drenaje artificial.`);
        }
        if (ev.variables.agua.zona === 'critico_bajo' || ev.variables.agua.zona === 'letal_bajo') {
            add('Sequía crítica', 'critica', params.agua, u.agua.critico_min, `Humedad estimada ${params.agua}% (< ${u.agua.critico_min}%): sin riego la planta no gana biomasa y acumula daño.`);
        }
    }

    if (!reglas.some(r => r.severidad === 'critica' || r.severidad === 'advertencia')) {
        add('Sitio favorable', 'info', 0, 0, `Sin restricciones agroclimáticas importantes para ${especie.nombre_comun}.`);
    }
    return reglas;
}

function recomendarEspeciePorTextura(textura) {
    if (textura === 'arcilloso') return 'Maguey pulquero (A. salmiana), más tolerante a suelos pesados, con camellones';
    return 'Agave espadín (A. angustifolia), tolerante a déficit hídrico';
}

/** Clase textural USDA simplificada a partir de arena/arcilla (%). */
export function claseTextural(arena, arcilla) {
    if (arena === null || arcilla === null || arena === undefined || arcilla === undefined) return 'Sin dato';
    const limo = 100 - arena - arcilla;
    if (arcilla >= 40) return limo >= 40 ? 'Arcillo-limoso' : (arena >= 45 ? 'Arcillo-arenoso' : 'Arcilloso');
    if (arcilla >= 27) return arena >= 45 ? 'Franco-arcillo-arenoso' : (arena <= 20 ? 'Franco-arcillo-limoso' : 'Franco-arcilloso');
    if (arena >= 85) return 'Arenoso';
    if (arena >= 70) return 'Areno-francoso';
    if (limo >= 80) return 'Limoso';
    if (limo >= 50) return 'Franco-limoso';
    if (arena >= 52) return 'Franco-arenoso';
    return 'Franco';
}

/** Línea del tiempo constante (escenario manual) a partir de un clima. */
export function timelineConstante(clima) {
    return Array.from({ length: TOTAL_ANIOS }, () => ({ ...clima }));
}

/** Clima "central óptimo" de una especie (valores por defecto de los sliders). */
export function climaOptimo(especie) {
    const u = obtenerUmbrales(especie);
    const mid = (v) => +(((u[v].optimo_min + u[v].optimo_max) / 2)).toFixed(1);
    return {
        temp: mid('temperatura'),
        agua: Math.round(mid('agua')),
        luz: Math.round(mid('luz')),
        nut: Math.round(mid('nutrientes')),
        ph: mid('ph'),
        co2: 425,
        tmin: u.tmin.critico_min + 6
    };
}
