import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const API_BASE = window.location.port === '5500'
    ? 'http://localhost/git/practica-05-bioinformatica/api/index.php?route='
    : './api/index.php?route=';

let catalogoEspecies = [
    { id: 1, nombre_cientifico: 'Agave tequilana Weber', nombre_comun: 'Agave Azul (Tequilero)', tasa_r_base: 0.140, capacidad_k_base: 4500, altura_max_m: 3.8, luz_optima: 85, agua_optima: 45, temp_optima: 26, nutrientes_optimos: 75, co2_optimo: 420, dias_madurez: 100, color_hex: '#4a858c' },
    { id: 2, nombre_cientifico: 'Agave angustifolia Haw', nombre_comun: 'Agave Espadín (Mezcalero)', tasa_r_base: 0.165, capacidad_k_base: 5200, altura_max_m: 4.2, luz_optima: 80, agua_optima: 40, temp_optima: 28, nutrientes_optimos: 70, co2_optimo: 415, dias_madurez: 95, color_hex: '#5c9c54' },
    { id: 3, nombre_cientifico: 'Agave salmiana Otto', nombre_comun: 'Maguey Pulquero / Manso', tasa_r_base: 0.120, capacidad_k_base: 6800, altura_max_m: 4.8, luz_optima: 75, agua_optima: 55, temp_optima: 22, nutrientes_optimos: 85, co2_optimo: 430, dias_madurez: 120, color_hex: '#28593a' },
    { id: 4, nombre_cientifico: 'Agave cupreata Trel', nombre_comun: 'Agave Papalote', tasa_r_base: 0.110, capacidad_k_base: 3800, altura_max_m: 3.1, luz_optima: 78, agua_optima: 50, temp_optima: 25, nutrientes_optimos: 80, co2_optimo: 420, dias_madurez: 110, color_hex: '#738c4a' },
    { id: 5, nombre_cientifico: 'Arabidopsis thaliana', nombre_comun: 'Arabidopsis (Modelo Genético)', tasa_r_base: 0.250, capacidad_k_base: 850, altura_max_m: 1.2, luz_optima: 70, agua_optima: 65, temp_optima: 23, nutrientes_optimos: 80, co2_optimo: 400, dias_madurez: 45, color_hex: '#76b843' }
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
        texto: 'Describe un crecimiento sigmoidal (en forma de S) autorregulado. El agave crece lento al inicio (hijuelo), alcanza su velocidad máxima a mitad del ciclo (Año 3-4) y frena gradualmente al acercarse al límite de biomasa K.'
    },
    gompertz: {
        titulo: '📐 Modelo de Gompertz: N(t) = K·exp(−exp(−r(t − t₀)))',
        texto: 'Curva sigmoidal asimétrica ideal para órganos de reserva (piña de agave). Su punto de inflexión ocurre antes del 50% de la biomasa máxima, reflejando una rápida acumulación inicial de tejido seguida de una maduración prolongada.'
    },
    exponencial: {
        titulo: '📐 Modelo Exponencial: N(t) = N₀·e^(r·t)',
        texto: 'Representa multiplicación celular sin restricción ambiental aparente. La biomasa se acelera continuamente a tasa r constante hasta topar de forma abrupta con el techo fisiológico K.'
    },
    lineal: {
        titulo: '📐 Modelo Lineal: N(t) = a·t + b',
        texto: 'Asume una ganancia constante de gramos de biomasa por unidad de tiempo sin importar la edad de la planta. Útil como línea base de control en etapas cortas con clima uniforme.'
    }
};

let especieActual = catalogoEspecies[0];
let especieB = catalogoEspecies[2];
let currentDay = 0;
let lastRecordedTick = -1;
let isGrowing = true;
let simSpeed = 1.5;
let abModeActive = false;

const TOTAL_ANIOS = 7;
const TICKS_POR_ANIO = 20;
const DIAS_REALES_POR_ANIO = 365;
const DIAS_REALES_TOTALES = TOTAL_ANIOS * DIAS_REALES_POR_ANIO; // 2555 días
const FACTOR_DIAS_REALES = DIAS_REALES_TOTALES / 140;

let anioSeleccionadoParaEdicion = null;
let timelineAnios = [];

function tickADiasReales(tick) {
    return Math.round(tick * FACTOR_DIAS_REALES);
}

function inicializarTimelinePorEspecie(esp) {
    const etiquetas = [
        'Establecimiento',
        'Desarrollo Juvenil',
        'Crecimiento Vegetativo',
        'Acumulación Inulina',
        'Cierre de Roseta',
        'Engorda de Piña',
        'Madurez / Quiote'
    ];

    timelineAnios = etiquetas.map((etiqueta, idx) => ({
        anio: idx + 1,
        etiqueta,
        luz: Math.round(esp.luz_optima),
        agua: Math.round(esp.agua_optima),
        temp: +esp.temp_optima.toFixed(1),
        nut: Math.round(esp.nutrientes_optimos),
        co2: Math.round(esp.co2_optimo),
        biomasaGuardada: null,
        estresGuardado: null,
        plantaMuertaEnAnio: false,
        editadoManual: false
    }));

    renderizarNodosTimeline();
}

function obtenerAnioDesdeTick(tick) {
    return Math.min(TOTAL_ANIOS, Math.max(1, Math.floor(tick / TICKS_POR_ANIO) + 1));
}

function renderizarNodosTimeline() {
    const container = document.getElementById('timeline-nodes');
    if (!container) return;

    const anioCurso = obtenerAnioDesdeTick(currentDay);
    container.innerHTML = timelineAnios.map(item => {
        const alcanzado = currentDay >= (item.anio - 1) * TICKS_POR_ANIO;
        const esCurso = item.anio === anioCurso;
        const esSeleccionado = item.anio === anioSeleccionadoParaEdicion;

        const clases = [
            'tl-node',
            alcanzado ? 'reached' : '',
            esCurso ? 'active-year' : '',
            esSeleccionado ? 'selected' : ''
        ].join(' ');

        const diasFinAnio = item.anio * DIAS_REALES_POR_ANIO;
        let resumen = `💧${item.agua}% | 🌡️${item.temp}°`;
        if (item.plantaMuertaEnAnio) {
            resumen = `💀 Muerta (${diasFinAnio}d)`;
        } else if (item.biomasaGuardada !== null) {
            resumen = `${Math.round(item.biomasaGuardada)}g | 💧${item.agua}%`;
        }

        return `
            <div class="${clases}" data-anio="${item.anio}" title="Año ${item.anio} (Día ${diasFinAnio}) - ${item.etiqueta}">
                <div class="tl-line" style="${item.plantaMuertaEnAnio ? 'background:#c0392b;border-color:#ff7675;' : ''}"></div>
                <span class="tl-label">Año ${item.anio}${item.editadoManual ? '*' : ''}</span>
                <span class="tl-sub">${resumen}</span>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.tl-node').forEach(node => {
        node.addEventListener('click', () => seleccionarAnioTimeline(+node.dataset.anio));
    });
}

function cargarSlidersDesdeAnio(anioNum) {
    const datos = timelineAnios[anioNum - 1];
    if (!datos) return;

    document.getElementById('param-luz').value = datos.luz;
    document.getElementById('val-luz').innerText = datos.luz;
    document.getElementById('param-agua').value = datos.agua;
    document.getElementById('val-agua').innerText = datos.agua;
    document.getElementById('param-temp').value = datos.temp;
    document.getElementById('val-temp').innerText = datos.temp;
    document.getElementById('param-nut').value = datos.nut;
    document.getElementById('val-nut').innerText = datos.nut;
    document.getElementById('param-co2').value = datos.co2;
    document.getElementById('val-co2').innerText = datos.co2;
}

function seleccionarAnioTimeline(anioNum) {
    anioSeleccionadoParaEdicion = anioNum;
    cargarSlidersDesdeAnio(anioNum);

    const d = timelineAnios[anioNum - 1];
    const rangoDias = `Día ${(anioNum - 1) * 365} al ${anioNum * 365}`;
    document.getElementById('timeline-edit-status').innerText = `✏️ Editando Año ${anioNum} (${rangoDias})`;
    document.getElementById('tl-detail-text').innerHTML =
        `<b>Año ${anioNum} (${rangoDias}):</b> ☀️ Luz ${d.luz}% | 💧 Agua ${d.agua}% | 🌡️ Temp ${d.temp}°C | 🧪 NPK ${d.nut}% | 🫧 CO₂ ${d.co2} ppm`;
    document.getElementById('btn-tl-live').classList.remove('hidden');

    renderizarNodosTimeline();
}

function guardarSlidersEnAnioActivo() {
    const anioObjetivo = anioSeleccionadoParaEdicion !== null
        ? anioSeleccionadoParaEdicion
        : obtenerAnioDesdeTick(currentDay);

    const nuevoLuz = parseFloat(document.getElementById('param-luz').value);
    const nuevoAgua = parseFloat(document.getElementById('param-agua').value);
    const nuevoTemp = parseFloat(document.getElementById('param-temp').value);
    const nuevoNut = parseFloat(document.getElementById('param-nut').value);
    const nuevoCo2 = parseFloat(document.getElementById('param-co2').value);

    for (let i = anioObjetivo - 1; i < TOTAL_ANIOS; i++) {
        if (i === anioObjetivo - 1 || !timelineAnios[i].editadoManual) {
            timelineAnios[i].luz = nuevoLuz;
            timelineAnios[i].agua = nuevoAgua;
            timelineAnios[i].temp = nuevoTemp;
            timelineAnios[i].nut = nuevoNut;
            timelineAnios[i].co2 = nuevoCo2;
        }
    }
    timelineAnios[anioObjetivo - 1].editadoManual = true;

    const d = timelineAnios[anioObjetivo - 1];
    document.getElementById('tl-detail-text').innerHTML =
        `<b>Año ${anioObjetivo} y posteriores actualizados:</b> ☀️ Luz ${d.luz}% | 💧 Agua ${d.agua}% | 🌡️ Temp ${d.temp}°C | 🧪 NPK ${d.nut}% | 🫧 CO₂ ${d.co2} ppm`;

    recalcularHistorialGrafica();
    renderizarNodosTimeline();
}

function actualizarExplicacionModelo() {
    const modelo = document.getElementById('model-select').value;
    const info = EXPLICACIONES_MODELOS[modelo] || EXPLICACIONES_MODELOS.logistico;
    const titleEl = document.getElementById('model-exp-title');
    const descEl = document.getElementById('model-exp-desc');
    if (titleEl && descEl) {
        titleEl.innerText = info.titulo;
        descEl.innerText = info.texto;
    }
}

let medicionesCorrida = [];
let decisionesCorrida = [];
let ultimaAlertaEmitida = '';

let estadoA = { biomasa: 10, altura: 0.1, hojas: 0, ramas: 1, icr: 0, estresHidrico: 0, estresTermico: 0, estresGlobal: 0, fraccion: 0.001, diasCosecha: 2555, muerta: false };
let estadoB = { biomasa: 10, altura: 0.1, hojas: 0, ramas: 1, icr: 0, estresHidrico: 0, estresTermico: 0, estresGlobal: 0, fraccion: 0.001, muerta: false };

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x87CEEB, 0.008);
const colorDia = new THREE.Color(0x87CEEB);
const colorNoche = new THREE.Color(0x0a1931);
scene.background = colorDia.clone();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const initialCameraPos = new THREE.Vector3(0, 12, 28);
camera.position.copy(initialCameraPos);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.id = 'three-canvas';
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 3, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.03;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(20, 35, 20);
dirLight.castShadow = true;
dirLight.shadow.camera.left = -40;
dirLight.shadow.camera.right = 40;
dirLight.shadow.camera.top = 40;
dirLight.shadow.camera.bottom = -40;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const planoGeo = new THREE.PlaneGeometry(150, 150, 60, 60);
const pos = planoGeo.attributes.position.array;
for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1];
    if (Math.sqrt(x * x + y * y) > 15) {
        pos[i + 2] = Math.sin(x / 12) * Math.cos(y / 12) * 0.8;
    }
}
planoGeo.computeVertexNormals();
const terreno = new THREE.Mesh(planoGeo, new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.95 }));
terreno.rotation.x = -Math.PI / 2;
terreno.receiveShadow = true;
scene.add(terreno);

const plantasEntorno = [];
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
            plantasEntorno.push(arbol);
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
        idAgave: id,
        agaveRef: agaveGroup,
        escenario: escenarioGrupo,
        partType: 'pina',
        name: `Piña / Corazón (Planta #${id} - Esc. ${escenarioGrupo})`,
        type: 'Esfera Escalada',
        biomassShare: 0.55,
        desc: 'Órgano de reserva principal de fructanos e inulina.'
    };
    agaveGroup.add(pina);
    interactableObjects.push(pina);

    const quioteGroup = new THREE.Group();
    quioteGroup.position.y = 0.5;

    const alturaQuiote = 9.5;
    const quioteGeo = new THREE.CylinderGeometry(0.13, 0.26, alturaQuiote, 16);
    quioteGeo.translate(0, alturaQuiote / 2, 0);
    const matQuiote = new THREE.MeshStandardMaterial({ color: 0x6e8f4e });
    const quioteMesh = new THREE.Mesh(quioteGeo, matQuiote);
    quioteMesh.castShadow = true;
    quioteMesh.userData = {
        idAgave: id,
        agaveRef: agaveGroup,
        escenario: escenarioGrupo,
        partType: 'quiote',
        name: `Quiote Floral (Planta #${id} - Esc. ${escenarioGrupo})`,
        type: 'Cilindro Compuesto (9.5m)',
        biomassShare: 0.15,
        desc: 'Inflorescencia reproductiva; si se corta (desquiote), la piña concentra más azúcares.'
    };
    quioteGroup.add(quioteMesh);
    interactableObjects.push(quioteMesh);

    const matFlor = new THREE.MeshStandardMaterial({ color: 0xc5d86d });
    for (let k = 0; k < 5; k++) {
        const ramaFlor = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 10), matFlor);
        const hRama = alturaQuiote - 0.4 - (k * 0.75);
        const ang = k * 1.4;
        ramaFlor.position.set(Math.cos(ang) * 0.38, hRama, Math.sin(ang) * 0.38);
        ramaFlor.scale.set(1.3, 0.45, 1.3);
        ramaFlor.userData = quioteMesh.userData;
        quioteGroup.add(ramaFlor);
        interactableObjects.push(ramaFlor);
    }
    agaveGroup.add(quioteGroup);

    const pencasGroup = new THREE.Group();
    const pivotesArray = [];
    const pencasMallas = [];
    const capas = 5, pencasPorCapa = 12;

    for (let i = 0; i < capas; i++) {
        for (let j = 0; j < pencasPorCapa; j++) {
            const pivote = new THREE.Group();
            const angulo = (j / pencasPorCapa) * Math.PI * 2 + (i % 2) * (Math.PI / pencasPorCapa);
            pivote.rotation.y = angulo;
            pivote.position.y = 0.12 + (i * 0.28);

            const hPenca = 3.4 + (i * 0.2);
            const pencaGeo = new THREE.ConeGeometry(0.38, hPenca, 5);
            pencaGeo.translate(0, hPenca / 2, 0);

            const penca = new THREE.Mesh(pencaGeo, matPencas);
            const inclinacionBase = (Math.PI / 2.2) - (i * 0.22);
            penca.rotation.x = inclinacionBase;
            penca.userData = {
                idAgave: id,
                agaveRef: agaveGroup,
                escenario: escenarioGrupo,
                partType: 'penca',
                inclinacionBase,
                name: `Penca Foliar C${i + 1} (Planta #${id} - Esc. ${escenarioGrupo})`,
                type: 'Cono Modificado',
                biomassShare: 0.30,
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

    agaveGroup.userData.pina = pina;
    agaveGroup.userData.pencasGroup = pencasGroup;
    agaveGroup.userData.quiote = quioteGroup;
    agaveGroup.userData.pivotes = pivotesArray;
    agaveGroup.userData.pencasMallas = pencasMallas;
    todosLosAgaves.push(agaveGroup);
}

let idCounter = 1;
for (let fila = 0; fila < 2; fila++) {
    for (let col = 0; col < 3; col++) {
        const x = (col - 1) * 8.5;
        const z = fila === 0 ? 4.8 : -4.8;
        crearAgave(x, z, idCounter++, fila === 0 ? 'A' : 'B');
    }
}

function aplicarMorfologiaEspecie() {
    todosLosAgaves.forEach(agave => {
        const esB = (agave.userData.escenario === 'B' && abModeActive);
        const espObj = esB ? especieB : especieActual;
        const morf = MORFOLOGIA_ESPECIES[espObj.id] || MORFOLOGIA_ESPECIES[1];

        agave.userData.materialPina.color.setHex(morf.colorPina);
        agave.userData.materialPencas.color.set(morf.colorHoja);

        agave.userData.pencasMallas.forEach(penca => {
            penca.scale.set(morf.pencaAncho, morf.pencaLargo, morf.pencaGrosor);
            penca.rotation.x = penca.userData.inclinacionBase + morf.aperturaRoseta;
        });
    });
}

function simularCrecimientoAcumulado(configBase, diaObjetivo, especieRef, usarTimelineA = true) {
    const opt = especieRef;
    const K = configBase.k;
    const N0 = Math.max(15, K * 0.02);
    let biomasa = N0;
    let plantaMuerta = false;
    let ticksEstresLetal = 0;

    if (usarTimelineA) {
        timelineAnios.forEach(a => { a.plantaMuertaEnAnio = false; });
    }

    const pasos = Math.max(1, Math.floor(diaObjetivo));
    let ultimoEstresH = 0, ultimoEstresT = 0, ultimoEstresG = 0, ultimaREf = configBase.r;

    for (let t = 1; t <= pasos; t++) {
        const anioIdx = Math.min(TOTAL_ANIOS - 1, Math.floor((t - 1) / TICKS_POR_ANIO));
        const climaAnio = (usarTimelineA && timelineAnios[anioIdx]) ? timelineAnios[anioIdx] : configBase;

        const agua = usarTimelineA ? climaAnio.agua : configBase.agua;
        const temp = usarTimelineA ? climaAnio.temp : configBase.temp;
        const luz  = usarTimelineA ? climaAnio.luz  : configBase.luz;
        const nut  = usarTimelineA ? climaAnio.nut  : configBase.nut;
        const co2  = usarTimelineA ? climaAnio.co2  : configBase.co2;

        const estresHidrico = Math.min(100, Math.abs(agua - opt.agua_optima) * 2.2);
        const estresTermico = Math.min(100, Math.abs(temp - opt.temp_optima) * 4.2);
        const estresLuminico = Math.min(100, Math.abs(luz - opt.luz_optima) * 1.6);
        const estresNutricional = Math.min(100, Math.abs(nut - opt.nutrientes_optimos) * 1.5);

        const estresGlobal = Math.min(100,
            (estresHidrico * 0.45) +
            (estresTermico * 0.30) +
            (estresLuminico * 0.15) +
            (estresNutricional * 0.10)
        );

        const condicionLetal = (agua <= 8) || (agua >= 96) || (temp >= 43) || (temp <= 6) || (estresGlobal >= 78);

        if (condicionLetal) {
            ticksEstresLetal++;
            if (ticksEstresLetal >= 3) {
                plantaMuerta = true;
            }
        } else if (!plantaMuerta) {
            ticksEstresLetal = Math.max(0, ticksEstresLetal - 1);
        }

        if (plantaMuerta) {
            biomasa = Math.max(N0 * 0.4, biomasa * 0.96);
            ultimaREf = 0;
            if (usarTimelineA && timelineAnios[anioIdx]) {
                timelineAnios[anioIdx].plantaMuertaEnAnio = true;
            }
        } else if (estresGlobal >= 60) {
            biomasa = Math.max(N0, biomasa * 0.99);
            ultimaREf = 0;
        } else {
            const factorCO2 = 1 + ((co2 - opt.co2_optimo) / 2500);
            const penalizacion = Math.max(0, 1 - (estresGlobal / 65));
            const rEfectiva = Math.max(0, configBase.r * penalizacion * factorCO2);

            let dN = 0;
            if (configBase.modelo === 'lineal') {
                dN = (K * rEfectiva) / 14;
            } else if (configBase.modelo === 'exponencial') {
                dN = (rEfectiva * 0.32) * biomasa;
            } else if (configBase.modelo === 'gompertz') {
                const ratio = Math.max(0.0001, biomasa / K);
                dN = (rEfectiva * 0.48) * biomasa * Math.max(0, -Math.log(ratio));
            } else {
                dN = (rEfectiva * 0.65) * biomasa * Math.max(0, 1 - (biomasa / K));
            }

            biomasa = Math.min(K, biomasa + dN);
            ultimaREf = rEfectiva;
        }

        ultimoEstresH = estresHidrico;
        ultimoEstresT = estresTermico;
        ultimoEstresG = plantaMuerta ? 100 : estresGlobal;

        if (usarTimelineA && t % TICKS_POR_ANIO === 0 && timelineAnios[anioIdx]) {
            timelineAnios[anioIdx].biomasaGuardada = +biomasa.toFixed(1);
            timelineAnios[anioIdx].estresGuardado = +ultimoEstresG.toFixed(1);
        }
    }

    const fraccion = Math.min(1, Math.max(0.001, biomasa / K));
    const altura = +(fraccion * opt.altura_max_m).toFixed(2);
    const hojas = Math.round(fraccion * 60);
    const ramas = (!plantaMuerta && fraccion > 0.62) ? 2 : 1;
    const icr = plantaMuerta ? 0 : +(ultimaREf * (1 - biomasa / K)).toFixed(4);

    const diasRealesTranscurridos = tickADiasReales(diaObjetivo);
    const penalizacionCosecha = Math.max(0.25, 1 - (ultimoEstresG / 130));
    const diasCosecha = plantaMuerta
        ? 0
        : Math.max(0, Math.round((DIAS_REALES_TOTALES / penalizacionCosecha) - diasRealesTranscurridos));

    return {
        biomasa: +biomasa.toFixed(1),
        altura,
        hojas,
        ramas,
        icr: Math.max(0, icr),
        estresHidrico: +ultimoEstresH.toFixed(1),
        estresTermico: +ultimoEstresT.toFixed(1),
        estresGlobal: +ultimoEstresG.toFixed(1),
        fraccion,
        diasCosecha,
        muerta: plantaMuerta
    };
}

const ctxChart = document.getElementById('growthChart').getContext('2d');
const growthChart = new Chart(ctxChart, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Biomasa A (g)', data: [], borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,0.15)', tension: 0.3, fill: true },
            { label: 'Biomasa B (g)', data: [], borderColor: '#f39c12', borderDash: [5, 5], tension: 0.3, hidden: true },
            { label: 'Estrés Global (%)', data: [], borderColor: '#e74c3c', tension: 0.2, yAxisID: 'y1' }
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

function recalcularHistorialGrafica() {
    growthChart.data.labels = [];
    growthChart.data.datasets.forEach(d => d.data = []);
    medicionesCorrida = [];

    const maxTick = Math.floor(currentDay);
    const paramsBaseA = obtenerParamsBaseA();
    const espRefB = abModeActive ? especieB : especieActual;
    const paramsBaseB = obtenerParamsBaseB(paramsBaseA, espRefB);

    for (let t = 0; t <= maxTick; t += 5) {
        const estA = simularCrecimientoAcumulado(paramsBaseA, t, especieActual, true);
        const estB = simularCrecimientoAcumulado(paramsBaseB, t, espRefB, false);
        const anio = obtenerAnioDesdeTick(t);
        const diasReales = tickADiasReales(t);

        medicionesCorrida.push({
            tick_dia: diasReales,
            altura: estA.altura,
            biomasa: estA.biomasa,
            num_hojas: estA.hojas,
            num_ramas: estA.ramas,
            icr: estA.icr,
            estres_hidrico: estA.estresHidrico,
            estres_termico: estA.estresTermico,
            estres_global: estA.estresGlobal
        });

        growthChart.data.labels.push(`A${anio}·${diasReales}d`);
        growthChart.data.datasets[0].data.push(estA.biomasa);
        growthChart.data.datasets[1].data.push(estB.biomasa);
        growthChart.data.datasets[2].data.push(estA.estresGlobal);
    }
    growthChart.update();
}

function evaluarMotorDecisiones(tickDia) {
    const box = document.getElementById('decision-box');
    const txt = document.getElementById('decision-text');
    const winnerTxt = document.getElementById('ab-winner-text');
    const anioCurso = obtenerAnioDesdeTick(tickDia);
    const diasReales = tickADiasReales(tickDia);
    const clima = timelineAnios[anioCurso - 1] || {
        agua: parseFloat(document.getElementById('param-agua').value),
        temp: parseFloat(document.getElementById('param-temp').value),
        nut: parseFloat(document.getElementById('param-nut').value)
    };

    let tipo = 'Óptimo Fisiológico';
    let valor = estadoA.estresGlobal;
    let umbral = 25;
    let recomendacion = `Año ${anioCurso} (Día ${diasReales}): Condiciones estables. Cosecha en ${estadoA.diasCosecha} días.`;
    box.className = 'decision-ok';

    if (estadoA.muerta) {
        box.className = 'decision-danger';
        tipo = 'Muerte Fisiológica';
        valor = 100;
        umbral = 78;
        recomendacion = `💀 PLANTA MUERTA (Punto de Marchitez Permanente alcanzado). El tejido sufrió necrosis irreversible; reinicia o corrige el año donde ocurrió el estrés letal.`;
    } else if (estadoA.estresHidrico > 35) {
        box.className = 'decision-danger';
        if (clima.agua < especieActual.agua_optima) {
            tipo = 'Déficit Hídrico Crítico';
            valor = estadoA.estresHidrico;
            umbral = 35;
            recomendacion = `⚠️ Año ${anioCurso}: Aumentar riego (+${Math.round(especieActual.agua_optima - clima.agua)}% humedad). Si baja de 8% la planta morirá.`;
        } else {
            tipo = 'Exceso de Humedad';
            valor = estadoA.estresHidrico;
            umbral = 35;
            recomendacion = `⚠️ Año ${anioCurso}: Reducir riego por riesgo de pudrición y asfixia radicular en la piña.`;
        }
    } else if (estadoA.estresTermico > 30) {
        box.className = 'decision-warn';
        tipo = 'Alerta Térmica';
        valor = estadoA.estresTermico;
        umbral = 30;
        recomendacion = clima.temp > especieActual.temp_optima
            ? `🌡️ Año ${anioCurso}: Reducir temperatura (${clima.temp}°C vs óptimo ${especieActual.temp_optima}°C).`
            : `🌡️ Año ${anioCurso}: Elevar temperatura para reactivar metabolismo CAM.`;
    } else if (clima.nut < especieActual.nutrientes_optimos - 15) {
        box.className = 'decision-warn';
        tipo = 'Deficiencia Nutricional';
        valor = clima.nut;
        umbral = especieActual.nutrientes_optimos;
        recomendacion = `🧪 Año ${anioCurso}: Aplicar fertirriego NPK hasta ${especieActual.nutrientes_optimos}% para alcanzar capacidad K.`;
    } else if (estadoA.fraccion >= 0.65 && estadoA.fraccion < 0.92) {
        box.className = 'decision-warn';
        tipo = 'Emergencia de Quiote';
        valor = +(estadoA.fraccion * 100).toFixed(1);
        umbral = 65;
        recomendacion = `✂️ Quiote floral emergiendo: selecciona cada planta en 3D y presiona "Cortar Quiote" para concentrar inulina en la piña.`;
    } else if (estadoA.fraccion >= 0.92) {
        box.className = 'decision-ok';
        tipo = 'Madurez de Cosecha';
        valor = +(estadoA.fraccion * 100).toFixed(1);
        umbral = 92;
        recomendacion = `✅ Año 7 completado (>92% K). Programar jima de la piña.`;
    }

    txt.innerText = recomendacion;

    if (abModeActive) {
        winnerTxt.classList.remove('hidden');
        const diff = (estadoA.biomasa - estadoB.biomasa).toFixed(1);
        if (estadoA.biomasa >= estadoB.biomasa) {
            winnerTxt.innerText = `🏆 Ganador A/B: Esc. A (${especieActual.nombre_comun}) con +${diff}g biomasa | Estrés ${estadoA.estresGlobal}% vs ${estadoB.estresGlobal}%`;
        } else {
            winnerTxt.innerText = `🏆 Ganador A/B: Esc. B (${especieB.nombre_comun}) con +${Math.abs(diff)}g biomasa | Estrés ${estadoB.estresGlobal}% vs ${estadoA.estresGlobal}%`;
        }
    } else {
        winnerTxt.classList.add('hidden');
    }

    if (tipo !== ultimaAlertaEmitida && tickDia > 0) {
        ultimaAlertaEmitida = tipo;
        decisionesCorrida.push({
            tick_dia: diasReales,
            tipo_alerta: tipo,
            indicador_valor: valor,
            umbral,
            recomendacion
        });
    }
}

async function cargarCatalogoEspecies() {
    const statusBadge = document.getElementById('db-status');
    const selectA = document.getElementById('species-select');
    const selectB = document.getElementById('species-b-select');
    try {
        const res = await fetch(`${API_BASE}/especies`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            catalogoEspecies = data.map(e => ({
                ...e,
                id: +e.id,
                tasa_r_base: +e.tasa_r_base,
                capacidad_k_base: +e.capacidad_k_base,
                altura_max_m: +e.altura_max_m,
                luz_optima: +e.luz_optima,
                agua_optima: +e.agua_optima,
                temp_optima: +e.temp_optima,
                nutrientes_optimos: +e.nutrientes_optimos,
                co2_optimo: +e.co2_optimo,
                dias_madurez: +e.dias_madurez
            }));
            statusBadge.innerText = 'MySQL Conectado';
            statusBadge.className = 'badge badge-ok';
        }
    } catch (err) {
        statusBadge.innerText = 'Modo Local (XAMPP)';
        statusBadge.className = 'badge badge-warn';
    }

    const opcionesHTML = catalogoEspecies.map(e =>
        `<option value="${e.id}">${e.nombre_comun} (${e.nombre_cientifico})</option>`
    ).join('');

    selectA.innerHTML = opcionesHTML;
    if (selectB) {
        selectB.innerHTML = opcionesHTML;
        const defaultB = catalogoEspecies[2] || catalogoEspecies[1] || catalogoEspecies[0];
        especieB = defaultB;
        selectB.value = defaultB.id;
    }

    aplicarEspecieSeleccionada(catalogoEspecies[0].id);
}

function aplicarEspecieSeleccionada(id) {
    const esp = catalogoEspecies.find(e => e.id === +id) || catalogoEspecies[0];
    especieActual = esp;

    document.getElementById('param-r').value = esp.tasa_r_base;
    document.getElementById('val-r').innerText = esp.tasa_r_base;
    document.getElementById('param-k').value = esp.capacidad_k_base;
    document.getElementById('val-k').innerText = esp.capacidad_k_base;

    inicializarTimelinePorEspecie(esp);
    cargarSlidersDesdeAnio(1);
    aplicarMorfologiaEspecie();
    actualizarExplicacionModelo();
    reiniciarSimulacion();
}

async function guardarSimulacionEnMySQL() {
    const nombre = document.getElementById('sim-name').value.trim() || `Simulación 7 Años ${especieActual.nombre_comun}`;
    const resumenClima = timelineAnios.map(a => `A${a.anio}(💧${a.agua}%,🌡️${a.temp}°)`).join(' ');
    const notasUsuario = document.getElementById('sim-notes').value.trim();

    const payload = {
        nombre,
        especie_id: especieActual.id,
        modelo_matematico: document.getElementById('model-select').value,
        tasa_r: parseFloat(document.getElementById('param-r').value),
        capacidad_k: parseFloat(document.getElementById('param-k').value),
        luz: parseFloat(document.getElementById('param-luz').value),
        agua: parseFloat(document.getElementById('param-agua').value),
        temperatura: parseFloat(document.getElementById('param-temp').value),
        nutrientes: parseFloat(document.getElementById('param-nut').value),
        co2: parseFloat(document.getElementById('param-co2').value),
        biomasa_final: estadoA.biomasa,
        altura_final: estadoA.altura,
        estres_promedio: estadoA.estresGlobal,
        icr_promedio: estadoA.icr,
        dias_simulados: Math.max(1, tickADiasReales(currentDay)),
        dias_estimados_cosecha: estadoA.diasCosecha + tickADiasReales(currentDay),
        es_escenario_ab: abModeActive ? 1 : 0,
        notas: `${notasUsuario} | Clima 7 Años: ${resumenClima}`,
        mediciones: medicionesCorrida,
        decisiones: decisionesCorrida
    };

    try {
        const res = await fetch(`${API_BASE}/simulaciones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al guardar');
        alert(`✅ Simulación guardada en MySQL con ID #${data.id}`);
        document.getElementById('save-modal').classList.add('hidden');
    } catch (err) {
        alert(`⚠️ Error al guardar en MySQL: ${err.message}`);
    }
}

async function abrirModalReportes() {
    document.getElementById('reports-modal').classList.remove('hidden');
    try {
        const [resRep, resHist] = await Promise.all([
            fetch(`${API_BASE}/reportes`),
            fetch(`${API_BASE}/simulaciones`)
        ]);
        const rep = await resRep.json();
        const hist = await resHist.json();

        if (rep.resumen_global) {
            document.getElementById('report-kpis').innerHTML = `
                <div class="kpi-card" style="flex:1"><span class="kpi-label">Total Corridas en MySQL</span><strong>${rep.resumen_global.total_simulaciones}</strong></div>
                <div class="kpi-card" style="flex:1"><span class="kpi-label">Récord Biomasa</span><strong>${rep.resumen_global.record_biomasa} g</strong></div>
                <div class="kpi-card" style="flex:1"><span class="kpi-label">Tiempo Promedio Madurez</span><strong>${rep.resumen_global.promedio_madurez_global} días</strong></div>
            `;
        }

        document.querySelector('#table-top5 tbody').innerHTML = (rep.top5_biomasa || []).map(r => `
            <tr>
                <td>#${r.id}</td>
                <td>${r.nombre}</td>
                <td>${r.nombre_comun}</td>
                <td>${r.modelo_matematico}</td>
                <td><b>${r.biomasa_final} g</b></td>
                <td>${r.altura_final} m</td>
                <td>${r.estres_promedio}%</td>
            </tr>
        `).join('');

        document.querySelector('#table-efficiency tbody').innerHTML = (rep.eficiencia_especies || []).map((e, idx) => `
            <tr>
                <td>${idx === 0 ? '🏆 ' : ''}${e.nombre_comun}</td>
                <td>${e.total_corridas}</td>
                <td>${e.biomasa_promedio} g</td>
                <td><b>${e.eficiencia_diaria} g/día</b></td>
                <td>${e.tiempo_promedio_madurez} días</td>
            </tr>
        `).join('');

        document.querySelector('#table-history tbody').innerHTML = (hist || []).map(s => `
            <tr>
                <td>${(s.fecha_creacion || '').slice(0, 10)}</td>
                <td>${s.nombre}</td>
                <td>${s.nombre_comun}</td>
                <td>${s.modelo_matematico}</td>
                <td>${s.biomasa_final} g</td>
                <td><button class="btn-load-sim" data-id="${s.id}" style="padding:4px 8px;">🔄 Cargar</button></td>
            </tr>
        `).join('');

        document.querySelectorAll('.btn-load-sim').forEach(btn => {
            btn.addEventListener('click', () => cargarSimulacionHistorica(btn.dataset.id));
        });
    } catch (err) {
        document.getElementById('report-kpis').innerHTML = `<p style="color:#f39c12">Verifica que Apache y MySQL estén activos en XAMPP.</p>`;
    }
}

async function cargarSimulacionHistorica(id) {
    try {
        const res = await fetch(`${API_BASE}/simulaciones/${id}`);
        const sim = await res.json();
        document.getElementById('species-select').value = sim.especie_id;
        aplicarEspecieSeleccionada(sim.especie_id);

        document.getElementById('model-select').value = sim.modelo_matematico;
        actualizarExplicacionModelo();

        document.getElementById('param-r').value = sim.tasa_r;
        document.getElementById('val-r').innerText = sim.tasa_r;
        document.getElementById('param-k').value = sim.capacidad_k;
        document.getElementById('val-k').innerText = sim.capacidad_k;

        document.getElementById('reports-modal').classList.add('hidden');
        reiniciarSimulacion();
    } catch (e) {
        console.error(e);
    }
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedMesh = null;
let selectedAgaveGroup = null;
let originalEmissive = new THREE.Color(0x000000);

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

    document.getElementById('info-name').innerText = data.name;
    document.getElementById('info-species').innerText = `${espInfo.nombre_comun} (${espInfo.nombre_cientifico})`;
    document.getElementById('info-type').innerText = data.type;
    document.getElementById('info-growth').innerText = est.muerta ? '0 (Muerta)' : Math.round(est.fraccion * 100);
    document.getElementById('info-stress').innerText = est.estresGlobal;

    const aporteGramos = (biomasaEfectivaPlanta * data.biomassShare).toFixed(1);
    document.getElementById('info-biomass-part').innerText = aporteGramos;
    document.getElementById('info-biomass-pct').innerText = Math.round(data.biomassShare * 100);
    document.getElementById('info-desc').innerText = data.desc;

    const statusQuioteEl = document.getElementById('info-quiote-status');
    const btnCut = document.getElementById('btn-cut-quiote');
    const quioteYaEmergio = est.fraccion > 0.62 && !est.muerta;

    if (statusQuioteEl && btnCut && agave) {
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
}

const btnCutQuiote = document.getElementById('btn-cut-quiote');
if (btnCutQuiote) {
    btnCutQuiote.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!selectedAgaveGroup) return;
        selectedAgaveGroup.userData.quioteCortado = true;
        selectedAgaveGroup.userData.quiote.scale.set(0.0001, 0.0001, 0.0001);
        selectedAgaveGroup.userData.quiote.visible = false;
        actualizarPanelRaycaster();
    });
}

window.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#controls-panel') || event.target.closest('#analytics-panel') || event.target.closest('#timeline-bar') || event.target.closest('#info-panel') || event.target.closest('.modal-overlay')) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, false);

    if (intersects.length > 0) {
        if (selectedMesh && selectedMesh.material) selectedMesh.material.emissive.copy(originalEmissive);
        selectedMesh = intersects[0].object;
        if (selectedMesh.material) {
            originalEmissive.copy(selectedMesh.material.emissive);
            selectedMesh.material.emissive.setHex(0x444444);
        }
        actualizarPanelRaycaster();
        document.getElementById('info-panel').classList.remove('hidden');
    } else {
        if (selectedMesh && selectedMesh.material) selectedMesh.material.emissive.copy(originalEmissive);
        selectedMesh = null;
        selectedAgaveGroup = null;
        document.getElementById('info-panel').classList.add('hidden');
    }
});

function bindSlider(id, labelId, esClimaTimeline = false) {
    const el = document.getElementById(id);
    const lbl = document.getElementById(labelId);
    el.addEventListener('input', () => {
        lbl.innerText = el.value;
        if (esClimaTimeline) {
            guardarSlidersEnAnioActivo();
        } else {
            recalcularHistorialGrafica();
        }
    });
}

bindSlider('param-r', 'val-r', false);
bindSlider('param-k', 'val-k', false);
bindSlider('param-luz', 'val-luz', true);
bindSlider('param-agua', 'val-agua', true);
bindSlider('param-temp', 'val-temp', true);
bindSlider('param-nut', 'val-nut', true);
bindSlider('param-co2', 'val-co2', true);
bindSlider('param-agua-b', 'val-agua-b', false);
bindSlider('param-temp-b', 'val-temp-b', false);

document.getElementById('growth-speed').addEventListener('input', (e) => {
    simSpeed = parseFloat(e.target.value);
    document.getElementById('val-speed').innerText = simSpeed;
});

document.getElementById('species-select').addEventListener('change', (e) => {
    aplicarEspecieSeleccionada(e.target.value);
});

document.getElementById('model-select').addEventListener('change', () => {
    actualizarExplicacionModelo();
    recalcularHistorialGrafica();
});

const selectBElement = document.getElementById('species-b-select');
if (selectBElement) {
    selectBElement.addEventListener('change', (e) => {
        especieB = catalogoEspecies.find(esp => esp.id === +e.target.value) || catalogoEspecies[0];
        aplicarMorfologiaEspecie();
        recalcularHistorialGrafica();
    });
}

document.getElementById('model-b-select').addEventListener('change', recalcularHistorialGrafica);

document.getElementById('toggle-ab').addEventListener('change', (e) => {
    abModeActive = e.target.checked;
    document.getElementById('ab-controls').classList.toggle('hidden', !abModeActive);
    growthChart.data.datasets[1].hidden = !abModeActive;
    aplicarMorfologiaEspecie();
    recalcularHistorialGrafica();
});

const btnLive = document.getElementById('btn-tl-live');
if (btnLive) {
    btnLive.addEventListener('click', () => {
        anioSeleccionadoParaEdicion = null;
        btnLive.classList.add('hidden');
        document.getElementById('timeline-edit-status').innerText = '💡 Haz clic en una línea anual para editar o ver su clima guardado';
        document.getElementById('tl-detail-text').innerText = 'Modo en vivo: los sliders muestran automáticamente el clima del año en curso.';
        cargarSlidersDesdeAnio(obtenerAnioDesdeTick(currentDay));
        renderizarNodosTimeline();
    });
}

document.getElementById('btn-pause-growth').addEventListener('click', (e) => {
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
    timelineAnios.forEach(a => {
        a.biomasaGuardada = null;
        a.estresGuardado = null;
        a.plantaMuertaEnAnio = false;
    });
    todosLosAgaves.forEach(agave => {
        agave.userData.quioteCortado = false;
        agave.userData.quiote.visible = true;
    });
    growthChart.data.labels = [];
    growthChart.data.datasets.forEach(d => d.data = []);
    growthChart.update();
    isGrowing = true;
    document.getElementById('btn-pause-growth').innerText = '⏸️ Pausar';
    renderizarNodosTimeline();
}

document.getElementById('btn-restart').addEventListener('click', reiniciarSimulacion);
document.getElementById('btn-camera').addEventListener('click', () => {
    camera.position.copy(initialCameraPos);
    controls.target.set(0, 3, 0);
});

document.getElementById('btn-save-sim').addEventListener('click', () => document.getElementById('save-modal').classList.remove('hidden'));
document.getElementById('btn-close-save').addEventListener('click', () => document.getElementById('save-modal').classList.add('hidden'));
document.getElementById('btn-confirm-save').addEventListener('click', guardarSimulacionEnMySQL);

document.getElementById('btn-reports').addEventListener('click', abrirModalReportes);
document.getElementById('btn-close-reports').addEventListener('click', () => document.getElementById('reports-modal').classList.add('hidden'));

document.getElementById('btn-qa').addEventListener('click', () => document.getElementById('qa-modal').classList.remove('hidden'));
document.getElementById('btn-close-qa').addEventListener('click', () => document.getElementById('qa-modal').classList.add('hidden'));

document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (medicionesCorrida.length === 0) {
        alert('Deja correr la simulación unos segundos para acumular datos antes de exportar.');
        return;
    }
    const headers = 'Anio,Dia_Real,Altura_m,Biomasa_g,Num_Hojas,ICR,Estres_Hidrico,Estres_Termico,Estres_Global\n';
    const rows = medicionesCorrida.map(m =>
        `${Math.min(7, Math.floor(m.tick_dia / 365) + 1)},${m.tick_dia},${m.altura},${m.biomasa},${m.num_hojas},${m.icr},${m.estres_hidrico},${m.estres_termico},${m.estres_global}`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_7anios_${especieActual.nombre_comun.replace(/\s+/g, '_')}.csv`;
    a.click();
});

document.getElementById('btn-export-pdf').addEventListener('click', () => {
    window.print();
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let windClock = 0;
let ultimoAnioMostrado = 1;
const colorEstres = new THREE.Color(0xcc4422);
const colorMuerto = new THREE.Color(0x4a3219);

function obtenerParamsBaseA() {
    return {
        modelo: document.getElementById('model-select').value,
        r: parseFloat(document.getElementById('param-r').value),
        k: parseFloat(document.getElementById('param-k').value),
        luz: parseFloat(document.getElementById('param-luz').value),
        agua: parseFloat(document.getElementById('param-agua').value),
        temp: parseFloat(document.getElementById('param-temp').value),
        nut: parseFloat(document.getElementById('param-nut').value),
        co2: parseFloat(document.getElementById('param-co2').value)
    };
}

function obtenerParamsBaseB(paramsA, espReferenciaB) {
    return {
        ...paramsA,
        r: (abModeActive && espReferenciaB.id !== especieActual.id) ? espReferenciaB.tasa_r_base : paramsA.r,
        k: (abModeActive && espReferenciaB.id !== especieActual.id) ? espReferenciaB.capacidad_k_base : paramsA.k,
        modelo: abModeActive ? document.getElementById('model-b-select').value : paramsA.modelo,
        agua: abModeActive ? parseFloat(document.getElementById('param-agua-b').value) : paramsA.agua,
        temp: abModeActive ? parseFloat(document.getElementById('param-temp-b').value) : paramsA.temp
    };
}

function actualizarBarraEstres(idBarra, idTexto, valor) {
    const bar = document.getElementById(idBarra);
    document.getElementById(idTexto).innerText = `${valor}%`;
    bar.style.width = `${valor}%`;
    bar.style.background = valor > 40 ? '#e74c3c' : (valor > 20 ? '#f39c12' : '#2ecc71');
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    windClock += delta;

    if (isGrowing && currentDay < 140) {
        currentDay = Math.min(140, currentDay + delta * simSpeed * 2.5);
    }

    const anioCurso = obtenerAnioDesdeTick(currentDay);
    const diasRealesActuales = tickADiasReales(currentDay);
    const pctTimeline = (currentDay / 140) * 100;
    const fillBar = document.getElementById('timeline-progress-fill');
    if (fillBar) fillBar.style.width = `${pctTimeline}%`;

    const badgeAnio = document.getElementById('timeline-current-year');
    if (badgeAnio) {
        const aniosDecimales = (currentDay / TICKS_POR_ANIO).toFixed(1);
        badgeAnio.innerText = `Día ${diasRealesActuales} / 2555 (${aniosDecimales} Años)`;
    }

    if (anioCurso !== ultimoAnioMostrado) {
        ultimoAnioMostrado = anioCurso;
        if (anioSeleccionadoParaEdicion === null) {
            cargarSlidersDesdeAnio(anioCurso);
        }
        renderizarNodosTimeline();
    }

    const luzVal = parseFloat(document.getElementById('param-luz').value) / 100;
    dirLight.intensity = 0.4 + luzVal * 1.8;
    const bg = colorNoche.clone().lerp(colorDia, luzVal);
    scene.background = bg;
    scene.fog.color = bg;

    const paramsA = obtenerParamsBaseA();
    estadoA = simularCrecimientoAcumulado(paramsA, currentDay, especieActual, true);

    const espReferenciaB = abModeActive ? especieB : especieActual;
    const paramsB = obtenerParamsBaseB(paramsA, espReferenciaB);
    estadoB = simularCrecimientoAcumulado(paramsB, currentDay, espReferenciaB, false);

    todosLosAgaves.forEach((agave, idx) => {
        const esB = (agave.userData.escenario === 'B' && abModeActive);
        const est = esB ? estadoB : estadoA;
        const espAgave = esB ? especieB : especieActual;
        const morf = MORFOLOGIA_ESPECIES[espAgave.id] || MORFOLOGIA_ESPECIES[1];
        const f = est.fraccion;

        const bonoPinaDesquiote = agave.userData.quioteCortado ? 1.12 : 1.0;

        const sPina = Math.min(1.15, Math.max(0.001, f * 1.35)) * morf.porteGeneral * bonoPinaDesquiote;
        const sPencas = Math.min(1, Math.max(0.001, (f - 0.06) * 1.25)) * morf.porteGeneral;
        const sQuiote = (agave.userData.quioteCortado || est.muerta)
            ? 0.0001
            : Math.min(1, Math.max(0.001, (f - 0.62) * 2.65)) * morf.porteGeneral;

        agave.userData.pina.scale.set(
            sPina * morf.pinaAncho,
            sPina * morf.pinaAlto,
            sPina * morf.pinaAncho
        );
        agave.userData.pencasGroup.scale.set(sPencas, est.muerta ? sPencas * 0.55 : sPencas, sPencas);
        agave.userData.quiote.visible = !agave.userData.quioteCortado && !est.muerta;
        agave.userData.quiote.scale.set(
            sQuiote * morf.quioteAncho,
            sQuiote * morf.quioteAlto,
            sQuiote * morf.quioteAncho
        );

        const colorBaseEspecie = new THREE.Color(morf.colorHoja);
        const targetColor = est.muerta
            ? colorMuerto
            : colorBaseEspecie.lerp(colorEstres, Math.min(1, est.estresGlobal / 75));
        agave.userData.materialPencas.color.lerp(targetColor, delta * 3.0);

        agave.userData.pivotes.forEach((pivote, pIdx) => {
            pivote.rotation.z = est.muerta ? 0 : Math.sin(windClock * 2 + pIdx * 0.2 + idx) * 0.022;
        });
    });

    const tickEntero = Math.floor(currentDay);
    document.getElementById('kpi-day').innerText = `${diasRealesActuales} d (A${anioCurso})`;
    document.getElementById('kpi-height').innerText = estadoA.altura;
    document.getElementById('kpi-biomass').innerText = estadoA.biomasa;
    document.getElementById('kpi-leaves').innerText = `${estadoA.hojas} / ${estadoA.ramas}`;
    document.getElementById('kpi-icr').innerText = estadoA.icr;
    document.getElementById('kpi-harvest').innerText = estadoA.muerta ? '💀 Muerta' : `${estadoA.diasCosecha} d`;

    actualizarBarraEstres('bar-s-water', 'lbl-s-water', estadoA.estresHidrico);
    actualizarBarraEstres('bar-s-temp', 'lbl-s-temp', estadoA.estresTermico);
    actualizarBarraEstres('bar-s-global', 'lbl-s-global', estadoA.estresGlobal);

    if (tickEntero % 5 === 0 && tickEntero !== lastRecordedTick) {
        lastRecordedTick = tickEntero;
        medicionesCorrida.push({
            tick_dia: diasRealesActuales,
            altura: estadoA.altura,
            biomasa: estadoA.biomasa,
            num_hojas: estadoA.hojas,
            num_ramas: estadoA.ramas,
            icr: estadoA.icr,
            estres_hidrico: estadoA.estresHidrico,
            estres_termico: estadoA.estresTermico,
            estres_global: estadoA.estresGlobal
        });

        growthChart.data.labels.push(`A${anioCurso}·${diasRealesActuales}d`);
        growthChart.data.datasets[0].data.push(estadoA.biomasa);
        growthChart.data.datasets[1].data.push(estadoB.biomasa);
        growthChart.data.datasets[2].data.push(estadoA.estresGlobal);
        growthChart.update();

        evaluarMotorDecisiones(tickEntero);
        renderizarNodosTimeline();
    }

    if (selectedMesh) actualizarPanelRaycaster();

    controls.update();
    renderer.render(scene, camera);
}

cargarCatalogoEspecies();
animate();