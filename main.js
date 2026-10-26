import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as AG from './js/agronomia.js';
import { apiGet, apiPost } from './js/api.js';
import { iniciarObservatorio } from './js/observatorio.js';

// Catálogo de respaldo (si MySQL no responde). Los óptimos son el centro de la zona óptima de js/agronomia.js
let catalogoEspecies = [
    { id: 1, nombre_cientifico: 'Agave tequilana Weber', nombre_comun: 'Agave Azul (Tequilero)', tipo_fotosintesis: 'CAM', tasa_r_base: 0.140, capacidad_k_base: 4500, altura_max_m: 3.8, luz_optima: 65, agua_optima: 48, temp_optima: 22, nutrientes_optimos: 63, ph_optimo: 6.8, co2_optimo: 425, color_hex: '#4a858c' },
    { id: 2, nombre_cientifico: 'Agave angustifolia Haw', nombre_comun: 'Agave Espadín (Mezcalero)', tipo_fotosintesis: 'CAM', tasa_r_base: 0.165, capacidad_k_base: 5200, altura_max_m: 4.2, luz_optima: 68, agua_optima: 42, temp_optima: 25, nutrientes_optimos: 55, ph_optimo: 7.0, co2_optimo: 425, color_hex: '#5c9c54' },
    { id: 3, nombre_cientifico: 'Agave salmiana Otto', nombre_comun: 'Maguey Pulquero / Manso', tipo_fotosintesis: 'CAM', tasa_r_base: 0.120, capacidad_k_base: 6800, altura_max_m: 4.8, luz_optima: 63, agua_optima: 50, temp_optima: 18, nutrientes_optimos: 68, ph_optimo: 7.1, co2_optimo: 425, color_hex: '#28593a' },
    { id: 4, nombre_cientifico: 'Agave cupreata Trel', nombre_comun: 'Agave Papalote', tipo_fotosintesis: 'CAM', tasa_r_base: 0.110, capacidad_k_base: 3800, altura_max_m: 3.1, luz_optima: 60, agua_optima: 53, temp_optima: 20, nutrientes_optimos: 63, ph_optimo: 6.4, co2_optimo: 425, color_hex: '#738c4a' },
    { id: 5, nombre_cientifico: 'Arabidopsis thaliana', nombre_comun: 'Arabidopsis (Modelo Genético)', tipo_fotosintesis: 'C3', tasa_r_base: 0.250, capacidad_k_base: 850, altura_max_m: 1.2, luz_optima: 50, agua_optima: 63, temp_optima: 21, nutrientes_optimos: 68, ph_optimo: 6.5, co2_optimo: 425, color_hex: '#76b843' }
];

const MORFOLOGIA_ESPECIES = {
    1: { porteGeneral: 1.0, pinaAncho: 1.0, pinaAlto: 1.15, colorPina: 0xdbd8a0, pencaAncho: 0.85, pencaLargo: 1.05, pencaGrosor: 0.14, aperturaRoseta: 0.0, quioteAncho: 1.0, quioteAlto: 1.05, colorHoja: '#4a858c' },
    2: { porteGeneral: 1.05, pinaAncho: 0.88, pinaAlto: 1.0, colorPina: 0xcfd68a, pencaAncho: 0.50, pencaLargo: 1.32, pencaGrosor: 0.11, aperturaRoseta: -0.16, quioteAncho: 0.85, quioteAlto: 1.15, colorHoja: '#5c9c54' },
    3: { porteGeneral: 1.28, pinaAncho: 1.38, pinaAlto: 1.25, colorPina: 0xc2b978, pencaAncho: 1.75, pencaLargo: 1.12, pencaGrosor: 0.26, aperturaRoseta: 0.12, quioteAncho: 1.45, quioteAlto: 1.20, colorHoja: '#28593a' },
    4: { porteGeneral: 0.88, pinaAncho: 1.15, pinaAlto: 0.85, colorPina: 0xe0c46c, pencaAncho: 1.95, pencaLargo: 0.72, pencaGrosor: 0.16, aperturaRoseta: 0.28, quioteAncho: 0.95, quioteAlto: 0.90, colorHoja: '#738c4a' },
    5: { porteGeneral: 0.55, pinaAncho: 0.42, pinaAlto: 0.45, colorPina: 0x9ab863, pencaAncho: 1.40, pencaLargo: 0.48, pencaGrosor: 0.08, aperturaRoseta: 0.38, quioteAncho: 0.55, quioteAlto: 0.85, colorHoja: '#76b843' }
};

const EXPLICACIONES_MODELOS = {
    logistico: {
        titulo: '📐 Modelo Logístico de Verhulst: dN/dt = r·N(1 − N/K)',
        texto: 'Crecimiento sigmoidal autorregulado. La tasa efectiva es r·f(Liebig)·f(CO₂)·(1 − daño), y la K efectiva se reduce con el daño permanente.'
    },
    gompertz: {
        titulo: '📐 Modelo de Gompertz: N(t) = K·exp(−exp(−r(t − t₀)))',
        texto: 'Sigmoide asimétrica ideal para órganos de reserva (piña). Su inflexión ocurre antes del 50% de K: acumulación inicial rápida y maduración prolongada.'
    },
    exponencial: {
        titulo: '📐 Modelo Exponencial: N(t) = N₀·e^(r·t)',
        texto: 'Multiplicación sin autorregulación: la biomasa se acelera a tasa r efectiva constante hasta topar con la K efectiva.'
    },
    lineal: {
        titulo: '📐 Modelo Lineal: N(t) = a·t + b',
        texto: 'Ganancia constante de biomasa por unidad de tiempo. Línea base de control para comparar contra los modelos sigmoidales.'
    }
};

const ETIQUETAS_ANIO = ['Establecimiento', 'Desarrollo Juvenil', 'Crecimiento Vegetativo', 'Acumulación Inulina', 'Cierre de Roseta', 'Engorda de Piña', 'Madurez / Quiote'];
const SLIDERS_CLIMA = [
    ['luz', 'param-luz', 'val-luz'], ['agua', 'param-agua', 'val-agua'], ['temp', 'param-temp', 'val-temp'],
    ['tmin', 'param-tmin', 'val-tmin'], ['nut', 'param-nut', 'val-nut'], ['ph', 'param-ph', 'val-ph'], ['co2', 'param-co2', 'val-co2']
];

let especieActual = catalogoEspecies[0];
let especieB = catalogoEspecies[2];
let currentDay = 0;
let lastRecordedTick = -1;
let isGrowing = true;
let simSpeed = 1.5;
let abModeActive = false;
let modo = 'globo';

let anioSeleccionadoParaEdicion = null;
let timelineAnios = [];
let timelineB = null;            // línea del tiempo real de la ubicación B (comparador A/B geográfico)
let contextoGeo = null;          // { ubicacion, analisis, ubicacionB } cuando la simulación viene del globo

const $ = (id) => document.getElementById(id);
const tickADiasReales = (tick) => Math.round(tick * AG.DIAS_POR_TICK);
const obtenerAnioDesdeTick = (tick) => Math.min(AG.TOTAL_ANIOS, Math.max(1, Math.floor(tick / AG.TICKS_POR_ANIO) + 1));

function inicializarTimelinePorEspecie(esp, timelineReal = null) {
    const optimo = AG.climaOptimo(esp);
    timelineAnios = ETIQUETAS_ANIO.map((etiqueta, idx) => ({
        anio: idx + 1,
        etiqueta,
        anioReal: timelineReal?.[idx]?.anioReal ?? null,
        ...(timelineReal ? {
            luz: timelineReal[idx].luz, agua: timelineReal[idx].agua, temp: timelineReal[idx].temp,
            tmin: timelineReal[idx].tmin ?? optimo.tmin, nut: timelineReal[idx].nut, ph: timelineReal[idx].ph, co2: timelineReal[idx].co2
        } : optimo),
        biomasaGuardada: null,
        danioGuardado: null,
        estadoAnio: null,
        plantaMuertaEnAnio: false,
        editadoManual: false
    }));
    renderizarNodosTimeline();
}

function renderizarNodosTimeline() {
    const container = $('timeline-nodes');
    if (!container) return;
    const anioCurso = obtenerAnioDesdeTick(currentDay);

    container.innerHTML = timelineAnios.map(item => {
        const alcanzado = currentDay >= (item.anio - 1) * AG.TICKS_POR_ANIO;
        const clases = ['tl-node', alcanzado ? 'reached' : '', item.anio === anioCurso ? 'active-year' : '',
            item.anio === anioSeleccionadoParaEdicion ? 'selected' : '', item.estadoAnio ? `estado-${item.estadoAnio}` : ''].join(' ');
        let resumen = `💧${Math.round(item.agua)}% 🌡️${item.temp}°`;
        if (item.plantaMuertaEnAnio) resumen = '💀 Muerta';
        else if (item.biomasaGuardada !== null) resumen = `${Math.round(item.biomasaGuardada)}g${item.danioGuardado > 0 ? ` · D${Math.round(item.danioGuardado)}%` : ''}`;

        return `
            <div class="${clases}" data-anio="${item.anio}" title="Año ${item.anio}${item.anioReal ? ` (${item.anioReal}, datos reales)` : ''} - ${item.etiqueta}">
                <div class="tl-line"></div>
                <span class="tl-label">Año ${item.anio}${item.anioReal ? ` · ${item.anioReal}` : ''}${item.editadoManual ? '*' : ''}</span>
                <span class="tl-sub">${resumen}</span>
            </div>`;
    }).join('');

    container.querySelectorAll('.tl-node').forEach(node => {
        node.addEventListener('click', () => seleccionarAnioTimeline(+node.dataset.anio));
    });
}

function cargarSlidersDesdeAnio(anioNum) {
    const datos = timelineAnios[anioNum - 1];
    if (!datos) return;
    SLIDERS_CLIMA.forEach(([clave, slider, etiqueta]) => {
        if (datos[clave] === null || datos[clave] === undefined) return;
        $(slider).value = datos[clave];
        $(etiqueta).innerText = datos[clave];
    });
}

function textoClimaAnio(d) {
    return `☀️ ${d.luz}% | 💧 ${d.agua}% | 🌡️ ${d.temp}°C | ❄️ ${d.tmin}°C | 🧪 ${d.nut}% | 🪨 pH ${d.ph} | 🫧 ${d.co2} ppm`;
}

function seleccionarAnioTimeline(anioNum) {
    anioSeleccionadoParaEdicion = anioNum;
    cargarSlidersDesdeAnio(anioNum);
    const d = timelineAnios[anioNum - 1];
    const rangoDias = `Día ${(anioNum - 1) * 365} al ${anioNum * 365}`;
    $('timeline-edit-status').innerText = `✏️ Editando Año ${anioNum} (${rangoDias})`;
    $('tl-detail-text').innerHTML = `<b>Año ${anioNum}${d.anioReal ? ` (${d.anioReal})` : ''}:</b> ${textoClimaAnio(d)}`;
    $('btn-tl-live').classList.remove('hidden');
    renderizarNodosTimeline();
}

function guardarSlidersEnAnioActivo() {
    const anioObjetivo = anioSeleccionadoParaEdicion ?? obtenerAnioDesdeTick(currentDay);
    const valores = Object.fromEntries(SLIDERS_CLIMA.map(([clave, slider]) => [clave, parseFloat($(slider).value)]));

    // Los años posteriores heredan el cambio salvo que hayan sido editados o provengan de datos reales
    for (let i = anioObjetivo - 1; i < AG.TOTAL_ANIOS; i++) {
        if (i === anioObjetivo - 1 || (!timelineAnios[i].editadoManual && !timelineAnios[i].anioReal)) {
            Object.assign(timelineAnios[i], valores);
        }
    }
    timelineAnios[anioObjetivo - 1].editadoManual = true;
    $('tl-detail-text').innerHTML = `<b>Año ${anioObjetivo} actualizado:</b> ${textoClimaAnio(timelineAnios[anioObjetivo - 1])}`;
    recalcularHistorialGrafica();
    renderizarNodosTimeline();
}

function actualizarExplicacionModelo() {
    const info = EXPLICACIONES_MODELOS[$('model-select').value] || EXPLICACIONES_MODELOS.logistico;
    $('model-exp-title').innerText = info.titulo;
    $('model-exp-desc').innerText = info.texto;
}

let medicionesCorrida = [];
let decisionesCorrida = [];
let ultimaAlertaEmitida = '';
let estadoA = AG.simularCiclo({ especie: especieActual, modelo: 'logistico', r: 0.14, K: 4500, timeline: AG.timelineConstante(AG.climaOptimo(especieActual)) }, 0);
let estadoB = estadoA;

/* =====================================================================
 *  ESCENA 3D DE LA PARCELA (Práctica 05)
 * ===================================================================== */

const contenedorParcela = $('parcela-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x87CEEB, 0.008);
const colorDia = new THREE.Color(0x87CEEB);
const colorNoche = new THREE.Color(0x0a1931);
scene.background = colorDia.clone();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const initialCameraPos = new THREE.Vector3(0, 12, 28);
camera.position.copy(initialCameraPos);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.id = 'three-canvas';
contenedorParcela.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 3, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.03;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(20, 35, 20);
dirLight.castShadow = true;
Object.assign(dirLight.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 });
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const planoGeo = new THREE.PlaneGeometry(150, 150, 60, 60);
const pos = planoGeo.attributes.position.array;
for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1];
    if (Math.sqrt(x * x + y * y) > 15) pos[i + 2] = Math.sin(x / 12) * Math.cos(y / 12) * 0.8;
}
planoGeo.computeVertexNormals();
const materialTerreno = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.95 });
const terreno = new THREE.Mesh(planoGeo, materialTerreno);
terreno.rotation.x = -Math.PI / 2;
terreno.receiveShadow = true;
scene.add(terreno);
const colorSueloSeco = new THREE.Color(0x8a6f4d);
const colorSueloHumedo = new THREE.Color(0x3a2a1c);

(function generarEscenario() {
    const rocaMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 });
    const troncoMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 1 });
    const hojasMat = new THREE.MeshStandardMaterial({ color: 0x2d4c1e, roughness: 0.9 });
    for (let i = 0; i < 95; i++) {
        const x = (Math.random() - 0.5) * 130;
        const z = (Math.random() - 0.5) * 130;
        if (x > -16 && x < 16 && z > -16 && z < 16) continue;
        if (Math.random() < 0.35) {
            const r = Math.random() * 1.4 + 0.5;
            const roca = new THREE.Mesh(new THREE.SphereGeometry(r, 5, 4), rocaMat);
            roca.position.set(x, r * 0.5, z);
            roca.castShadow = true;
            scene.add(roca);
        } else {
            const arbol = new THREE.Group();
            arbol.position.set(x, 0, z);
            const hT = Math.random() * 3.5 + 3;
            const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, hT), troncoMat);
            tronco.position.y = hT / 2;
            const hC = Math.random() * 5 + 4;
            const copa = new THREE.Mesh(new THREE.ConeGeometry(3.2, hC, 8), hojasMat);
            copa.position.y = hT + hC / 2 - 1;
            copa.castShadow = true;
            arbol.add(tronco, copa);
            scene.add(arbol);
        }
    }
})();

const interactableObjects = [];
const todosLosAgaves = [];

function crearAgave(posX, posZ, id, escenarioGrupo) {
    const agaveGroup = new THREE.Group();
    agaveGroup.position.set(posX, 0, posZ);
    agaveGroup.userData.idAgave = id;
    agaveGroup.userData.escenario = escenarioGrupo;
    agaveGroup.userData.quioteCortado = false;

    const matPencas = new THREE.MeshStandardMaterial({ color: 0x4a858c, roughness: 0.65 });
    const matPina = new THREE.MeshStandardMaterial({ color: 0xdbd8a0, roughness: 0.9 });
    agaveGroup.userData.materialPencas = matPencas;
    agaveGroup.userData.materialPina = matPina;

    const pinaGeo = new THREE.SphereGeometry(1.2, 28, 28);
    pinaGeo.translate(0, 0.6, 0);
    const pina = new THREE.Mesh(pinaGeo, matPina);
    pina.castShadow = true;
    pina.userData = {
        idAgave: id, agaveRef: agaveGroup, escenario: escenarioGrupo, partType: 'pina',
        name: `Piña / Corazón (Planta #${id} - Esc. ${escenarioGrupo})`, type: 'Esfera Escalada', biomassShare: 0.55,
        desc: 'Órgano de reserva principal de fructanos e inulina.'
    };
    agaveGroup.add(pina);
    interactableObjects.push(pina);

    const quioteGroup = new THREE.Group();
    quioteGroup.position.y = 0.5;
    const alturaQuiote = 9.5;
    const quioteGeo = new THREE.CylinderGeometry(0.13, 0.26, alturaQuiote, 16);
    quioteGeo.translate(0, alturaQuiote / 2, 0);
    const quioteMesh = new THREE.Mesh(quioteGeo, new THREE.MeshStandardMaterial({ color: 0x6e8f4e }));
    quioteMesh.castShadow = true;
    quioteMesh.userData = {
        idAgave: id, agaveRef: agaveGroup, escenario: escenarioGrupo, partType: 'quiote',
        name: `Quiote Floral (Planta #${id} - Esc. ${escenarioGrupo})`, type: 'Cilindro Compuesto (9.5m)', biomassShare: 0.15,
        desc: 'Inflorescencia reproductiva; si se corta (desquiote), la piña concentra más azúcares.'
    };
    quioteGroup.add(quioteMesh);
    interactableObjects.push(quioteMesh);

    const matFlor = new THREE.MeshStandardMaterial({ color: 0xc5d86d });
    for (let k = 0; k < 5; k++) {
        const ramaFlor = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 10), matFlor);
        const ang = k * 1.4;
        ramaFlor.position.set(Math.cos(ang) * 0.38, alturaQuiote - 0.4 - (k * 0.75), Math.sin(ang) * 0.38);
        ramaFlor.scale.set(1.3, 0.45, 1.3);
        ramaFlor.userData = quioteMesh.userData;
        quioteGroup.add(ramaFlor);
        interactableObjects.push(ramaFlor);
    }
    agaveGroup.add(quioteGroup);

    const pencasGroup = new THREE.Group();
    const pivotesArray = [];
    const pencasMallas = [];
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 12; j++) {
            const pivote = new THREE.Group();
            pivote.rotation.y = (j / 12) * Math.PI * 2 + (i % 2) * (Math.PI / 12);
            pivote.position.y = 0.12 + (i * 0.28);

            const hPenca = 3.4 + (i * 0.2);
            const pencaGeo = new THREE.ConeGeometry(0.38, hPenca, 5);
            pencaGeo.translate(0, hPenca / 2, 0);
            const penca = new THREE.Mesh(pencaGeo, matPencas);
            const inclinacionBase = (Math.PI / 2.2) - (i * 0.22);
            penca.rotation.x = inclinacionBase;
            penca.userData = {
                idAgave: id, agaveRef: agaveGroup, escenario: escenarioGrupo, partType: 'penca', inclinacionBase,
                name: `Penca Foliar C${i + 1} (Planta #${id} - Esc. ${escenarioGrupo})`, type: 'Cono Modificado', biomassShare: 0.30,
                desc: 'Tejido fotosintético CAM receptor de radiación y estrés hídrico.'
            };
            penca.castShadow = true;
            pivote.add(penca);
            pencasGroup.add(pivote);
            pivotesArray.push(pivote);
            pencasMallas.push(penca);
            interactableObjects.push(penca);
        }
    }
    agaveGroup.add(pencasGroup);
    scene.add(agaveGroup);

    pina.scale.set(0.001, 0.001, 0.001);
    pencasGroup.scale.set(0.001, 0.001, 0.001);
    quioteGroup.scale.set(0.001, 0.001, 0.001);

    Object.assign(agaveGroup.userData, { pina, pencasGroup, quiote: quioteGroup, pivotes: pivotesArray, pencasMallas });
    todosLosAgaves.push(agaveGroup);
}

let idCounter = 1;
for (let fila = 0; fila < 2; fila++) {
    for (let col = 0; col < 3; col++) {
        crearAgave((col - 1) * 8.5, fila === 0 ? 4.8 : -4.8, idCounter++, fila === 0 ? 'A' : 'B');
    }
}

function aplicarMorfologiaEspecie() {
    todosLosAgaves.forEach(agave => {
        const esB = (agave.userData.escenario === 'B' && abModeActive);
        const morf = MORFOLOGIA_ESPECIES[(esB ? especieB : especieActual).id] || MORFOLOGIA_ESPECIES[1];
        agave.userData.materialPina.color.setHex(morf.colorPina);
        agave.userData.materialPencas.color.set(morf.colorHoja);
        agave.userData.pencasMallas.forEach(penca => {
            penca.scale.set(morf.pencaAncho, morf.pencaLargo, morf.pencaGrosor);
            penca.rotation.x = penca.userData.inclinacionBase + morf.aperturaRoseta;
        });
    });
}

/* =====================================================================
 *  MOTOR DE SIMULACIÓN (usa js/agronomia.js)
 * ===================================================================== */

function obtenerParamsBaseA() {
    return {
        especie: especieActual,
        modelo: $('model-select').value,
        r: parseFloat($('param-r').value),
        K: parseFloat($('param-k').value),
        timeline: timelineAnios
    };
}

function obtenerParamsBaseB(paramsA) {
    if (!abModeActive) return paramsA;
    const esp = especieB;
    const otraEspecie = esp.id !== especieActual.id;
    const timeline = timelineB
        ? timelineB
        : timelineAnios.map(a => ({ ...a, agua: parseFloat($('param-agua-b').value), temp: parseFloat($('param-temp-b').value) }));
    return {
        especie: esp,
        modelo: $('model-b-select').value,
        r: otraEspecie ? esp.tasa_r_base : paramsA.r,
        K: otraEspecie ? esp.capacidad_k_base : paramsA.K,
        timeline
    };
}

function sincronizarTimelineConResultado(res) {
    timelineAnios.forEach((a, i) => {
        const r = res.anual[i];
        a.biomasaGuardada = r ? r.biomasa : null;
        a.danioGuardado = r ? r.danio : null;
        a.estadoAnio = r ? r.estado : null;
        a.plantaMuertaEnAnio = r ? (r.muerta && (!res.anual[i - 1] || !res.anual[i - 1].muerta)) || (r.muerta && i === 0) : false;
    });
}

const ctxChart = $('growthChart').getContext('2d');
const growthChart = new Chart(ctxChart, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Biomasa A (g)', data: [], borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,0.15)', tension: 0.3, fill: true },
            { label: 'Biomasa B (g)', data: [], borderColor: '#f39c12', borderDash: [5, 5], tension: 0.3, hidden: true },
            { label: 'Estrés Global (%)', data: [], borderColor: '#e74c3c', tension: 0.2, yAxisID: 'y1' },
            { label: 'Daño acumulado (%)', data: [], borderColor: '#a855f7', borderDash: [3, 3], tension: 0.2, yAxisID: 'y1' }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
            x: { ticks: { color: '#94a3b8', maxTicksLimit: 7 } },
            y: { position: 'left', ticks: { color: '#2ecc71' }, title: { display: true, text: 'Biomasa (g)', color: '#94a3b8' } },
            y1: { position: 'right', min: 0, max: 100, ticks: { color: '#e74c3c' }, grid: { drawOnChartArea: false } }
        },
        plugins: { legend: { labels: { color: '#e2e8f0', boxWidth: 12, font: { size: 10 } } } }
    }
});

function medicionDesdeEstado(est, diasReales) {
    return {
        tick_dia: diasReales,
        altura: est.altura,
        biomasa: est.biomasa,
        num_hojas: est.hojas,
        num_ramas: est.ramas,
        icr: est.icr,
        estres_hidrico: est.estresHidrico,
        estres_termico: est.estresTermico,
        estres_global: est.estresGlobal,
        danio_acumulado: est.danio
    };
}

function agregarPuntoGrafica(tick, estA, estB) {
    const diasReales = tickADiasReales(tick);
    growthChart.data.labels.push(`A${obtenerAnioDesdeTick(tick)}·${diasReales}d`);
    growthChart.data.datasets[0].data.push(estA.biomasa);
    growthChart.data.datasets[1].data.push(estB.biomasa);
    growthChart.data.datasets[2].data.push(estA.estresGlobal);
    growthChart.data.datasets[3].data.push(estA.danio);
}

function recalcularHistorialGrafica() {
    growthChart.data.labels = [];
    growthChart.data.datasets.forEach(d => d.data = []);
    medicionesCorrida = [];
    const paramsA = obtenerParamsBaseA();
    const paramsB = obtenerParamsBaseB(paramsA);

    for (let t = 0; t <= Math.floor(currentDay); t += 5) {
        const estA = AG.simularCiclo(paramsA, t);
        const estB = AG.simularCiclo(paramsB, t);
        medicionesCorrida.push(medicionDesdeEstado(estA, tickADiasReales(t)));
        agregarPuntoGrafica(t, estA, estB);
    }
    growthChart.update();
}

/* =====================================================================
 *  MOTOR DE DECISIONES FISIOLÓGICAS (basado en zonas de la investigación)
 * ===================================================================== */

const RECOMENDACIONES_ZONA = {
    agua: {
        bajo: (v, u) => `Aumentar riego: humedad ${v}% bajo el umbral crítico (${u.critico_min}%). Sin ganancia de CO₂ y con daño acumulándose.`,
        alto: (v, u) => `Drenar y suspender riego: humedad ${v}% sobre ${u.critico_max}% → asfixia radicular y pudrición (Fusarium/Erwinia).`
    },
    temperatura: {
        bajo: (v, u) => `Frío crítico (${v} °C < ${u.critico_min} °C): metabolismo CAM detenido. Proteger con cubierta o reubicar el cultivo.`,
        alto: (v, u) => `Calor crítico (${v} °C > ${u.critico_max} °C): cierre estomático nocturno y quemaduras. Malla sombra y riego de auxilio.`
    },
    luz: {
        bajo: (v, u) => `Radiación insuficiente (${v}% < ${u.critico_min}%): balance de carbono negativo. Eliminar sombra/competencia.`,
        alto: (v, u) => `Radiación excesiva (${v}%): riesgo de fotoinhibición. Sombra parcial en plántulas.`
    },
    nutrientes: {
        bajo: (v, u) => `Deficiencia nutricional severa (${v}% < ${u.critico_min}%): fertilizar NPK + materia orgánica.`,
        alto: (v, u) => `Exceso de sales/fertilizante (${v}% > ${u.critico_max}%): lavar el suelo y suspender fertilización.`
    },
    ph: {
        bajo: (v, u) => `Suelo muy ácido (pH ${v} < ${u.critico_min}): toxicidad por aluminio. Encalar.`,
        alto: (v, u) => `Suelo muy alcalino/sódico (pH ${v} > ${u.critico_max}): aplicar yeso agrícola y materia orgánica.`
    },
    co2: {
        bajo: (v, u) => `CO₂ bajo el punto de compensación (${v} ppm < ${u.critico_min}).`,
        alto: (v) => `CO₂ anormalmente alto (${v} ppm).`
    }
};

function diagnosticarZonas(ev, umbrales) {
    const letal = [], critico = [], sub = [];
    Object.entries(ev.variables).forEach(([v, e]) => {
        if (e.zona.startsWith('letal')) letal.push([v, e]);
        else if (e.zona.startsWith('critico')) critico.push([v, e]);
        else if (e.zona.startsWith('suboptimo') && e.f < 0.5) sub.push([v, e]);
    });
    return { letal, critico, sub, umbrales };
}

function evaluarMotorDecisiones(tickDia) {
    const box = $('decision-box');
    const txt = $('decision-text');
    const winnerTxt = $('ab-winner-text');
    const anioCurso = obtenerAnioDesdeTick(tickDia);
    const diasReales = tickADiasReales(tickDia);
    const clima = timelineAnios[anioCurso - 1];
    const u = AG.obtenerUmbrales(especieActual);
    const diag = diagnosticarZonas(estadoA.evaluacion, u);

    let tipo = 'Óptimo Fisiológico', severidad = 'info', valor = estadoA.estresGlobal, umbral = 25;
    let recomendacion = `Año ${anioCurso} (Día ${diasReales}): todas las variables en zona favorable. Cosecha estimada en ${estadoA.diasCosecha} días.`;
    box.className = 'decision-ok';
    const zonaLado = (e) => e.zona.endsWith('bajo') ? 'bajo' : 'alto';

    if (estadoA.muerta) {
        box.className = 'decision-danger';
        tipo = 'Muerte Fisiológica'; severidad = 'critica'; valor = 100; umbral = 100;
        recomendacion = `💀 PLANTA MUERTA en el año ${Math.ceil(estadoA.tickMuerte / AG.TICKS_POR_ANIO)} por ${AG.NOMBRES_VARIABLE[estadoA.causaMuerte] || 'estrés combinado'}. Daño ≥ 100%: no hay recuperación total ni parcial. Corrige ese año o elige otra especie/ubicación.`;
    } else if (diag.letal.length) {
        const [v, e] = diag.letal[0];
        const diasRestantes = Math.max(1, Math.round((100 - estadoA.danio) / Math.max(0.01, estadoA.evaluacion.danioDiario)));
        box.className = 'decision-danger';
        tipo = `Condición letal: ${v}`; severidad = 'critica'; valor = e.valor; umbral = zonaLado(e) === 'bajo' ? u[v].letal_min : u[v].letal_max;
        recomendacion = `☠️ ${AG.NOMBRES_VARIABLE[v]} en zona LETAL (${e.valor}). Muerte en ~${diasRestantes} días si no se corrige. ${RECOMENDACIONES_ZONA[v][zonaLado(e)](e.valor, u[v])}`;
    } else if (estadoA.danio >= 70) {
        box.className = 'decision-danger';
        tipo = 'Daño Severo'; severidad = 'critica'; valor = estadoA.danio; umbral = 70;
        recomendacion = `🩸 Daño ${estadoA.danio}% (≥ 70%): crecimiento detenido. Solo una corrección inmediata permite recuperación parcial.`;
    } else if (diag.critico.length) {
        const [v, e] = diag.critico[0];
        box.className = 'decision-danger';
        tipo = `Zona crítica: ${v}`; severidad = 'critica'; valor = e.valor; umbral = zonaLado(e) === 'bajo' ? u[v].critico_min : u[v].critico_max;
        recomendacion = `⚠️ Año ${anioCurso}: ${RECOMENDACIONES_ZONA[v][zonaLado(e)](e.valor, u[v])}`;
    } else if (estadoA.danio >= 30) {
        box.className = 'decision-warn';
        tipo = 'Daño Parcial'; severidad = 'advertencia'; valor = estadoA.danio; umbral = 30;
        recomendacion = `🩹 Daño ${estadoA.danio}% con ${estadoA.danioPermanente}% permanente: la planta se recupera solo parcialmente (K efectiva reducida).`;
    } else if (clima && AG.danioHelada(clima.tmin, u.tmin) > 0) {
        box.className = 'decision-warn';
        tipo = 'Riesgo de Helada'; severidad = 'advertencia'; valor = clima.tmin; umbral = u.tmin.critico_min;
        recomendacion = `❄️ Año ${anioCurso}: mínima extrema de ${clima.tmin} °C (daño desde ${u.tmin.critico_min} °C, letal ${u.tmin.letal_min} °C). Plantar en laderas, evitar hondonadas.`;
    } else if (diag.sub.length) {
        const [v, e] = diag.sub.sort((a, b) => a[1].f - b[1].f)[0];
        box.className = 'decision-warn';
        tipo = `Limitante: ${v}`; severidad = 'advertencia'; valor = e.valor; umbral = zonaLado(e) === 'bajo' ? u[v].optimo_min : u[v].optimo_max;
        recomendacion = `📉 Año ${anioCurso}: ${AG.NOMBRES_VARIABLE[v]} (${e.valor}) fuera del óptimo [${u[v].optimo_min}-${u[v].optimo_max}]: crecimiento al ${Math.round(e.f * 100)}% (ley del mínimo).`;
    } else if (estadoA.fraccion >= 0.65 && estadoA.fraccion < 0.92) {
        box.className = 'decision-warn';
        tipo = 'Emergencia de Quiote'; valor = +(estadoA.fraccion * 100).toFixed(1); umbral = 65;
        recomendacion = `✂️ Quiote floral emergiendo: selecciona cada planta en 3D y presiona "Cortar Quiote" para concentrar inulina en la piña.`;
    } else if (estadoA.fraccion >= 0.92) {
        tipo = 'Madurez de Cosecha'; valor = +(estadoA.fraccion * 100).toFixed(1); umbral = 92;
        recomendacion = `✅ Biomasa > 92% de K. Programar jima de la piña.`;
    }

    txt.innerText = recomendacion;

    if (abModeActive) {
        winnerTxt.classList.remove('hidden');
        const etiquetaA = contextoGeo?.ubicacion ? contextoGeo.ubicacion.nombre : especieActual.nombre_comun;
        const etiquetaB = contextoGeo?.ubicacionB ? contextoGeo.ubicacionB.nombre : especieB.nombre_comun;
        if (estadoA.muerta !== estadoB.muerta) {
            winnerTxt.innerText = `🏆 Ganador A/B: ${estadoA.muerta ? `B (${etiquetaB})` : `A (${etiquetaA})`} — en la otra parcela la planta murió.`;
        } else {
            const diff = (estadoA.biomasa - estadoB.biomasa).toFixed(1);
            winnerTxt.innerText = estadoA.biomasa >= estadoB.biomasa
                ? `🏆 Ganador A/B: A (${etiquetaA}) con +${diff} g | Daño ${estadoA.danio}% vs ${estadoB.danio}%`
                : `🏆 Ganador A/B: B (${etiquetaB}) con +${Math.abs(diff)} g | Daño ${estadoB.danio}% vs ${estadoA.danio}%`;
        }
    } else {
        winnerTxt.classList.add('hidden');
    }

    if (tipo !== ultimaAlertaEmitida && tickDia > 0) {
        ultimaAlertaEmitida = tipo;
        decisionesCorrida.push({ tick_dia: diasReales, tipo_alerta: tipo, severidad, indicador_valor: +(+valor).toFixed(2), umbral, recomendacion: recomendacion.slice(0, 255) });
    }
}

/* =====================================================================
 *  CATÁLOGO Y PERSISTENCIA
 * ===================================================================== */

async function cargarCatalogoEspecies() {
    const statusBadge = $('db-status');
    try {
        const data = await apiGet('/especies');
        if (Array.isArray(data) && data.length > 0) {
            catalogoEspecies = data.map(e => ({
                ...e,
                id: +e.id,
                tasa_r_base: +e.tasa_r_base, capacidad_k_base: +e.capacidad_k_base, altura_max_m: +e.altura_max_m,
                luz_optima: +e.luz_optima, agua_optima: +e.agua_optima, temp_optima: +e.temp_optima,
                nutrientes_optimos: +e.nutrientes_optimos, ph_optimo: +e.ph_optimo, co2_optimo: +e.co2_optimo
            }));
            statusBadge.innerText = 'MySQL Conectado';
            statusBadge.className = 'badge badge-ok';
        }
    } catch (err) {
        statusBadge.innerText = 'Modo Local (sin MySQL)';
        statusBadge.className = 'badge badge-warn';
    }
    $('geo-db-status').innerText = statusBadge.innerText;
    $('geo-db-status').className = statusBadge.className;

    const opcionesHTML = catalogoEspecies.map(e => `<option value="${e.id}">${e.nombre_comun} (${e.nombre_cientifico})</option>`).join('');
    $('species-select').innerHTML = opcionesHTML;
    $('species-b-select').innerHTML = opcionesHTML;
    especieB = catalogoEspecies[2] || catalogoEspecies[0];
    $('species-b-select').value = especieB.id;

    aplicarEspecieSeleccionada(catalogoEspecies[0].id);
    await observatorio.alCargarCatalogo();
}

function aplicarEspecieSeleccionada(id, timelineReal = null) {
    especieActual = catalogoEspecies.find(e => e.id === +id) || catalogoEspecies[0];
    $('species-select').value = especieActual.id;
    $('param-r').value = especieActual.tasa_r_base;
    $('val-r').innerText = especieActual.tasa_r_base;
    $('param-k').value = especieActual.capacidad_k_base;
    $('val-k').innerText = especieActual.capacidad_k_base;

    inicializarTimelinePorEspecie(especieActual, timelineReal);
    cargarSlidersDesdeAnio(1);
    aplicarMorfologiaEspecie();
    actualizarExplicacionModelo();
    renderizarRangosEspecie();
    reiniciarSimulacion();
}

/** Muestra junto a cada slider el rango óptimo y crítico de la especie (de la investigación). */
function renderizarRangosEspecie() {
    const u = AG.obtenerUmbrales(especieActual);
    const mapa = { luz: 'luz', agua: 'agua', temp: 'temperatura', nut: 'nutrientes', ph: 'ph', co2: 'co2' };
    Object.entries(mapa).forEach(([clave, variable]) => {
        const el = $(`rango-${clave}`);
        if (el) el.innerText = `óptimo ${u[variable].optimo_min}–${u[variable].optimo_max} · crítico <${u[variable].critico_min} / >${u[variable].critico_max} · letal ≤${u[variable].letal_min} / ≥${u[variable].letal_max}`;
    });
    $('rango-tmin').innerText = `daño desde ${u.tmin.critico_min} °C · letal ≤ ${u.tmin.letal_min} °C (helada)`;
}

async function guardarSimulacionEnMySQL() {
    const nombre = $('sim-name').value.trim() || `Simulación 7 Años ${especieActual.nombre_comun}${contextoGeo ? ' en ' + contextoGeo.ubicacion.nombre : ''}`;
    const resumenClima = timelineAnios.map(a => `A${a.anio}${a.anioReal ? '/' + a.anioReal : ''}(💧${a.agua}%,🌡️${a.temp}°,❄️${a.tmin}°)`).join(' ');
    const notasUsuario = $('sim-notes').value.trim();
    const anioCurso = timelineAnios[obtenerAnioDesdeTick(currentDay) - 1];

    const payload = {
        nombre,
        especie_id: especieActual.id,
        modelo_matematico: $('model-select').value,
        tasa_r: parseFloat($('param-r').value),
        capacidad_k: parseFloat($('param-k').value),
        luz: anioCurso.luz,
        agua: anioCurso.agua,
        temperatura: anioCurso.temp,
        temp_minima: anioCurso.tmin,
        nutrientes: anioCurso.nut,
        ph: anioCurso.ph,
        co2: anioCurso.co2,
        biomasa_final: estadoA.biomasa,
        altura_final: estadoA.altura,
        estres_promedio: estadoA.estresPromedio,
        icr_promedio: estadoA.icr,
        danio_final: estadoA.danio,
        danio_permanente: estadoA.danioPermanente,
        estado_final: estadoA.estado.id,
        dias_simulados: Math.max(1, tickADiasReales(currentDay)),
        dias_estimados_cosecha: estadoA.diasCosecha + tickADiasReales(currentDay),
        es_escenario_ab: abModeActive ? 1 : 0,
        notas: `${notasUsuario} | Clima 7 años: ${resumenClima}`,
        mediciones: medicionesCorrida,
        decisiones: decisionesCorrida,
        analisis_geo: contextoGeo?.analisis || null
    };

    try {
        const data = await apiPost('/simulaciones', payload);
        alert(`✅ Simulación guardada en MySQL con ID #${data.id}${data.analisis_id ? ` (análisis geoespacial #${data.analisis_id})` : ''}`);
        $('save-modal').classList.add('hidden');
        observatorio.refrescarGuardados();
    } catch (err) {
        alert(`⚠️ Error al guardar en MySQL: ${err.message}`);
    }
}

async function abrirModalReportes() {
    $('reports-modal').classList.remove('hidden');
    try {
        const [rep, hist] = await Promise.all([apiGet('/reportes'), apiGet('/simulaciones')]);
        if (rep.resumen_global) {
            $('report-kpis').innerHTML = `
                <div class="kpi-card" style="flex:1"><span class="kpi-label">Total Corridas</span><strong>${rep.resumen_global.total_simulaciones}</strong></div>
                <div class="kpi-card" style="flex:1"><span class="kpi-label">Con datos reales (geo)</span><strong>${rep.resumen_global.simulaciones_geo ?? 0}</strong></div>
                <div class="kpi-card" style="flex:1"><span class="kpi-label">Récord Biomasa</span><strong>${rep.resumen_global.record_biomasa} g</strong></div>
                <div class="kpi-card" style="flex:1"><span class="kpi-label">Madurez Promedio</span><strong>${rep.resumen_global.promedio_madurez_global} días</strong></div>`;
        }
        $('table-top5').querySelector('tbody').innerHTML = (rep.top5_biomasa || []).map(r => `
            <tr><td>#${r.id}</td><td>${r.nombre}</td><td>${r.nombre_comun}</td><td>${r.ubicacion_nombre || '—'}</td><td>${r.modelo_matematico}</td>
            <td><b>${r.biomasa_final} g</b></td><td>${r.estado_final}</td><td>${r.estres_promedio}%</td></tr>`).join('');
        $('table-efficiency').querySelector('tbody').innerHTML = (rep.eficiencia_especies || []).map((e, idx) => `
            <tr><td>${idx === 0 ? '🏆 ' : ''}${e.nombre_comun}</td><td>${e.total_corridas}</td><td>${e.biomasa_promedio} g</td>
            <td><b>${e.eficiencia_diaria} g/día</b></td><td>${e.tiempo_promedio_madurez} días</td><td>${e.corridas_muertas}</td></tr>`).join('');
        $('table-sitios').querySelector('tbody').innerHTML = (rep.mejores_sitios || []).map(s => `
            <tr><td>${s.nombre} (${s.pais || ''})</td><td>${s.nombre_comun}</td><td><b>${s.idoneidad}</b> ${s.clase_idoneidad}</td><td>${s.ocurrencias_gbif ?? '—'}</td><td>${(s.fecha_creacion || '').slice(0, 10)}</td></tr>`).join('')
            || '<tr><td colspan="5">Aún no hay análisis geoespaciales guardados.</td></tr>';
        $('table-history').querySelector('tbody').innerHTML = (hist || []).map(s => `
            <tr><td>${(s.fecha_creacion || '').slice(0, 10)}</td><td>${s.nombre}</td><td>${s.nombre_comun}</td><td>${s.ubicacion_nombre || '—'}</td>
            <td>${s.modelo_matematico}</td><td>${s.biomasa_final} g</td>
            <td><button class="btn-load-sim" data-id="${s.id}" style="padding:4px 8px;">🔄 Cargar</button></td></tr>`).join('');
        document.querySelectorAll('.btn-load-sim').forEach(btn => btn.addEventListener('click', () => cargarSimulacionHistorica(btn.dataset.id)));
    } catch (err) {
        $('report-kpis').innerHTML = `<p style="color:#f39c12">Verifica que Apache y MySQL estén activos en XAMPP (${err.message}).</p>`;
    }
}

async function cargarSimulacionHistorica(id) {
    try {
        const sim = await apiGet(`/simulaciones/${id}`);
        const tl = sim.analisis_geo?.params_simulacion?.timeline || null;
        contextoGeo = tl ? { ubicacion: { nombre: sim.analisis_geo.ubicacion_nombre, lat: +sim.analisis_geo.latitud, lon: +sim.analisis_geo.longitud, periodo: sim.analisis_geo.periodo_clima }, analisis: null } : null;
        timelineB = null;
        aplicarEspecieSeleccionada(sim.especie_id, tl);
        if (!tl) {
            timelineAnios.forEach(a => Object.assign(a, {
                luz: +sim.luz, agua: +sim.agua, temp: +sim.temperatura, nut: +sim.nutrientes, co2: +sim.co2,
                ...(sim.ph !== null ? { ph: +sim.ph } : {}), ...(sim.temp_minima !== null ? { tmin: +sim.temp_minima } : {})
            }));
            cargarSlidersDesdeAnio(1);
        }
        $('model-select').value = sim.modelo_matematico;
        actualizarExplicacionModelo();
        $('param-r').value = sim.tasa_r;
        $('val-r').innerText = sim.tasa_r;
        $('param-k').value = sim.capacidad_k;
        $('val-k').innerText = sim.capacidad_k;
        $('reports-modal').classList.add('hidden');
        actualizarBannerGeo();
        reiniciarSimulacion();
    } catch (e) {
        console.error(e);
    }
}

/* =====================================================================
 *  RAYCASTING DE LA PARCELA
 * ===================================================================== */

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedMesh = null;
let selectedAgaveGroup = null;
const originalEmissive = new THREE.Color(0x000000);

function actualizarPanelRaycaster() {
    if (!selectedMesh) return;
    const data = selectedMesh.userData;
    const agave = data.agaveRef;
    selectedAgaveGroup = agave;
    const esB = data.escenario === 'B' && abModeActive;
    const est = esB ? estadoB : estadoA;
    const espInfo = esB ? especieB : especieActual;
    const bonoDesquiote = (agave && agave.userData.quioteCortado) ? 1.12 : 1.0;
    const biomasaEfectivaPlanta = +(est.biomasa * bonoDesquiote).toFixed(1);

    $('info-name').innerText = data.name;
    $('info-species').innerText = `${espInfo.nombre_comun} (${espInfo.nombre_cientifico})`;
    $('info-type').innerText = data.type;
    $('info-growth').innerText = est.muerta ? '0 (Muerta)' : Math.round(est.fraccion * 100);
    $('info-stress').innerText = est.estresGlobal;
    $('info-damage').innerText = `${est.danio}% (${est.estado.etiqueta})`;
    $('info-biomass-part').innerText = (biomasaEfectivaPlanta * data.biomassShare).toFixed(1);
    $('info-biomass-pct').innerText = Math.round(data.biomassShare * 100);
    $('info-desc').innerText = data.desc;

    const statusQuioteEl = $('info-quiote-status');
    const btnCut = $('btn-cut-quiote');
    const quioteYaEmergio = est.fraccion > 0.62 && !est.muerta;
    if (agave.userData.quioteCortado) {
        statusQuioteEl.innerText = '✂️ Desquiotado (+12% biomasa en piña)';
        btnCut.classList.remove('hidden');
        btnCut.disabled = true;
        btnCut.innerText = '✅ Quiote ya cortado en esta planta';
    } else if (quioteYaEmergio) {
        statusQuioteEl.innerText = '🌿 Quiote emergido (listo para corte)';
        btnCut.classList.remove('hidden');
        btnCut.disabled = false;
        btnCut.innerText = `✂️ Cortar Quiote de Planta #${agave.userData.idAgave}`;
    } else {
        statusQuioteEl.innerText = est.muerta ? '💀 Planta sin actividad biológica' : '🌱 Aún sin quiote (emerge al 62% de madurez)';
        btnCut.classList.add('hidden');
    }
}

$('btn-cut-quiote').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!selectedAgaveGroup) return;
    selectedAgaveGroup.userData.quioteCortado = true;
    selectedAgaveGroup.userData.quiote.scale.set(0.0001, 0.0001, 0.0001);
    selectedAgaveGroup.userData.quiote.visible = false;
    actualizarPanelRaycaster();
});

renderer.domElement.addEventListener('pointerdown', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, false);

    if (selectedMesh && selectedMesh.material) selectedMesh.material.emissive.copy(originalEmissive);
    if (intersects.length > 0) {
        selectedMesh = intersects[0].object;
        originalEmissive.copy(selectedMesh.material.emissive);
        selectedMesh.material.emissive.setHex(0x444444);
        actualizarPanelRaycaster();
        $('info-panel').classList.remove('hidden');
    } else {
        selectedMesh = null;
        selectedAgaveGroup = null;
        $('info-panel').classList.add('hidden');
    }
});

/* =====================================================================
 *  CONTROLES
 * ===================================================================== */

function bindSlider(id, labelId, esClimaTimeline = false) {
    const el = $(id);
    const lbl = $(labelId);
    el.addEventListener('input', () => {
        lbl.innerText = el.value;
        if (esClimaTimeline) guardarSlidersEnAnioActivo();
        else recalcularHistorialGrafica();
    });
}

bindSlider('param-r', 'val-r');
bindSlider('param-k', 'val-k');
SLIDERS_CLIMA.forEach(([, slider, etiqueta]) => bindSlider(slider, etiqueta, true));
bindSlider('param-agua-b', 'val-agua-b');
bindSlider('param-temp-b', 'val-temp-b');

$('growth-speed').addEventListener('input', (e) => {
    simSpeed = parseFloat(e.target.value);
    $('val-speed').innerText = simSpeed;
});

$('species-select').addEventListener('change', (e) => {
    contextoGeo = null;
    timelineB = null;
    actualizarBannerGeo();
    aplicarEspecieSeleccionada(e.target.value);
});

$('model-select').addEventListener('change', () => {
    actualizarExplicacionModelo();
    recalcularHistorialGrafica();
});

$('species-b-select').addEventListener('change', (e) => {
    especieB = catalogoEspecies.find(esp => esp.id === +e.target.value) || catalogoEspecies[0];
    aplicarMorfologiaEspecie();
    recalcularHistorialGrafica();
});

$('model-b-select').addEventListener('change', recalcularHistorialGrafica);

function activarAB(activo) {
    abModeActive = activo;
    $('toggle-ab').checked = activo;
    $('ab-controls').classList.toggle('hidden', !activo);
    $('ab-manual').classList.toggle('hidden', !!timelineB);
    $('ab-geo-nota').classList.toggle('hidden', !timelineB);
    growthChart.data.datasets[1].hidden = !activo;
    aplicarMorfologiaEspecie();
    recalcularHistorialGrafica();
}

$('toggle-ab').addEventListener('change', (e) => {
    if (!e.target.checked) {
        timelineB = null;
        if (contextoGeo) contextoGeo.ubicacionB = null;
        actualizarBannerGeo();
    }
    activarAB(e.target.checked);
});

$('btn-tl-live').addEventListener('click', () => {
    anioSeleccionadoParaEdicion = null;
    $('btn-tl-live').classList.add('hidden');
    $('timeline-edit-status').innerText = '💡 Haz clic en una línea anual para editar o ver su clima';
    $('tl-detail-text').innerText = 'Modo en vivo: los sliders muestran automáticamente el clima del año en curso.';
    cargarSlidersDesdeAnio(obtenerAnioDesdeTick(currentDay));
    renderizarNodosTimeline();
});

$('btn-pause-growth').addEventListener('click', (e) => {
    isGrowing = !isGrowing;
    e.target.innerText = isGrowing ? '⏸️ Pausar' : '▶️ Reanudar';
});

function reiniciarSimulacion() {
    currentDay = 0;
    lastRecordedTick = -1;
    anioSeleccionadoParaEdicion = null;
    medicionesCorrida = [];
    decisionesCorrida = [];
    ultimaAlertaEmitida = '';
    timelineAnios.forEach(a => Object.assign(a, { biomasaGuardada: null, danioGuardado: null, estadoAnio: null, plantaMuertaEnAnio: false }));
    todosLosAgaves.forEach(agave => {
        agave.userData.quioteCortado = false;
        agave.userData.quiote.visible = true;
    });
    growthChart.data.labels = [];
    growthChart.data.datasets.forEach(d => d.data = []);
    growthChart.update();
    isGrowing = true;
    $('btn-pause-growth').innerText = '⏸️ Pausar';
    renderizarNodosTimeline();
}

$('btn-restart').addEventListener('click', reiniciarSimulacion);
$('btn-camera').addEventListener('click', () => {
    camera.position.copy(initialCameraPos);
    controls.target.set(0, 3, 0);
});

$('btn-save-sim').addEventListener('click', () => $('save-modal').classList.remove('hidden'));
$('btn-close-save').addEventListener('click', () => $('save-modal').classList.add('hidden'));
$('btn-confirm-save').addEventListener('click', guardarSimulacionEnMySQL);
$('btn-reports').addEventListener('click', abrirModalReportes);
$('btn-close-reports').addEventListener('click', () => $('reports-modal').classList.add('hidden'));
document.querySelectorAll('.btn-qa-open').forEach(b => b.addEventListener('click', () => $('qa-modal').classList.remove('hidden')));
$('btn-close-qa').addEventListener('click', () => $('qa-modal').classList.add('hidden'));

$('btn-export-csv').addEventListener('click', () => {
    if (medicionesCorrida.length === 0) {
        alert('Deja correr la simulación unos segundos para acumular datos antes de exportar.');
        return;
    }
    const headers = 'Anio,Dia_Real,Altura_m,Biomasa_g,Num_Hojas,ICR,Estres_Hidrico,Estres_Termico,Estres_Global,Danio_Acumulado\n';
    const rows = medicionesCorrida.map(m =>
        `${Math.min(7, Math.floor(m.tick_dia / 365) + 1)},${m.tick_dia},${m.altura},${m.biomasa},${m.num_hojas},${m.icr},${m.estres_hidrico},${m.estres_termico},${m.estres_global},${m.danio_acumulado}`
    ).join('\n');
    const url = URL.createObjectURL(new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_7anios_${especieActual.nombre_comun.replace(/\s+/g, '_')}.csv`;
    a.click();
});

$('btn-export-pdf').addEventListener('click', () => window.print());

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

/* =====================================================================
 *  INTEGRACIÓN CON EL OBSERVATORIO (globo)
 * ===================================================================== */

function actualizarBannerGeo() {
    const banner = $('geo-context');
    if (!contextoGeo) {
        banner.classList.add('hidden');
        return;
    }
    const u = contextoGeo.ubicacion;
    banner.classList.remove('hidden');
    $('geo-context-texto').innerHTML = `📍 <b>${u.nombre}</b> · clima real NASA POWER ${u.periodo || ''}`
        + (contextoGeo.ubicacionB ? `<br>⚖️ Fila B: <b>${contextoGeo.ubicacionB.nombre}</b>` : '');
}

function cambiarModo(nuevo) {
    modo = nuevo;
    document.body.classList.toggle('modo-globo', modo === 'globo');
    document.body.classList.toggle('modo-parcela', modo === 'parcela');
    $('btn-modo-globo').classList.toggle('activo', modo === 'globo');
    $('btn-modo-parcela').classList.toggle('activo', modo === 'parcela');
    if (modo === 'globo') {
        observatorio.activar();
    } else {
        observatorio.desactivar();
        clock.getDelta();
    }
}

function lanzarSimulacionGeo(op) {
    contextoGeo = { ubicacion: op.ubicacion, analisis: op.analisis, ubicacionB: op.ubicacionB || null };
    timelineB = op.timelineB || null;
    aplicarEspecieSeleccionada(op.especieId, op.timeline);
    if (timelineB) {
        especieB = especieActual;
        $('species-b-select').value = especieB.id;
        $('model-b-select').value = $('model-select').value;
        activarAB(true);
    } else if (abModeActive) {
        activarAB(false);
    }
    actualizarBannerGeo();
    $('timeline-edit-status').innerText = `🌍 Línea del tiempo con clima real (${op.ubicacion.periodo || 'NASA POWER'})`;
    cambiarModo('parcela');
    reiniciarSimulacion();
}

$('btn-modo-globo').addEventListener('click', () => cambiarModo('globo'));
$('btn-modo-parcela').addEventListener('click', () => cambiarModo('parcela'));
$('btn-volver-globo').addEventListener('click', () => cambiarModo('globo'));
$('btn-quitar-geo').addEventListener('click', () => {
    contextoGeo = null;
    timelineB = null;
    actualizarBannerGeo();
    if (abModeActive) activarAB(false);
    aplicarEspecieSeleccionada(especieActual.id);
});

const observatorio = iniciarObservatorio({
    obtenerCatalogo: () => catalogoEspecies,
    lanzarSimulacionGeo,
    cambiarModo
});

/* =====================================================================
 *  BUCLE DE ANIMACIÓN DE LA PARCELA
 * ===================================================================== */

const clock = new THREE.Clock();
let windClock = 0;
let ultimoAnioMostrado = 1;
const colorEstres = new THREE.Color(0xcc4422);
const colorMuerto = new THREE.Color(0x4a3219);

function actualizarBarra(idBarra, idTexto, valor, umbralRojo = 40) {
    const bar = $(idBarra);
    $(idTexto).innerText = `${valor}%`;
    bar.style.width = `${Math.min(100, valor)}%`;
    bar.style.background = valor > umbralRojo ? '#e74c3c' : (valor > umbralRojo / 2 ? '#f39c12' : '#2ecc71');
}

function animate() {
    requestAnimationFrame(animate);
    if (modo !== 'parcela') return;
    const delta = Math.min(0.1, clock.getDelta());   // tope: evita saltos (y colores extrapolados) al volver de una pestaña oculta
    windClock += delta;

    if (isGrowing && currentDay < AG.TOTAL_TICKS) {
        currentDay = Math.min(AG.TOTAL_TICKS, currentDay + delta * simSpeed * 2.5);
    }

    const anioCurso = obtenerAnioDesdeTick(currentDay);
    const diasRealesActuales = tickADiasReales(currentDay);
    $('timeline-progress-fill').style.width = `${(currentDay / AG.TOTAL_TICKS) * 100}%`;
    const anioReal = timelineAnios[anioCurso - 1]?.anioReal;
    $('timeline-current-year').innerText = `Día ${diasRealesActuales} / 2555 (${(currentDay / AG.TICKS_POR_ANIO).toFixed(1)} Años)${anioReal ? ` · clima ${anioReal}` : ''}`;

    if (anioCurso !== ultimoAnioMostrado) {
        ultimoAnioMostrado = anioCurso;
        if (anioSeleccionadoParaEdicion === null) cargarSlidersDesdeAnio(anioCurso);
        renderizarNodosTimeline();
    }

    const climaAnio = timelineAnios[anioCurso - 1];
    const luzVal = climaAnio.luz / 100;
    dirLight.intensity = 0.4 + luzVal * 1.8;
    const bg = colorNoche.clone().lerp(colorDia, luzVal);
    scene.background = bg;
    scene.fog.color = bg;
    materialTerreno.color.copy(colorSueloSeco).lerp(colorSueloHumedo, Math.min(1, climaAnio.agua / 80));

    const paramsA = obtenerParamsBaseA();
    estadoA = AG.simularCiclo(paramsA, currentDay);
    sincronizarTimelineConResultado(estadoA);
    estadoB = AG.simularCiclo(obtenerParamsBaseB(paramsA), currentDay);

    todosLosAgaves.forEach((agave, idx) => {
        const esB = (agave.userData.escenario === 'B' && abModeActive);
        const est = esB ? estadoB : estadoA;
        const morf = MORFOLOGIA_ESPECIES[(esB ? especieB : especieActual).id] || MORFOLOGIA_ESPECIES[1];
        const f = est.fraccionVisual;
        const bonoPinaDesquiote = agave.userData.quioteCortado ? 1.12 : 1.0;

        const sPina = Math.min(1.15, Math.max(0.001, f * 1.35)) * morf.porteGeneral * bonoPinaDesquiote;
        const sPencas = Math.min(1, Math.max(0.001, (f - 0.06) * 1.25)) * morf.porteGeneral;
        const sQuiote = (agave.userData.quioteCortado || est.muerta)
            ? 0.0001
            : Math.min(1, Math.max(0.001, (f - 0.62) * 2.65)) * morf.porteGeneral;

        agave.userData.pina.scale.set(sPina * morf.pinaAncho, sPina * morf.pinaAlto, sPina * morf.pinaAncho);
        // Las pencas se marchitan (caen) en proporción al daño acumulado
        const caida = est.muerta ? 0.45 : 1 - est.danio / 250;
        agave.userData.pencasGroup.scale.set(sPencas, sPencas * caida, sPencas);
        agave.userData.quiote.visible = !agave.userData.quioteCortado && !est.muerta;
        agave.userData.quiote.scale.set(sQuiote * morf.quioteAncho, sQuiote * morf.quioteAlto, sQuiote * morf.quioteAncho);

        const colorBaseEspecie = new THREE.Color(morf.colorHoja);
        const targetColor = est.muerta
            ? colorMuerto
            : colorBaseEspecie.lerp(colorEstres, Math.min(1, Math.max(est.estresGlobal / 100, est.danio / 70)));
        agave.userData.materialPencas.color.lerp(targetColor, Math.min(1, delta * 3.0));
        agave.userData.pivotes.forEach((pivote, pIdx) => {
            pivote.rotation.z = est.muerta ? 0 : Math.sin(windClock * 2 + pIdx * 0.2 + idx) * 0.022;
        });
    });

    const tickEntero = Math.floor(currentDay);
    $('kpi-day').innerText = `${diasRealesActuales} d (A${anioCurso})`;
    $('kpi-height').innerText = estadoA.altura;
    $('kpi-biomass').innerText = estadoA.biomasa;
    $('kpi-leaves').innerText = `${estadoA.hojas} / ${estadoA.ramas}`;
    $('kpi-icr').innerText = estadoA.icr;
    $('kpi-harvest').innerText = estadoA.muerta ? '💀 Muerta' : `${estadoA.diasCosecha} d`;

    actualizarBarra('bar-s-water', 'lbl-s-water', estadoA.estresHidrico);
    actualizarBarra('bar-s-temp', 'lbl-s-temp', estadoA.estresTermico);
    actualizarBarra('bar-s-global', 'lbl-s-global', estadoA.estresGlobal);
    actualizarBarra('bar-s-damage', 'lbl-s-damage', estadoA.danio, 30);
    $('lbl-estado').innerText = `${estadoA.estado.etiqueta} · recuperación: ${estadoA.estado.recuperacion}${estadoA.danioPermanente > 0 && !estadoA.muerta ? ` · daño permanente ${estadoA.danioPermanente}%` : ''}`;
    $('lbl-estado').className = `estado-planta estado-${estadoA.estado.id}`;

    if (tickEntero % 5 === 0 && tickEntero !== lastRecordedTick) {
        lastRecordedTick = tickEntero;
        medicionesCorrida.push(medicionDesdeEstado(estadoA, diasRealesActuales));
        agregarPuntoGrafica(tickEntero, estadoA, estadoB);
        growthChart.update();
        evaluarMotorDecisiones(tickEntero);
        renderizarNodosTimeline();
    }

    if (selectedMesh) actualizarPanelRaycaster();
    controls.update();
    renderer.render(scene, camera);
}

cambiarModo('globo');
cargarCatalogoEspecies();
animate();
