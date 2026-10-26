/**
 * Observatorio Global de Cultivos: controla el globo, el panel de datos reales,
 * el comparador A/B geográfico, el ranking de idoneidad y el guardado de análisis.
 */
import { Globo } from './globo.js';
import { apiGet, apiPost, urlApi } from './api.js';
import * as AG from './agronomia.js';

const UBICACIONES_RESPALDO = [
    { id: 1, nombre: 'Tequila', region: 'Jalisco', pais: 'México', latitud: 20.88, longitud: -103.84, tipo: 'referencia', descripcion: 'Núcleo de la DO Tequila.' },
    { id: 2, nombre: 'Arandas', region: 'Jalisco', pais: 'México', latitud: 20.70, longitud: -102.35, tipo: 'referencia', descripcion: 'Los Altos de Jalisco.' },
    { id: 3, nombre: 'Santiago Matatlán', region: 'Oaxaca', pais: 'México', latitud: 16.86, longitud: -96.38, tipo: 'referencia', descripcion: 'Capital del mezcal.' },
    { id: 4, nombre: 'Apan', region: 'Hidalgo', pais: 'México', latitud: 19.71, longitud: -98.45, tipo: 'referencia', descripcion: 'Maguey pulquero.' },
    { id: 5, nombre: 'Chilapa de Álvarez', region: 'Guerrero', pais: 'México', latitud: 17.60, longitud: -99.18, tipo: 'referencia', descripcion: 'Agave papalote.' },
    { id: 6, nombre: 'Toluca', region: 'Estado de México', pais: 'México', latitud: 19.29, longitud: -99.66, tipo: 'referencia', descripcion: 'Altiplano con heladas.' },
    { id: 7, nombre: 'Jutiapa', region: 'Jutiapa', pais: 'Guatemala', latitud: 14.28, longitud: -89.89, tipo: 'referencia', descripcion: 'Corredor seco.' },
    { id: 8, nombre: 'Córdoba', region: 'Andalucía', pais: 'España', latitud: 37.88, longitud: -4.78, tipo: 'referencia', descripcion: 'Mediterráneo continental.' },
    { id: 9, nombre: 'Almería', region: 'Andalucía', pais: 'España', latitud: 36.84, longitud: -2.46, tipo: 'referencia', descripcion: 'Árido mediterráneo.' },
    { id: 10, nombre: 'Iquitos', region: 'Loreto', pais: 'Perú', latitud: -3.75, longitud: -73.25, tipo: 'referencia', descripcion: 'Selva amazónica.' }
];

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 1, suf = '') => (v === null || v === undefined || Number.isNaN(+v)) ? '—' : `${(+v).toFixed(d)}${suf}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COLOR_ZONA = {
    optimo: '#2ecc71', suboptimo_bajo: '#f1c40f', suboptimo_alto: '#f1c40f',
    critico_bajo: '#e67e22', critico_alto: '#e67e22', letal_bajo: '#e74c3c', letal_alto: '#e74c3c'
};
const NOMBRE_ZONA = {
    optimo: 'Óptimo', suboptimo_bajo: 'Subóptimo (bajo)', suboptimo_alto: 'Subóptimo (alto)',
    critico_bajo: 'Crítico (bajo)', critico_alto: 'Crítico (alto)', letal_bajo: 'Letal (bajo)', letal_alto: 'Letal (alto)'
};

export function colorPorIdoneidad(i) {
    return AG.clasificarIdoneidad(i).color;
}

/**
 * hooks = { obtenerCatalogo(), lanzarSimulacionGeo(opciones), cambiarModo(modo) }
 */
export function iniciarObservatorio(hooks) {
    const cacheLocal = new Map();
    const estado = {
        punto: null,          // { lat, lon, datos }
        a: null, b: null,     // slots A/B: { lat, lon, nombre, datos }
        ubicaciones: [],
        guardados: [],
        ocurrencias: null,
        graficaClima: null
    };

    const globo = new Globo($('globe-container'), {
        onClicPunto: (lat, lon, extra) => consultarPunto(lat, lon, extra),
        onClicMarcador: (d) => {
            if (d.tipo === 'referencia') consultarPunto(+d.ubicacion.latitud, +d.ubicacion.longitud);
            else if (d.tipo === 'guardado') consultarPunto(+d.analisis.latitud, +d.analisis.longitud);
            else if (d.tipo === 'ab') {
                const s = d.slot === 'A' ? estado.a : estado.b;
                if (s) consultarPunto(s.lat, s.lon);
            }
        },
        onHover: mostrarTooltip
    });

    const especies = () => hooks.obtenerCatalogo();
    const especieSel = () => especies().find(e => e.id === +$('geo-especie').value) || especies()[0];
    const radio = () => +$('geo-radio').value;

    /* ---------------- Tooltip ---------------- */

    function mostrarTooltip(el, e) {
        const tip = $('globo-tooltip');
        if (!el || el.tipo === 'tierra' || !e) {
            if (el && el.tipo === 'tierra' && e) {
                tip.innerHTML = `${fmt(el.datos.lat, 2)}°, ${fmt(el.datos.lon, 2)}° · clic para consultar`;
            } else {
                tip.classList.add('hidden');
                return;
            }
        } else if (el.tipo === 'ocurrencia') {
            const [lat, lon, pais, anio, tipo] = el.datos;
            tip.innerHTML = `🌿 Ocurrencia GBIF · ${esc(pais || '¿?')} ${anio || ''}<br><small>${esc(tipo || '')} · ${fmt(lat, 2)}°, ${fmt(lon, 2)}°</small>`;
        } else if (el.datos.tipo === 'referencia') {
            tip.innerHTML = `📍 <b>${esc(el.datos.ubicacion.nombre)}</b> (${esc(el.datos.ubicacion.pais)})<br><small>${esc(el.datos.ubicacion.descripcion || '')}</small>`;
        } else if (el.datos.tipo === 'guardado') {
            const a = el.datos.analisis;
            tip.innerHTML = `💾 <b>${esc(a.nombre)}</b> · ${esc(a.nombre_comun)}<br><small>Idoneidad ${fmt(a.idoneidad)} (${esc(a.clase_idoneidad)})</small>`;
        } else if (el.datos.tipo === 'ab') {
            tip.innerHTML = `Escenario ${el.datos.slot}`;
        } else {
            tip.classList.add('hidden');
            return;
        }
        tip.style.left = `${e.clientX + 14}px`;
        tip.style.top = `${e.clientY + 14}px`;
        tip.classList.remove('hidden');
    }

    /* ---------------- Datos de un punto ---------------- */

    async function obtenerDatosPunto(lat, lon) {
        const clave = `${lat.toFixed(2)},${lon.toFixed(2)},${radio()}`;
        if (cacheLocal.has(clave)) return cacheLocal.get(clave);
        const datos = await apiGet('/geo/punto', { lat: lat.toFixed(4), lon: lon.toFixed(4), radio: radio() });
        cacheLocal.set(clave, datos);
        return datos;
    }

    function conteoGbif(datos, especieId) {
        return datos?.gbif?.especies?.find(e => e.especie_id === especieId)?.conteo ?? null;
    }

    /** Análisis completo de un punto para una especie: parámetros, idoneidad, reglas y simulación de 7 años. */
    function analizar(datos, especie) {
        const params = AG.parametrosDesdeDatosReales(datos, especie);
        const conteo = conteoGbif(datos, especie.id);
        const idon = AG.indiceIdoneidad(params.promedio, especie, conteo ?? 0);
        const reglas = AG.reglasGeoAgronomicas(datos, especie, params.promedio, conteo);
        const sim = AG.simularCiclo({
            especie, modelo: 'logistico', r: especie.tasa_r_base, K: especie.capacidad_k_base, timeline: params.timeline
        });
        return { especie, params, conteo, idon, reglas, sim };
    }

    async function consultarPunto(lat, lon, extra = {}) {
        lon = ((lon + 540) % 360) - 180;
        globo.setSeleccion(lat, lon);
        $('geo-placeholder').classList.add('hidden');
        $('geo-contenido').classList.add('hidden');
        $('geo-error').classList.add('hidden');
        $('geo-cargando').classList.remove('hidden');
        $('geo-cargando-texto').textContent = `Consultando NASA POWER, Open-Meteo, SoilGrids y GBIF para ${fmt(lat, 2)}°, ${fmt(lon, 2)}°…`;
        try {
            const datos = await obtenerDatosPunto(lat, lon);
            estado.punto = { lat, lon, datos, extra };
            renderPunto();
        } catch (err) {
            $('geo-error').textContent = `⚠️ No se pudieron obtener datos: ${err.message}. ¿Apache está activo en XAMPP?`;
            $('geo-error').classList.remove('hidden');
        } finally {
            $('geo-cargando').classList.add('hidden');
        }
    }

    function nombrePunto(p) {
        const l = p.datos.lugar;
        return l?.disponible ? `${l.nombre}${l.pais ? ', ' + l.pais : ''}` : `${fmt(p.lat, 2)}°, ${fmt(p.lon, 2)}°`;
    }

    function renderPunto() {
        const p = estado.punto;
        if (!p) return;
        const d = p.datos;
        const esp = especieSel();
        const an = analizar(d, esp);
        p.analisis = an;

        $('geo-contenido').classList.remove('hidden');
        $('geo-lugar').textContent = d.lugar?.disponible ? d.lugar.nombre : 'Punto sin localidad';
        $('geo-coords').textContent = `${d.lugar?.region ? d.lugar.region + ', ' : ''}${d.lugar?.pais || ''} · ${fmt(p.lat, 3)}°, ${fmt(p.lon, 3)}° · ${fmt(d.clima?.elevacion_m, 0, ' m')}`;
        const fuentes = d.cache_por_fuente || {};
        const hits = Object.values(fuentes).filter(c => c === 'HIT').length;
        $('geo-cache-info').textContent = `⏱️ ${d.tiempo_ms} ms · caché MySQL: ${hits}/${Object.keys(fuentes).length} fuentes`;
        if (p.extra?.ocurrencia) {
            const o = p.extra.ocurrencia;
            $('geo-cache-info').textContent += ` · 🌿 ocurrencia GBIF ${o[3] || ''} (${o[4] || ''})`;
        }

        // Idoneidad
        const c = an.idon.clase;
        $('idoneidad-valor').textContent = fmt(an.idon.indice, 0);
        $('idoneidad-valor').style.color = c.color;
        $('idoneidad-clase').textContent = `${c.etiqueta} para ${esp.nombre_comun}`;
        $('idoneidad-clase').style.color = c.color;
        $('idoneidad-sim').innerHTML = an.sim.muerta
            ? `💀 Simulación 7 años con clima real: <b>muere</b> en el año ${Math.ceil(an.sim.tickMuerte / AG.TICKS_POR_ANIO)} (${AG.NOMBRES_VARIABLE[an.sim.causaMuerte] || an.sim.causaMuerte})`
            : `🌱 Simulación 7 años con clima real: <b>${fmt(an.sim.biomasa, 0)} g</b> (${fmt(an.sim.fraccion * 100, 0)}% de K) · ${esc(an.sim.estado.etiqueta)}`;

        const etiquetasFactor = { temperatura: '🌡️ Temp.', agua: '💧 Agua', luz: '☀️ Luz', nutrientes: '🧪 Nutr.', ph: '🪨 pH', gbif: '🌿 GBIF' };
        $('idoneidad-factores').innerHTML = Object.entries(AG.PESOS_IDONEIDAD).map(([k, w]) => {
            const f = an.idon.componentes[k];
            const zona = an.idon.zonas[k];
            const color = k === 'gbif' ? (f > 0.5 ? '#2ecc71' : f > 0 ? '#f1c40f' : '#e74c3c') : COLOR_ZONA[zona];
            const titulo = k === 'gbif' ? `${an.conteo ?? 0} registros en ${radio()} km` : NOMBRE_ZONA[zona];
            return `<div class="factor-row" title="${esc(titulo)}">
                <span>${etiquetasFactor[k]} <small>×${w}</small></span>
                <div class="progress-bar"><div class="progress-fill" style="width:${f * 100}%;background:${color}"></div></div>
                <b>${fmt(f * 100, 0)}</b>
            </div>`;
        }).join('') + (an.idon.danioHelada > 0 ? `<p class="nota-roja">❄️ Penalización por helada: −${fmt(an.idon.danioHelada, 0)}%</p>` : '');

        // Reglas geo-agronómicas
        $('geo-reglas').innerHTML = an.reglas.map(r => `
            <li class="regla-${r.severidad}"><b>${esc(r.tipo_alerta)}</b><br>${esc(r.recomendacion)}</li>`).join('');

        // Clima histórico
        const cl = d.clima;
        if (cl?.disponible) {
            const pr = cl.promedio;
            $('geo-clima').innerHTML = `
                <div class="dato"><span>Temp. media</span><b>${fmt(pr.temp_media, 1, ' °C')}</b></div>
                <div class="dato"><span>Mín. extrema</span><b>${fmt(pr.temp_min_abs, 1, ' °C')}</b></div>
                <div class="dato"><span>Máx. extrema</span><b>${fmt(pr.temp_max_abs, 1, ' °C')}</b></div>
                <div class="dato"><span>Precipitación</span><b>${fmt(pr.precipitacion_mm, 0, ' mm')}</b></div>
                <div class="dato"><span>ET₀</span><b>${fmt(pr.et0_mm, 0, ' mm')}</b></div>
                <div class="dato"><span>Aridez P/ET₀</span><b>${fmt(pr.indice_aridez, 2)}</b></div>
                <div class="dato"><span>Radiación</span><b>${fmt(pr.radiacion_mj, 1, ' MJ')}</b></div>
                <div class="dato"><span>Hum. relativa</span><b>${fmt(pr.humedad_relativa, 0, '%')}</b></div>
                <div class="dato"><span>Periodo</span><b>${esc(cl.periodo)}</b></div>`;
            dibujarClima(cl.climatologia_mensual);
        } else {
            $('geo-clima').innerHTML = `<p class="nota-roja">NASA POWER no respondió: ${esc(cl?.error)}</p>`;
        }

        // Condiciones actuales
        const ac = d.actual;
        $('geo-actual').innerHTML = ac?.disponible ? `
            <div class="dato"><span>Ahora</span><b>${fmt(ac.temperatura, 1, ' °C')}</b></div>
            <div class="dato"><span>Hum. relativa</span><b>${fmt(ac.humedad_relativa, 0, '%')}</b></div>
            <div class="dato"><span>Suelo 9-27 cm</span><b>${fmt(ac.humedad_suelo_9_27cm, 3, ' m³/m³')}</b></div>
            <div class="dato"><span>Lluvia 7 días</span><b>${fmt(ac.pronostico_7d.precipitacion_mm, 1, ' mm')}</b></div>
            <div class="dato"><span>ET₀ 7 días</span><b>${fmt(ac.pronostico_7d.et0_mm, 1, ' mm')}</b></div>
            <div class="dato"><span>Mín. 7 días</span><b>${fmt(ac.pronostico_7d.temp_min, 1, ' °C')}</b></div>`
            : `<p class="nota-roja">Open-Meteo no respondió.</p>`;

        // Suelo
        const s = d.suelo;
        $('geo-suelo').innerHTML = s?.disponible ? `
            <div class="dato"><span>pH (H₂O)</span><b>${fmt(s.ph, 1)}</b></div>
            <div class="dato"><span>Textura</span><b>${AG.claseTextural(s.arena_pct, s.arcilla_pct)}</b></div>
            <div class="dato"><span>Arcilla / Arena</span><b>${fmt(s.arcilla_pct, 0)}% / ${fmt(s.arena_pct, 0)}%</b></div>
            <div class="dato"><span>Carbono org.</span><b>${fmt(s.carbono_organico_gkg, 1, ' g/kg')}</b></div>
            <div class="dato"><span>Nitrógeno</span><b>${fmt(s.nitrogeno_gkg, 2, ' g/kg')}</b></div>
            <div class="dato"><span>CIC</span><b>${fmt(s.cec_cmolkg, 1, ' cmol/kg')}</b></div>
            ${s.nota ? `<p class="nota">${esc(s.nota)}</p>` : ''}`
            : `<p class="nota-roja">${esc(s?.error || 'Sin datos de suelo')}. Se usan valores típicos de la especie (pH y nutrientes estimados).</p>`;

        // GBIF
        const g = d.gbif;
        $('geo-gbif').innerHTML = `
            <p class="nota">Radio ${g.radio_km} km · género <i>Agave</i>: <b>${g.genero_agave ?? '—'}</b> registros</p>
            <table class="mini-tabla">${especies().map(e => {
                const n = conteoGbif(d, e.id);
                return `<tr${e.id === esp.id ? ' class="fila-sel"' : ''}><td><i>${esc(e.nombre_cientifico)}</i></td><td><b>${n ?? '—'}</b></td></tr>`;
            }).join('')}</table>`;

        // Parámetros derivados
        const pm = an.params.promedio;
        $('geo-params').innerHTML = `
            <div class="dato"><span>🌡️ Temp</span><b>${fmt(pm.temp, 1, ' °C')}</b></div>
            <div class="dato"><span>❄️ Tmin</span><b>${fmt(pm.tmin, 1, ' °C')}</b></div>
            <div class="dato"><span>💧 Agua</span><b>${fmt(pm.agua, 0, '%')}</b></div>
            <div class="dato"><span>☀️ Luz</span><b>${fmt(pm.luz, 0, '%')}</b></div>
            <div class="dato"><span>🧪 Nutr.</span><b>${fmt(pm.nut, 0, '%')}</b></div>
            <div class="dato"><span>🪨 pH</span><b>${fmt(pm.ph, 1)}</b></div>
            ${an.params.sueloEstimado ? '<p class="nota">pH y nutrientes estimados (sin dato de SoilGrids).</p>' : ''}`;

        // Ranking de especies en el punto
        const ranking = especies().map(e => analizar(d, e)).sort((x, y) => y.idon.indice - x.idon.indice);
        $('geo-ranking-especies').innerHTML = ranking.map((r, i) => `
            <tr${r.especie.id === esp.id ? ' class="fila-sel"' : ''}>
                <td>${i === 0 ? '🏆' : i + 1}</td>
                <td>${esc(r.especie.nombre_comun)}</td>
                <td style="color:${r.idon.clase.color}"><b>${fmt(r.idon.indice, 0)}</b></td>
                <td>${r.sim.muerta ? '💀' : fmt(r.sim.biomasa, 0) + ' g'}</td>
            </tr>`).join('');
    }

    function dibujarClima(meses) {
        const ctx = $('geo-clima-chart').getContext('2d');
        const etiquetas = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
        const datos = {
            labels: etiquetas,
            datasets: [
                { type: 'bar', label: 'Lluvia (mm)', data: meses.map(m => m.precip_mm), backgroundColor: 'rgba(56,189,248,0.6)', yAxisID: 'y' },
                { type: 'line', label: 'Temp (°C)', data: meses.map(m => m.temp), borderColor: '#f39c12', tension: 0.3, yAxisID: 'y1', pointRadius: 2 }
            ]
        };
        if (estado.graficaClima) {
            estado.graficaClima.data = datos;
            estado.graficaClima.update();
            return;
        }
        estado.graficaClima = new Chart(ctx, {
            data: datos,
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { labels: { color: '#e2e8f0', boxWidth: 10, font: { size: 9 } } } },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 9 } } },
                    y: { position: 'left', ticks: { color: '#38bdf8', font: { size: 9 } } },
                    y1: { position: 'right', ticks: { color: '#f39c12', font: { size: 9 } }, grid: { drawOnChartArea: false } }
                }
            }
        });
    }

    /* ---------------- Ocurrencias GBIF y capas ---------------- */

    async function cargarOcurrencias() {
        const esp = especieSel();
        $('gbif-resumen').innerHTML = `Cargando ocurrencias de <i>${esc(esp.nombre_cientifico)}</i>…`;
        try {
            const occ = await apiGet('/geo/ocurrencias', { especie_id: esp.id, limite: 900 });
            estado.ocurrencias = occ;
            globo.setOcurrencias(occ.puntos, esp.color_hex || '#9be15d');
            $('gbif-resumen').innerHTML = `
                <b>${occ.mostrados}</b> puntos en el globo de <b>${(occ.total_registros ?? 0).toLocaleString('es-MX')}</b> registros georreferenciados.
                <br><small>Top países: ${occ.paises.map(p => `${p.codigo} ${p.conteo}`).join(' · ') || '—'}</small>`;
        } catch (err) {
            $('gbif-resumen').innerHTML = `<span class="nota-roja">GBIF no disponible: ${esc(err.message)}</span>`;
        }
        cargarDensidad(esp);
    }

    function cargarDensidad(esp) {
        const cargar = (x) => new Promise((ok) => {
            const img = new Image();
            img.onload = () => ok(img);
            img.onerror = () => ok(null);
            img.src = urlApi('/geo/mapa-densidad', { especie_id: esp.id, x });
        });
        Promise.all([cargar(0), cargar(1)]).then(([o, e]) => globo.setDensidad(o, e));
    }

    async function cargarUbicaciones() {
        try {
            estado.ubicaciones = await apiGet('/geo/ubicaciones');
        } catch (e) {
            estado.ubicaciones = UBICACIONES_RESPALDO;
        }
        const refs = estado.ubicaciones.filter(u => u.tipo === 'referencia');
        globo.setReferencias(refs);
        $('lista-referencias').innerHTML = refs.map(u => `
            <button class="chip" data-lat="${u.latitud}" data-lon="${u.longitud}" title="${esc(u.descripcion || '')}">📍 ${esc(u.nombre)} <small>${esc(u.codigo_pais || u.pais || '')}</small></button>`).join('');
        $('lista-referencias').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
            globo.volarA(+b.dataset.lat, +b.dataset.lon);
            consultarPunto(+b.dataset.lat, +b.dataset.lon);
        }));
    }

    async function cargarGuardados() {
        try {
            estado.guardados = await apiGet('/geo/analisis');
            globo.setGuardados(estado.guardados, colorPorIdoneidad);
        } catch (e) {
            estado.guardados = [];
        }
    }

    /* ---------------- A/B ---------------- */

    function fijarSlot(slot) {
        const p = estado.punto;
        if (!p) return;
        estado[slot] = { lat: p.lat, lon: p.lon, nombre: nombrePunto(p), datos: p.datos };
        renderSlots();
    }

    function renderSlots() {
        ['a', 'b'].forEach(s => {
            const v = estado[s];
            $(`slot-${s}`).innerHTML = v ? `<b>${s.toUpperCase()}:</b> ${esc(v.nombre)}` : `<b>${s.toUpperCase()}:</b> <i>sin fijar</i>`;
        });
        globo.setAB(estado.a, estado.b);
        $('btn-comparar-ab').disabled = !(estado.a && estado.b);
    }

    function compararAB() {
        if (!estado.a || !estado.b) return;
        const esp = especieSel();
        const A = analizar(estado.a.datos, esp);
        const B = analizar(estado.b.datos, esp);
        const ca = estado.a.datos.clima?.promedio || {}, cb = estado.b.datos.clima?.promedio || {};
        const sa = estado.a.datos.suelo || {}, sb = estado.b.datos.suelo || {};

        // [etiqueta, valorA, valorB, decimales, sufijo, criterio] criterio: 'mayor' | 'menor' | 'rango' | null
        const filas = [
            ['Índice de idoneidad', A.idon.indice, B.idon.indice, 0, '', 'mayor'],
            ['Biomasa simulada año 7 (g)', A.sim.biomasa, B.sim.biomasa, 0, ' g', 'mayor'],
            ['Daño fisiológico final', A.sim.danio, B.sim.danio, 0, '%', 'menor'],
            ['Estrés global promedio', A.sim.estresPromedio, B.sim.estresPromedio, 0, '%', 'menor'],
            ['Ocurrencias GBIF (radio)', A.conteo, B.conteo, 0, '', 'mayor'],
            ['Temperatura media', ca.temp_media, cb.temp_media, 1, ' °C', null],
            ['Mínima extrema (heladas)', ca.temp_min_abs, cb.temp_min_abs, 1, ' °C', 'mayor'],
            ['Precipitación anual', ca.precipitacion_mm, cb.precipitacion_mm, 0, ' mm', null],
            ['Índice de aridez P/ET₀', ca.indice_aridez, cb.indice_aridez, 2, '', null],
            ['Radiación solar', ca.radiacion_mj, cb.radiacion_mj, 1, ' MJ/m²/d', null],
            ['pH del suelo', sa.ph, sb.ph, 1, '', null],
            ['Arcilla', sa.arcilla_pct, sb.arcilla_pct, 0, '%', null],
            ['Agua aprovechable (sim.)', A.params.promedio.agua, B.params.promedio.agua, 0, '%', null]
        ];
        let puntosA = 0, puntosB = 0;
        const html = filas.map(([et, va, vb, dec, suf, crit]) => {
            let ga = false, gb = false;
            if (crit && va !== null && vb !== null && va !== undefined && vb !== undefined && va !== vb) {
                ga = crit === 'mayor' ? va > vb : va < vb;
                gb = !ga;
                if (ga) puntosA++; else puntosB++;
            }
            return `<tr><td>${et}</td><td class="${ga ? 'gana' : ''}">${fmt(va, dec, suf)}</td><td class="${gb ? 'gana' : ''}">${fmt(vb, dec, suf)}</td></tr>`;
        }).join('');

        // Ganador: puntaje compuesto 50% idoneidad + 50% biomasa relativa; si una muere, gana la que sobrevive
        const puntaje = (x) => x.sim.muerta ? -1 : 0.5 * x.idon.indice + 0.5 * x.sim.fraccion * 100;
        const pA = puntaje(A), pB = puntaje(B);
        const ganador = pA === pB ? null : (pA > pB ? 'A' : 'B');
        const nombreG = ganador === 'A' ? estado.a.nombre : estado.b.nombre;

        $('ab-titulo').textContent = `⚖️ ¿Dónde crece mejor ${esp.nombre_comun}?`;
        $('ab-contenido').innerHTML = `
            <table class="data-table ab-tabla">
                <thead><tr><th>Métrica</th><th class="col-a">A · ${esc(estado.a.nombre)}</th><th class="col-b">B · ${esc(estado.b.nombre)}</th></tr></thead>
                <tbody>${html}</tbody>
            </table>
            <div class="ab-veredicto ${ganador ? 'gana-' + ganador.toLowerCase() : ''}">
                ${ganador
                    ? `🏆 Gana <b>${ganador} · ${esc(nombreG)}</b> con puntaje compuesto ${fmt(Math.max(pA, pB), 1)} vs ${Math.min(pA, pB) < 0 ? '💀 (la planta muere en la otra ubicación)' : fmt(Math.min(pA, pB), 1)}`
                    : 'Empate técnico'}
                <br><small>Puntaje = 50% idoneidad + 50% biomasa simulada (% de K); una ubicación donde la planta muere pierde automáticamente. Métricas ganadas: A ${puntosA} · B ${puntosB}.</small>
            </div>
            <div class="ab-reglas">
                <div><h4 class="col-a">Reglas en A</h4><ul class="reglas">${A.reglas.map(r => `<li class="regla-${r.severidad}">${esc(r.recomendacion)}</li>`).join('')}</ul></div>
                <div><h4 class="col-b">Reglas en B</h4><ul class="reglas">${B.reglas.map(r => `<li class="regla-${r.severidad}">${esc(r.recomendacion)}</li>`).join('')}</ul></div>
            </div>`;
        $('ab-modal').classList.remove('hidden');
    }

    /* ---------------- Ranking ---------------- */

    async function abrirRanking() {
        $('ranking-modal').classList.remove('hidden');
        const sel = $('ranking-especie');
        if (!sel.options.length) {
            sel.innerHTML = `<option value="0">Todas las especies</option>` + especies().map(e => `<option value="${e.id}">${esc(e.nombre_comun)}</option>`).join('');
            sel.value = especieSel().id;
        }
        const lugares = new Map();
        const agregar = (lat, lon, nombre, tipo) => {
            const k = `${(+lat).toFixed(2)},${(+lon).toFixed(2)}`;
            if (!lugares.has(k)) lugares.set(k, { lat: +lat, lon: +lon, nombre, tipo });
        };
        estado.ubicaciones.forEach(u => agregar(u.latitud, u.longitud, `${u.nombre} (${u.codigo_pais || u.pais || ''})`, u.tipo));
        estado.guardados.forEach(a => agregar(a.latitud, a.longitud, `${a.nombre} (${a.pais || ''})`, 'usuario'));
        ['a', 'b'].forEach(s => estado[s] && agregar(estado[s].lat, estado[s].lon, estado[s].nombre, 'A/B'));
        if (estado.punto) agregar(estado.punto.lat, estado.punto.lon, nombrePunto(estado.punto), 'actual');

        const lista = [...lugares.values()];
        const resultados = [];
        for (let i = 0; i < lista.length; i++) {
            const l = lista[i];
            $('ranking-progreso').textContent = `Consultando ${i + 1}/${lista.length}: ${l.nombre}… (respuestas en caché MySQL son instantáneas)`;
            try {
                l.datos = await obtenerDatosPunto(l.lat, l.lon);
                resultados.push(l);
            } catch (e) { /* se omite la ubicación con error */ }
            renderRanking(resultados);
        }
        $('ranking-progreso').textContent = `${resultados.length} ubicaciones × ${especies().length} especies evaluadas con datos reales.`;
    }

    function renderRanking(lugares) {
        const filtro = +$('ranking-especie').value;
        const filas = [];
        lugares.forEach(l => especies().forEach(e => {
            if (filtro && e.id !== filtro) return;
            const an = analizar(l.datos, e);
            filas.push({ l, e, an });
        }));
        filas.sort((x, y) => y.an.idon.indice - x.an.idon.indice || y.an.sim.biomasa - x.an.sim.biomasa);
        $('ranking-tabla').querySelector('tbody').innerHTML = filas.map((f, i) => `
            <tr data-lat="${f.l.lat}" data-lon="${f.l.lon}" class="fila-click">
                <td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                <td>${esc(f.l.nombre)} <small class="tag">${esc(f.l.tipo)}</small></td>
                <td>${esc(f.e.nombre_comun)}</td>
                <td style="color:${f.an.idon.clase.color}"><b>${fmt(f.an.idon.indice, 1)}</b> ${f.an.idon.clase.etiqueta}</td>
                <td>${f.an.sim.muerta ? '💀 muere' : fmt(f.an.sim.biomasa, 0) + ' g'}</td>
                <td>${f.an.conteo ?? '—'}</td>
                <td>${f.an.idon.limitante ? esc(AG.NOMBRES_VARIABLE[f.an.idon.limitante]) : '✅ Ninguno'}</td>
            </tr>`).join('');
        $('ranking-tabla').querySelectorAll('.fila-click').forEach(tr => tr.addEventListener('click', () => {
            $('ranking-modal').classList.add('hidden');
            globo.volarA(+tr.dataset.lat, +tr.dataset.lon);
            consultarPunto(+tr.dataset.lat, +tr.dataset.lon);
        }));
        estado.ultimoRanking = lugares;
    }

    /* ---------------- Guardar / Simular ---------------- */

    function payloadAnalisis(p, an) {
        const d = p.datos, cl = d.clima?.promedio || {}, s = d.suelo?.disponible ? d.suelo : {};
        return {
            ubicacion: {
                nombre: d.lugar?.disponible ? d.lugar.nombre : nombrePunto(p),
                region: d.lugar?.region, pais: d.lugar?.pais, codigo_pais: d.lugar?.codigo_pais,
                lat: p.lat, lon: p.lon, elevacion: d.clima?.elevacion_m
            },
            especie_id: an.especie.id,
            idoneidad: an.idon.indice,
            clase_idoneidad: an.idon.clase.id,
            detalle_idoneidad: { componentes: an.idon.componentes, zonas: an.idon.zonas, pesos: AG.PESOS_IDONEIDAD, danio_helada: an.idon.danioHelada },
            params_simulacion: { promedio: an.params.promedio, timeline: an.params.timeline },
            datos: {
                periodo_clima: d.clima?.periodo,
                temp_media: cl.temp_media, temp_max_abs: cl.temp_max_abs, temp_min_abs: cl.temp_min_abs,
                precipitacion_anual: cl.precipitacion_mm, radiacion_solar: cl.radiacion_mj, humedad_relativa: cl.humedad_relativa,
                evapotranspiracion: cl.et0_mm, humedad_suelo_actual: d.actual?.humedad_suelo_9_27cm,
                ph_suelo: s.ph, arcilla_pct: s.arcilla_pct, arena_pct: s.arena_pct, carbono_organico: s.carbono_organico_gkg, nitrogeno: s.nitrogeno_gkg,
                ocurrencias_gbif: an.conteo, radio_gbif_km: d.gbif?.radio_km
            },
            decisiones: an.reglas
        };
    }

    async function guardarAnalisis() {
        const p = estado.punto;
        if (!p?.analisis) return;
        const btn = $('btn-guardar-analisis');
        btn.disabled = true;
        try {
            const r = await apiPost('/geo/analisis', payloadAnalisis(p, p.analisis));
            btn.textContent = `✅ Guardado #${r.id}`;
            await cargarGuardados();
            await cargarUbicaciones();
        } catch (err) {
            alert(`⚠️ No se pudo guardar el análisis: ${err.message}`);
        } finally {
            setTimeout(() => { btn.disabled = false; btn.textContent = '💾 Guardar análisis'; }, 1800);
        }
    }

    function simularAqui() {
        const p = estado.punto;
        if (!p?.analisis) return;
        hooks.lanzarSimulacionGeo({
            especieId: p.analisis.especie.id,
            ubicacion: { nombre: nombrePunto(p), lat: p.lat, lon: p.lon, periodo: p.datos.clima?.periodo },
            timeline: p.analisis.params.timeline,
            analisis: payloadAnalisis(p, p.analisis)
        });
    }

    function simularAB() {
        const esp = especieSel();
        const A = analizar(estado.a.datos, esp);
        const B = analizar(estado.b.datos, esp);
        $('ab-modal').classList.add('hidden');
        hooks.lanzarSimulacionGeo({
            especieId: esp.id,
            ubicacion: { nombre: estado.a.nombre, lat: estado.a.lat, lon: estado.a.lon, periodo: estado.a.datos.clima?.periodo },
            timeline: A.params.timeline,
            analisis: payloadAnalisis({ ...estado.a }, A),
            ubicacionB: { nombre: estado.b.nombre, lat: estado.b.lat, lon: estado.b.lon },
            timelineB: B.params.timeline
        });
    }

    /* ---------------- Búsqueda ---------------- */

    async function buscar() {
        const q = $('geo-buscar').value.trim();
        if (q.length < 2) return;
        $('geo-resultados').innerHTML = '<li>Buscando…</li>';
        try {
            const r = await apiGet('/geo/buscar', { q });
            $('geo-resultados').innerHTML = r.resultados.length
                ? r.resultados.map(x => `<li data-lat="${x.lat}" data-lon="${x.lon}">📍 ${esc(x.nombre)} <small>${esc([x.region, x.pais].filter(Boolean).join(', '))}</small></li>`).join('')
                : '<li>Sin resultados</li>';
            $('geo-resultados').querySelectorAll('li[data-lat]').forEach(li => li.addEventListener('click', () => {
                $('geo-resultados').innerHTML = '';
                globo.volarA(+li.dataset.lat, +li.dataset.lon, 170);
                consultarPunto(+li.dataset.lat, +li.dataset.lon);
            }));
        } catch (err) {
            $('geo-resultados').innerHTML = `<li class="nota-roja">${esc(err.message)}</li>`;
        }
    }

    /* ---------------- Eventos ---------------- */

    function poblarEspecies() {
        $('geo-especie').innerHTML = especies().map(e => `<option value="${e.id}">${esc(e.nombre_comun)} (${esc(e.nombre_cientifico)})</option>`).join('');
    }

    $('geo-especie').addEventListener('change', () => { cargarOcurrencias(); renderPunto(); });
    $('geo-radio').addEventListener('input', () => { $('geo-val-radio').textContent = radio(); });
    $('geo-radio').addEventListener('change', () => { if (estado.punto) consultarPunto(estado.punto.lat, estado.punto.lon); });
    $('geo-buscar-btn').addEventListener('click', buscar);
    $('geo-buscar').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });
    [['capa-ocurrencias', 'ocurrencias'], ['capa-densidad', 'densidad'], ['capa-referencias', 'referencias'], ['capa-guardados', 'guardados'], ['capa-reticula', 'reticula']]
        .forEach(([id, capa]) => $(id).addEventListener('change', (e) => globo.setVisible(capa, e.target.checked)));
    $('btn-fijar-a').addEventListener('click', () => fijarSlot('a'));
    $('btn-fijar-b').addEventListener('click', () => fijarSlot('b'));
    $('btn-comparar-ab').addEventListener('click', compararAB);
    $('btn-ab-simular').addEventListener('click', simularAB);
    $('btn-close-ab').addEventListener('click', () => $('ab-modal').classList.add('hidden'));
    $('btn-ranking').addEventListener('click', abrirRanking);
    $('btn-close-ranking').addEventListener('click', () => $('ranking-modal').classList.add('hidden'));
    $('ranking-especie').addEventListener('change', () => estado.ultimoRanking && renderRanking(estado.ultimoRanking));
    $('btn-guardar-analisis').addEventListener('click', guardarAnalisis);
    $('btn-simular-aqui').addEventListener('click', simularAqui);
    $('btn-ejemplo-ab').addEventListener('click', async () => {
        // Ejemplo del enunciado: Jutiapa (Guatemala) vs Córdoba (España)
        const cargarSlot = async (lat, lon, nombre) => ({ lat, lon, nombre, datos: await obtenerDatosPunto(lat, lon) });
        $('btn-ejemplo-ab').disabled = true;
        try {
            estado.a = await cargarSlot(14.28, -89.89, 'Jutiapa, Guatemala');
            estado.b = await cargarSlot(37.88, -4.78, 'Córdoba, España');
            renderSlots();
            globo.volarA(28, -48, 420);
            compararAB();
        } catch (err) {
            alert(`⚠️ ${err.message}`);
        } finally {
            $('btn-ejemplo-ab').disabled = false;
        }
    });

    renderSlots();

    return {
        activar() {
            globo.iniciar();
        },
        desactivar() {
            globo.detener();
            $('globo-tooltip').classList.add('hidden');
        },
        async alCargarCatalogo() {
            poblarEspecies();
            await Promise.all([cargarUbicaciones(), cargarGuardados()]);
            cargarOcurrencias();
            if (estado.punto) renderPunto();
        },
        refrescarGuardados: cargarGuardados
    };
}
