/**
 * Globo terráqueo 3D construido desde cero con Three.js.
 *
 * Proyección: la textura de la Tierra es equirectangular (lon -180..180 → u 0..1, lat 90..-90 → v 0..1),
 * la misma parametrización que usa THREE.SphereGeometry. Por eso un punto (lat, lon) se ubica con:
 *   φ = (90 − lat)·π/180   (ángulo polar desde el polo norte)
 *   θ = (lon + 180)·π/180  (ángulo azimutal)
 *   x = −R·sen φ·cos θ,  y = R·cos φ,  z = R·sen φ·sen θ
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export const RADIO = 100;
const TEXTURA_TIERRA = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg';
const TEXTURA_RELIEVE = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png';

export function latLonAVector3(lat, lon, altura = 0) {
    const r = RADIO + altura;
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
    );
}

/** Inversa de la proyección: punto 3D sobre la esfera → { lat, lon }. */
export function vector3ALatLon(v) {
    const r = v.length();
    const lat = 90 - Math.acos(THREE.MathUtils.clamp(v.y / r, -1, 1)) * 180 / Math.PI;
    let lon = Math.atan2(v.z, -v.x) * 180 / Math.PI - 180;
    if (lon < -180) lon += 360;
    return { lat, lon };
}

export class Globo {
    constructor(contenedor, callbacks = {}) {
        this.contenedor = contenedor;
        this.cb = callbacks;
        this.activo = false;
        this.animaciones = [];
        this.reloj = new THREE.Clock();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x02060f);

        this.camera = new THREE.PerspectiveCamera(45, contenedor.clientWidth / contenedor.clientHeight, 1, 5000);
        this.camera.position.copy(latLonAVector3(18, -95, 230));

        this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(contenedor.clientWidth, contenedor.clientHeight);
        contenedor.appendChild(this.renderer.domElement);

        this.etiquetas = new CSS2DRenderer();
        this.etiquetas.setSize(contenedor.clientWidth, contenedor.clientHeight);
        this.etiquetas.domElement.className = 'globo-etiquetas';
        contenedor.appendChild(this.etiquetas.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.enablePan = false;
        this.controls.minDistance = RADIO + 12;
        this.controls.maxDistance = RADIO * 6;
        this.controls.rotateSpeed = 0.45;
        this.controls.zoomSpeed = 0.7;

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const sol = new THREE.DirectionalLight(0xffffff, 1.25);
        sol.position.set(-1.5, 1, 2);
        this.camera.add(sol);           // luz solidaria a la cámara: el hemisferio visible siempre está iluminado
        this.scene.add(this.camera);

        this.crearTierra();
        this.crearAtmosfera();
        this.crearEstrellas();
        this.crearReticula();

        this.grupos = {
            referencias: new THREE.Group(),
            guardados: new THREE.Group(),
            ab: new THREE.Group(),
            seleccion: new THREE.Group()
        };
        Object.values(this.grupos).forEach(g => this.scene.add(g));
        this.ocurrencias = null;
        this.marcadoresClic = [];

        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 1.4;
        this.puntero = new THREE.Vector2();
        this.registrarEventos();
        window.addEventListener('resize', () => this.redimensionar());
    }

    crearTierra() {
        const cargador = new THREE.TextureLoader();
        cargador.setCrossOrigin('anonymous');
        const material = new THREE.MeshPhongMaterial({ color: 0x2a5d8f, shininess: 12, specular: new THREE.Color(0x222222) });
        cargador.load(TEXTURA_TIERRA, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
            material.map = tex;
            material.color.set(0xffffff);
            material.needsUpdate = true;
        });
        cargador.load(TEXTURA_RELIEVE, (tex) => {
            material.bumpMap = tex;
            material.bumpScale = 0.9;
            material.needsUpdate = true;
        });
        this.tierra = new THREE.Mesh(new THREE.SphereGeometry(RADIO, 128, 96), material);
        this.tierra.name = 'tierra';
        this.scene.add(this.tierra);

        this.materialDensidad = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.95 });
        this.densidad = new THREE.Mesh(new THREE.SphereGeometry(RADIO + 0.25, 128, 96), this.materialDensidad);
        this.densidad.visible = false;
        this.scene.add(this.densidad);
    }

    crearAtmosfera() {
        const material = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: `
                varying vec3 vNormal;
                void main() {
                    float intensidad = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2);
                    gl_FragColor = vec4(0.32, 0.62, 1.0, 1.0) * intensidad;
                }`,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false
        });
        this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(RADIO * 1.13, 64, 48), material));
    }

    crearEstrellas() {
        const n = 2500, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const v = new THREE.Vector3().randomDirection().multiplyScalar(1600 + Math.random() * 800);
            pos.set([v.x, v.y, v.z], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.7 })));
    }

    crearReticula() {
        const puntos = [];
        const paso = 2;
        for (let lat = -60; lat <= 60; lat += 30) {
            for (let lon = -180; lon < 180; lon += paso) {
                puntos.push(latLonAVector3(lat, lon, 0.15), latLonAVector3(lat, lon + paso, 0.15));
            }
        }
        for (let lon = -180; lon < 180; lon += 30) {
            for (let lat = -90; lat < 90; lat += paso) {
                puntos.push(latLonAVector3(lat, lon, 0.15), latLonAVector3(lat + paso, lon, 0.15));
            }
        }
        const geo = new THREE.BufferGeometry().setFromPoints(puntos);
        this.reticula = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.18 }));
        this.scene.add(this.reticula);
    }

    /* ---------------- Marcadores ---------------- */

    crearPin(lat, lon, color, escala = 1, datos = {}) {
        const grupo = new THREE.Group();
        const normal = latLonAVector3(lat, lon).normalize();
        const alto = 5 * escala;
        const mat = new THREE.MeshPhongMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.35) });
        const tallo = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * escala, 0.18 * escala, alto, 6), mat);
        tallo.position.y = alto / 2;
        const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.9 * escala, 14, 10), mat);
        cabeza.position.y = alto;
        grupo.add(tallo, cabeza);
        grupo.position.copy(latLonAVector3(lat, lon, 0));
        grupo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        [tallo, cabeza].forEach(m => { m.userData = { ...datos, lat, lon }; this.marcadoresClic.push(m); });
        grupo.userData = { normal, lat, lon };
        return grupo;
    }

    crearEtiqueta(texto, clase, grupo, alto) {
        const div = document.createElement('div');
        div.className = `globo-etiqueta ${clase}`;
        div.textContent = texto;
        const obj = new CSS2DObject(div);
        obj.position.set(0, alto, 0);
        grupo.add(obj);
        grupo.userData.etiqueta = obj;
        return obj;
    }

    limpiarGrupo(grupo) {
        grupo.traverse(o => {
            const i = this.marcadoresClic.indexOf(o);
            if (i >= 0) this.marcadoresClic.splice(i, 1);
            if (o.isCSS2DObject) o.element.remove();
        });
        grupo.clear();
    }

    setReferencias(ubicaciones) {
        this.limpiarGrupo(this.grupos.referencias);
        ubicaciones.forEach(u => {
            const pin = this.crearPin(+u.latitud, +u.longitud, 0x38bdf8, 0.85, { tipo: 'referencia', ubicacion: u });
            this.crearEtiqueta(u.nombre, 'ref', pin, 6.2);
            this.grupos.referencias.add(pin);
        });
    }

    setGuardados(analisis, colorPorIdoneidad) {
        this.limpiarGrupo(this.grupos.guardados);
        analisis.forEach(a => {
            const pin = this.crearPin(+a.latitud, +a.longitud, colorPorIdoneidad(+a.idoneidad), 0.7, { tipo: 'guardado', analisis: a });
            this.grupos.guardados.add(pin);
        });
    }

    setSeleccion(lat, lon) {
        this.limpiarGrupo(this.grupos.seleccion);
        const normal = latLonAVector3(lat, lon).normalize();
        const anillo = new THREE.Mesh(
            new THREE.RingGeometry(1.4, 2.0, 40),
            new THREE.MeshBasicMaterial({ color: 0xf1c40f, side: THREE.DoubleSide, transparent: true, depthWrite: false })
        );
        anillo.position.copy(latLonAVector3(lat, lon, 0.4));
        anillo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        anillo.userData.pulso = true;
        this.grupos.seleccion.add(anillo);
        const pin = this.crearPin(lat, lon, 0xf1c40f, 1.1, { tipo: 'seleccion' });
        this.grupos.seleccion.add(pin);
    }

    /** Marcadores A/B y arco de círculo máximo elevado entre ellos. */
    setAB(a, b) {
        this.limpiarGrupo(this.grupos.ab);
        if (a) {
            const pin = this.crearPin(a.lat, a.lon, 0x3498db, 1.25, { tipo: 'ab', slot: 'A' });
            this.crearEtiqueta(`A · ${a.nombre}`, 'slot-a', pin, 8);
            this.grupos.ab.add(pin);
        }
        if (b) {
            const pin = this.crearPin(b.lat, b.lon, 0xe67e22, 1.25, { tipo: 'ab', slot: 'B' });
            this.crearEtiqueta(`B · ${b.nombre}`, 'slot-b', pin, 8);
            this.grupos.ab.add(pin);
        }
        if (a && b) {
            const va = latLonAVector3(a.lat, a.lon).normalize();
            const vb = latLonAVector3(b.lat, b.lon).normalize();
            const angulo = va.angleTo(vb);
            const elevacion = Math.max(4, RADIO * 0.45 * angulo / Math.PI);
            const puntos = [];
            for (let i = 0; i <= 64; i++) {
                const t = i / 64;
                const v = new THREE.Vector3().copy(va).lerp(vb, t).normalize();   // nlerp ≈ slerp para dibujar
                puntos.push(v.multiplyScalar(RADIO + 0.5 + Math.sin(Math.PI * t) * elevacion));
            }
            const curva = new THREE.CatmullRomCurve3(puntos);
            const arco = new THREE.Mesh(
                new THREE.TubeGeometry(curva, 96, 0.35, 8, false),
                new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.85 })
            );
            this.grupos.ab.add(arco);

            const viajero = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            viajero.userData.curva = curva;
            this.grupos.ab.add(viajero);
        }
    }

    /** Ocurrencias GBIF como nube de puntos (un solo draw call aunque sean miles). */
    setOcurrencias(puntos, colorHex) {
        if (this.ocurrencias) {
            this.scene.remove(this.ocurrencias);
            this.ocurrencias.geometry.dispose();
        }
        const pos = new Float32Array(puntos.length * 3);
        puntos.forEach((p, i) => {
            const v = latLonAVector3(p[0], p[1], 0.45);
            pos.set([v.x, v.y, v.z], i * 3);
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.ocurrencias = new THREE.Points(geo, new THREE.PointsMaterial({
            color: new THREE.Color(colorHex), size: 1.7, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false
        }));
        this.ocurrencias.userData = { tipo: 'ocurrencias', puntos };
        this.ocurrencias.visible = this.visibilidadOcurrencias !== false;
        this.scene.add(this.ocurrencias);
    }

    /** Une los dos tiles EPSG:4326 de GBIF (oeste/este) en una textura equirectangular 2:1. */
    setDensidad(imgOeste, imgEste) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (imgOeste) ctx.drawImage(imgOeste, 0, 0, 512, 512);
        if (imgEste) ctx.drawImage(imgEste, 512, 0, 512, 512);
        if (this.materialDensidad.map) this.materialDensidad.map.dispose();
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.materialDensidad.map = tex;
        this.materialDensidad.needsUpdate = true;
    }

    setVisible(capa, visible) {
        if (capa === 'ocurrencias') {
            this.visibilidadOcurrencias = visible;
            if (this.ocurrencias) this.ocurrencias.visible = visible;
        } else if (capa === 'densidad') {
            this.densidad.visible = visible;
        } else if (capa === 'reticula') {
            this.reticula.visible = visible;
        } else if (this.grupos[capa]) {
            this.grupos[capa].visible = visible;
        }
    }

    /* ---------------- Cámara ---------------- */

    volarA(lat, lon, distancia = null) {
        const desde = this.camera.position.clone();
        const dist = distancia ?? Math.min(desde.length(), RADIO * 2.4);
        const hasta = latLonAVector3(lat, lon, dist - RADIO);
        const qDesde = new THREE.Quaternion();
        const qHasta = new THREE.Quaternion().setFromUnitVectors(desde.clone().normalize(), hasta.clone().normalize());
        const largoDesde = desde.length();
        this.animaciones.push({
            t: 0, duracion: 1.3,
            paso: (k) => {
                const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
                const q = qDesde.clone().slerp(qHasta, e);
                const dir = desde.clone().normalize().applyQuaternion(q);
                this.camera.position.copy(dir.multiplyScalar(largoDesde + (dist - largoDesde) * e));
                this.camera.lookAt(0, 0, 0);
            }
        });
    }

    /* ---------------- Interacción ---------------- */

    registrarEventos() {
        const canvas = this.renderer.domElement;
        let inicio = null;
        canvas.addEventListener('pointerdown', (e) => { inicio = { x: e.clientX, y: e.clientY }; });
        canvas.addEventListener('pointerup', (e) => {
            if (!inicio) return;
            const movido = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y);
            inicio = null;
            if (movido < 5) this.clic(e);
        });
        let pendiente = false;
        canvas.addEventListener('pointermove', (e) => {
            if (pendiente) return;
            pendiente = true;
            requestAnimationFrame(() => { pendiente = false; this.hover(e); });
        });
        canvas.addEventListener('pointerleave', () => this.cb.onHover?.(null));
    }

    lanzarRayo(e) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.puntero.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.puntero.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.puntero, this.camera);
    }

    /** Distancia a la superficie terrestre en la dirección del rayo (para descartar objetos del otro lado). */
    distanciaTierra() {
        const hit = this.raycaster.intersectObject(this.tierra, false)[0];
        return hit ? hit.distance : Infinity;
    }

    elementoBajoPuntero(e) {
        this.lanzarRayo(e);
        const dTierra = this.distanciaTierra();
        const visibles = this.marcadoresClic.filter(m => {
            let o = m;
            while (o) { if (!o.visible) return false; o = o.parent; }
            return true;
        });
        const marcador = this.raycaster.intersectObjects(visibles, false).find(h => h.distance < dTierra + 2);
        if (marcador) return { tipo: 'marcador', datos: marcador.object.userData };
        if (this.ocurrencias && this.ocurrencias.visible) {
            const occ = this.raycaster.intersectObject(this.ocurrencias, false).find(h => h.distance < dTierra + 1);
            if (occ) return { tipo: 'ocurrencia', datos: this.ocurrencias.userData.puntos[occ.index] };
        }
        if (dTierra < Infinity) {
            const hit = this.raycaster.intersectObject(this.tierra, false)[0];
            return { tipo: 'tierra', datos: vector3ALatLon(hit.point) };
        }
        return null;
    }

    clic(e) {
        const el = this.elementoBajoPuntero(e);
        if (!el) return;
        if (el.tipo === 'marcador') this.cb.onClicMarcador?.(el.datos);
        else if (el.tipo === 'ocurrencia') this.cb.onClicPunto?.(el.datos[0], el.datos[1], { ocurrencia: el.datos });
        else this.cb.onClicPunto?.(el.datos.lat, el.datos.lon);
    }

    hover(e) {
        if (!this.activo) return;
        const el = this.elementoBajoPuntero(e);
        this.renderer.domElement.style.cursor = el && el.tipo !== 'tierra' ? 'pointer' : 'crosshair';
        this.cb.onHover?.(el, e);
    }

    /* ---------------- Bucle ---------------- */

    redimensionar() {
        const w = this.contenedor.clientWidth, h = this.contenedor.clientHeight;
        if (!w || !h) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.etiquetas.setSize(w, h);
    }

    iniciar() {
        if (this.activo) return;
        this.activo = true;
        this.redimensionar();
        this.reloj.getDelta();
        const bucle = () => {
            if (!this.activo) return;
            requestAnimationFrame(bucle);
            this.cuadro(Math.min(0.1, this.reloj.getDelta()));
        };
        bucle();
    }

    detener() {
        this.activo = false;
    }

    cuadro(delta) {
        const tiempo = this.reloj.elapsedTime;
        this.animaciones = this.animaciones.filter(a => {
            a.t += delta;
            a.paso(Math.min(1, a.t / a.duracion));
            return a.t < a.duracion;
        });
        if (!this.animaciones.length) this.controls.update();

        this.grupos.seleccion.children.forEach(o => {
            if (o.userData.pulso) {
                const s = 1 + (tiempo * 1.5 % 1) * 1.8;
                o.scale.set(s, s, s);
                o.material.opacity = 1 - (tiempo * 1.5 % 1);
            }
        });
        this.grupos.ab.children.forEach(o => {
            if (o.userData.curva) o.position.copy(o.userData.curva.getPointAt((tiempo * 0.25) % 1));
        });

        // Oculta etiquetas de marcadores que quedan del otro lado del planeta
        const dirCam = this.camera.position.clone().normalize();
        [this.grupos.referencias, this.grupos.ab].forEach(g => g.children.forEach(pin => {
            if (pin.userData.etiqueta) pin.userData.etiqueta.visible = g.visible && pin.userData.normal.dot(dirCam) > 0.15;
        }));

        this.renderer.render(this.scene, this.camera);
        this.etiquetas.render(this.scene, this.camera);
    }
}
