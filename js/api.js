/**
 * Acceso a la API FlightPHP. El navegador SOLO habla con nuestro servidor:
 * las APIs externas (NASA POWER, Open-Meteo, SoilGrids, GBIF, Nominatim) se consultan desde el proxy PHP.
 */
export const API_BASE = window.location.port === '5500'
    ? 'http://localhost/git/practica-06-geovisualizacion/api/index.php?route='
    : './api/index.php?route=';

/** Construye la URL de una ruta con parámetros (la ruta va en ?route=, los parámetros con &). */
export function urlApi(ruta, params = {}) {
    const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('');
    return `${API_BASE}${ruta}${qs}`;
}

export async function apiGet(ruta, params = {}) {
    const res = await fetch(urlApi(ruta, params));
    let data = null;
    try { data = await res.json(); } catch (e) { /* respuesta no JSON */ }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
}

export async function apiPost(ruta, cuerpo) {
    const res = await fetch(urlApi(ruta), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo)
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* respuesta no JSON */ }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
}
