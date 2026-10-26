# Métricas ambientales y crecimiento del agave

**Práctica 06 · Observatorio Global de Cultivos**
Documento de investigación que fundamenta los umbrales del simulador (`js/agronomia.js` y tabla `umbrales_ambientales`).

---

## 1. Propósito y alcance

El simulador controla siete métricas del entorno: **temperatura media, temperatura mínima extrema (heladas), agua del suelo, radiación (luz), nutrientes, pH del suelo y CO₂**. Este documento define, para cada una, los rangos que van desde el crecimiento favorable hasta la **muerte irreversible**: el punto a partir del cual la planta ya no se recupera ni total ni parcialmente.

La especie de referencia es *Agave tequilana* Weber var. azul, la más estudiada. Las demás especies del catálogo (*A. angustifolia*, *A. salmiana*, *A. cupreata* y el control C3 *Arabidopsis thaliana*) se definen respecto a ella en la sección 8.

> **Nivel de evidencia.** Cada umbral se marca como:
> - **[L]**: tomado directamente de literatura.
> - **[D]**: derivado de literatura con un supuesto explícito.
> - **[C]**: calibración del modelo, elegida para que el simulador reproduzca el comportamiento descrito en la literatura. No es un valor medido.
>
> El simulador es una herramienta didáctica, no un modelo agronómico validado en campo.

---

## 2. Fundamento fisiológico: por qué el agave responde así

1. **Metabolismo CAM.** El agave abre sus estomas de noche, fija CO₂ en ácidos orgánicos y los procesa de día con los estomas cerrados. En *A. tequilana* bien regado, cerca del 87 % de la captación neta de CO₂ ocurre de noche (Nobel y Valenzuela, 1987). Por eso la **temperatura nocturna** pesa más que la diurna, y la planta pierde muy poca agua.
2. **Suculencia.** Las pencas almacenan agua y el agave tolera sequías largas. Por la misma razón es vulnerable a las **heladas**: el agua del tejido se congela, se expande y rompe las células.
3. **Tolerancia al calor.** Los tejidos de agave soportan temperaturas muy altas: casi todos los agaves estudiados por Nobel y Smith (1983) resistieron más de 60 °C de tejido. Aun así, la *fijación* de CO₂ cae mucho antes, con el aire por encima de ~35 °C.
4. **Órgano de reserva.** La piña acumula fructanos (inulina) durante 6-8 años. El daño en un año no se borra: las pencas necrosadas no se regeneran, y el modelo lo representa con **daño permanente**.

---

## 3. Modelo de zonas cardinales

Cada métrica *x* se divide con seis puntos cardinales:

```
 letal_min   crítico_min   óptimo_min ─────── óptimo_max   crítico_max   letal_max
     │  LETAL  │  CRÍTICA  │  SUBÓPTIMA │  ÓPTIMA  │ SUBÓPTIMA │  CRÍTICA  │  LETAL
     ▼         ▼           ▼            ▼          ▼           ▼           ▼
 f = 0      f = 0       f: 0 → 1      f = 1     f: 1 → 0     f = 0       f = 0
 daño       daño lento  sin daño      sin daño  sin daño     daño lento  daño
 rápido     (∝ prof.)   (recupera)    (repara)  (recupera)   (∝ prof.)   rápido
```

| Zona | Factor de crecimiento *f* | Daño | Recuperación |
|---|---|---|---|
| **Óptima** | 1 | ninguno | repara el daño reversible |
| **Subóptima** | lineal de 1 (borde óptimo) a 0 (borde crítico) | ninguno | total, más lenta |
| **Crítica** | 0 (no hay ganancia neta de biomasa) | `prof × 0.35 × 100 / tolerancia` % por día | total o parcial, según el daño acumulado |
| **Letal** | 0 | `100 / tolerancia` % por día | ninguna si se alcanza D = 100 |

- `prof` ∈ [0, 1] mide qué tan dentro de la zona crítica está el valor (0 en el borde subóptimo, 1 en el borde letal).
- `tolerancia` son los días que la planta sobrevive *dentro* de la zona letal (`tol_bajo_dias`, `tol_alto_dias`).

**Factor combinado (ley del mínimo de Liebig):**

```
f_Liebig = min(f_T, f_agua, f_luz, f_nut, f_pH) · (0.85 + 0.15 · promedio(f))
r_efectiva = r · f_Liebig · f_CO₂ · (1 − D/100)
```

El factor más limitante domina el crecimiento, y el 15 % restante representa la co-limitación de los demás.

---

## 4. Escalas del simulador y conversión desde datos reales

| Métrica | Unidad en el simulador | Dato real (API) | Conversión |
|---|---|---|---|
| Temperatura media | °C | NASA POWER `T2M` (media anual) | directa |
| Mínima extrema | °C | NASA POWER `T2M_MIN` (mínimo absoluto anual) | directa |
| Agua del suelo | % de agua aprovechable (0 = punto de marchitez, 100 = saturación) | `PRECTOTCORR_SUM` (mm/año), ET₀ y arcilla de SoilGrids | índice de aridez P/ET₀ → tabla por tramos **[C]**, más 0.25 × (arcilla − 25 %) |
| Radiación (luz) | % de pleno sol (100 % ≈ 27.5 MJ/m²/día ≈ 60 mol PAR/m²/día) | `ALLSKY_SFC_SW_DWN` (MJ/m²/día) | luz = MJ × 3.636 **[D]** |
| Nutrientes | índice de fertilidad 0-100 | SoilGrids: N total, carbono orgánico, CIC | 25·(N/1.5) + 20·(COS/15) + 20·(CIC/20), tope 85 sin fertilizar **[C]** |
| pH | pH en agua | SoilGrids `phh2o` | directa |
| CO₂ | ppm | concentración global actual (~425 ppm) | constante |

**ET₀.** Se estima por mes con Hargreaves-Samani usando radiación medida: `ET₀ = 0.0135·(T + 17.8)·Rs/2.45` (mm/día). **[D]**

**Tabla aridez → agua aprovechable [C]:**

| P/ET₀ | 0 | 0.05 | 0.20 | 0.50 | 0.65 | 1.0 | 1.5 | 2.5 | 4.0 |
|---|---|---|---|---|---|---|---|---|---|
| Agua (%) | 2 | 8 | 20 | 42 | 50 | 62 | 75 | 88 | 95 |

Los cortes 0.05, 0.20, 0.50 y 0.65 son los de la clasificación de aridez del PNUMA (hiperárido, árido, semiárido, subhúmedo seco). Con esta conversión, Tequila, Jalisco (766 mm, ET₀ 1695 mm) queda en **39 % de agua**, dentro del óptimo del agave azul.

---

## 5. Métricas: de favorable a muerte (*A. tequilana*)

### 5.1 Temperatura media del aire

| Zona | Rango (°C) | Efecto fisiológico | Recuperación |
|---|---|---|---|
| Letal baja | ≤ 6 | Clima con heladas recurrentes y metabolismo CAM detenido; necrosis progresiva | Muerte en ~60 días de exposición |
| Crítica baja | 6 – 12 | Fijación nocturna de CO₂ mínima; sin crecimiento neto | Parcial si dura meses |
| Subóptima baja | 12 – 18 | Crecimiento lento (zonas altas y frías) | Total |
| **Óptima** | **18 – 26** | Máxima acumulación de biomasa | — |
| Subóptima alta | 26 – 32 | Menor fijación de CO₂ nocturna | Total |
| Crítica alta | 32 – 38 | Cierre estomático, fotoinhibición, coloración rojiza | Parcial |
| Letal alta | ≥ 38 | Máximas diarias > 45 °C sostenidas; quemaduras de tejido | Muerte en ~45 días |

Evidencia:
- Ruiz-Corral (2002), citado por UC Davis: temperatura diurna óptima de 15-25 °C, subóptima de 10-15 o 25-35 °C y marginal < 10 o > 35 °C. Nocturna óptima de 10-16 °C. **[L]**
- Pimienta-Barrios et al. (2001), citado por INIFAP: la fijación de CO₂ en 24 h cae 10 % a 25/15 °C y 72 % a 35/25 °C respecto a 15/5 °C. **[L]**
- Nobel et al. (1998), citado por UC Davis: la captación se reduce fuertemente con el aire por encima de 35 °C. **[L]**
- La conversión de los rangos día/noche a **temperatura media** (óptimo 18-26 °C) es **[D]**. Las zonas de cultivo de agave azul tienen medias anuales de 20-22 °C; NASA POWER da 20.9 °C para Tequila y 20.3 °C para Arandas.
- La tolerancia de 60/45 días en zona letal es **[C]**.

### 5.2 Temperatura mínima extrema (heladas)

Se evalúa una vez por año, como evento puntual.

| Mínima del año (°C) | Daño instantáneo | Resultado |
|---|---|---|
| ≥ 0 | 0 % | Sin daño |
| 0 a −6 | 10 % → 100 % (lineal) | Daño foliar; −4 °C ≈ 70 % (daño severo, recuperación parcial) |
| ≤ −6 | 100 % | **Muerte**: congelación del meristemo |

Evidencia:
- El CRT (2018), citado por UC Davis, reporta que el agave azul sufre durante horas por debajo de 2 °C y daño muy fuerte por debajo de 0 °C. **[L]**
- Nobel et al. (1998) sitúan el daño severo en −4 °C. **[L]**
- En 1997 se perdieron plantaciones completas de agave azul por heladas en México. **[L]**
- Nobel y Smith (1983) midieron una tolerancia al frío de unos −11 °C para agaves del suroeste de EUA y norte de México, mucho más resistentes que *A. tequilana*. **[L]**
- El umbral letal de −6 °C es **[D]**: está un poco por debajo del "daño severo" de −4 °C y muy por encima de los −11 °C de los agaves de zonas frías.

### 5.3 Agua aprovechable del suelo

| Zona | Rango (%) | Efecto fisiológico | Recuperación |
|---|---|---|---|
| Letal baja | ≤ 5 | Punto de marchitez permanente; deshidratación de pencas | Muerte en ~150 días |
| Crítica baja | 5 – 15 | Sin captación neta de CO₂; la planta vive de sus reservas | Parcial |
| Subóptima baja | 15 – 35 | Crecimiento reducido; estrés moderado típico del estiaje | Total |
| **Óptima** | **35 – 60** | Equivalente a ~650-1100 mm/año con ET₀ típica | — |
| Subóptima alta | 60 – 78 | Suelo húmedo; mayor riesgo de enfermedades | Total |
| Crítica alta | 78 – 92 | Anegamiento parcial; asfixia radicular; *Fusarium* y *Erwinia* | Parcial |
| Letal alta | ≥ 92 | Encharcamiento permanente; pudrición de raíz y cogollo | Muerte en ~30 días |

Evidencia:
- Linton y Nobel (2001): en macetas, tras 100 días de sequía *A. tequilana* llegó a −3.42 MPa de potencial hídrico foliar y redujo su transpiración 97 % a los 40 días. El daño hidráulico se revirtió al rehidratar. Esto respalda la **recuperación total tras sequías moderadas** y una tolerancia letal larga (150 días, **[D]**).
- *Fusarium oxysporum* y *F. solani* son las principales limitantes sanitarias del agave azul (pudrición roja de raíz y marchitez; Ramírez-Ramírez et al., 2017). Los suelos mal drenados favorecen las fusariosis. **[L]**
- Los cortes porcentuales y la tolerancia de 30 días por encharcamiento son **[C]**.

### 5.4 Radiación (luz)

| Zona | Rango (% pleno sol) | Efecto | Recuperación |
|---|---|---|---|
| Letal baja | ≤ 5 (< 3 mol PAR/día) | Balance de carbono negativo; inanición | Muerte en ~120 días |
| Crítica baja | 5 – 15 | Captación neta ≈ 0 | Parcial |
| Subóptima baja | 15 – 45 | Sombra; la captación crece con la luz | Total |
| **Óptima** | **45 – 85** | ≥ 90 % de saturación de la acumulación ácida nocturna | — |
| Subóptima alta | 85 – 100 | Riesgo de fotoinhibición si coincide con calor y sequía (*f* ≥ 0.84) | Total |

- Nobel y Valenzuela (1987): la acumulación nocturna de ácido llega al 90 % de su máximo con ~22 mol PAR m⁻² día⁻¹, que equivale al ~37 % de pleno sol. **[L]** El óptimo empieza en 45 % para dejar margen **[D]**.
- La radiación no es letal dentro del rango natural (0-100 %). Los puntos crítico/letal altos (180/250 %) están fuera de escala a propósito.

### 5.5 Nutrientes (índice de fertilidad)

| Zona | Rango | Efecto | Recuperación |
|---|---|---|---|
| Letal baja | ≤ 3 | Clorosis generalizada; sin raíces nuevas | Muerte en ~240 días |
| Crítica baja | 3 – 15 | Deficiencia severa de N y P | Parcial |
| Subóptima baja | 15 – 45 | Suelos pobres: el agave crece, pero lento | Total |
| **Óptima** | **45 – 80** | Fertilidad media | — |
| Subóptima alta | 80 – 92 | Exceso de fertilizante; sales | Total |
| Crítica alta | 92 – 98 | Salinidad que quema las raíces | Parcial |
| Letal alta | ≥ 98 | Toxicidad salina | Muerte en ~60 días |

- INIFAP: *A. tequilana* se adapta a suelos delgados y poco fértiles, y su producción aumenta con buena nutrición. **[L]** Por eso la zona subóptima baja es amplia y la deficiencia casi nunca mata por sí sola.
- Los cortes del índice son **[C]**.

### 5.6 pH del suelo

| Zona | Rango | Efecto | Recuperación |
|---|---|---|---|
| Letal baja | ≤ 3.8 | Toxicidad por aluminio y manganeso; muerte de raíces | Muerte en ~180 días |
| Crítica baja | 3.8 – 4.5 | Raíces dañadas; P bloqueado | Parcial |
| Subóptima baja | 4.5 – 6.0 | Acidez: se recomienda encalar | Total |
| **Óptima** | **6.0 – 7.6** | Máxima disponibilidad de nutrientes | — |
| Subóptima alta | 7.6 – 8.6 | Deficiencias de Fe y Zn | Total |
| Crítica alta | 8.6 – 9.5 | Suelo sódico; estructura dañada | Parcial |
| Letal alta | ≥ 9.5 | Sodicidad extrema | Muerte en ~180 días |

- Un diagnóstico de suelos con agave azul encontró que el 52 % tenía pH < 5.5, con necesidades de encalado de 1.7-4 Mg/ha (Terra Latinoamericana). **[L]** Por eso pH 4.5-5.5 es **subóptimo y no crítico**: muchas plantaciones productivas viven ahí.
- La versión inicial de este modelo ponía el umbral crítico en 4.8 y "mataba" plantas a pH 4.5. Se relajó a 4.5 después de contrastarlo con este dato.

### 5.7 CO₂ atmosférico

El CO₂ no entra en la ley del mínimo. Actúa como **multiplicador**:

```
f_CO₂ = 1 + β · log₂(CO₂ / 400),  con CO₂ saturado en 1000 ppm
β = 0.35 (CAM)   ·   β = 0.33 (C3)
```

| CO₂ (ppm) | f_CO₂ (CAM) | Zona |
|---|---|---|
| ≤ 100 | 0 | Letal (sin fotosíntesis neta) |
| 100 – 180 | 0 | Crítica (bajo el punto de compensación) |
| 280 (preindustrial) | 0.82 | Subóptima |
| 425 (actual) | 1.03 | Óptima |
| 800 | 1.35 | Óptima (fertilización por CO₂) |
| ≥ 1000 | 1.46 | Saturación |

- Drennan y Nobel (2000): las especies CAM aumentan en promedio 35 % su productividad de biomasa al duplicarse el CO₂. **[L]**
- Graham y Nobel (1996) midieron +88 % de materia seca en *A. deserti* con 750 ppm durante 17 meses. Es un caso extremo de una sola especie y no se usa como β. **[L]**
- No hay muerte por CO₂ dentro de concentraciones atmosféricas realistas.

---

## 6. Modelo de daño acumulado y recuperación

### 6.1 Variables de estado

- **D** (0-100 %): daño fisiológico acumulado (necrosis, pérdida de raíces, tejido congelado).
- **Dperm** (0-100 %): fracción del daño que ya es irreversible.

### 6.2 Dinámica por paso (1 paso = 18.25 días reales; 140 pasos = 7 años)

1. **Acumulación**: `ΔD = Σ_variables daño_diario × 18.25 + daño_helada`.
2. **Reparación** (solo si ninguna variable está en zona crítica o letal): `D ← max(Dperm, D − 0.6 · f_Liebig · 18.25)`.
3. **Irreversibilidad**: si el máximo histórico de D supera 30, `Dperm = 0.7 · (Dmax − 30)`.
4. **Necrosis**: cada punto de daño nuevo destruye 0.6 % de la biomasa.
5. **Capacidad de carga efectiva**: `K_ef = K · (1 − Dperm/100)`. La planta dañada ya no llega a la K original.
6. **Muerte**: D ≥ 100 → `muerta = true`. Es **irreversible**: la biomasa se descompone (−6 % por paso) y no hay crecimiento posible.

### 6.3 Estados y recuperabilidad

| D | Estado | ¿Recuperación? |
|---|---|---|
| 0 – 10 | Saludable | No requiere |
| 10 – 30 | Estrés reversible | **Total**: el daño vuelve a 0 |
| 30 – 70 | Daño parcial | **Parcial**: queda Dperm > 0 y K baja |
| 70 – 100 | Daño severo | Crecimiento detenido; solo recuperación parcial mínima si el estrés cesa de inmediato |
| ≥ 100 | **Muerte** | **Ninguna, ni total ni parcial** |

Estos son los parámetros del modelo (**[C]**). Se eligieron para que una sequía moderada sea totalmente reversible, una sequía crítica de un año deje secuelas leves, dos años dejen secuelas importantes, y las condiciones letales maten en semanas o meses, de acuerdo con la sección 5.

---

## 7. Interacciones

- **Liebig.** El factor más bajo manda: agua y luz óptimas no compensan un pH 4.5.
- **Daño aditivo.** Si dos variables están en zona crítica, sus daños se suman (por ejemplo, sequía y calor en la misma ola).
- **Helada y estado previo.** Una helada de −4 °C sobre una planta que ya tenía 40 % de daño la lleva a la muerte. La misma helada sobre una planta sana solo la deja con daño parcial.
- **CO₂ y estrés.** El CO₂ alto acelera el crecimiento, pero no protege del daño: multiplica la tasa, no reduce los umbrales.

---

## 8. Umbrales por especie

Formato: `letal_min / crítico_min / [óptimo_min – óptimo_max] / crítico_max / letal_max`.

| Especie | Temperatura media (°C) | Helada (daño / letal, °C) | Agua (%) | Luz (%) | Nutrientes | pH |
|---|---|---|---|---|---|---|
| *A. tequilana* (azul) | 6 / 12 / [18–26] / 32 / 38 | 0 / −6 | 5 / 15 / [35–60] / 78 / 92 | 5 / 15 / [45–85] | 3 / 15 / [45–80] / 92 / 98 | 3.8 / 4.5 / [6.0–7.6] / 8.6 / 9.5 |
| *A. angustifolia* (espadín) | 5 / 11 / [20–30] / 35 / 41 | −1 / −7 | 4 / 10 / [28–55] / 74 / 90 | 5 / 15 / [45–90] | 3 / 10 / [35–75] / 92 / 98 | 3.8 / 4.5 / [6.0–8.0] / 8.8 / 9.6 |
| *A. salmiana* (pulquero) | 0 / 6 / [14–22] / 30 / 35 | −4 / −12 | 6 / 15 / [35–65] / 80 / 92 | 5 / 15 / [40–85] | 3 / 15 / [50–85] / 93 / 98 | 4.0 / 4.8 / [6.0–8.2] / 8.9 / 9.6 |
| *A. cupreata* (papalote) | 4 / 10 / [16–24] / 29 / 34 | 0 / −5 | 7 / 18 / [40–65] / 78 / 90 | 5 / 12 / [40–80] | 3 / 15 / [45–80] / 92 / 98 | 3.7 / 4.3 / [5.5–7.2] / 8.2 / 9.2 |
| *Arabidopsis* (control C3) | 2 / 6 / [18–24] / 29 / 33 | −3 / −10 | 12 / 28 / [50–75] / 88 / 96 | 3 / 8 / [30–70] | 4 / 15 / [50–85] / 95 / 99 | 4.0 / 4.8 / [5.8–7.2] / 8.0 / 9.0 |

Justificación de las diferencias:
- **Espadín.** Tiene la distribución más amplia y cálida (de Sonora a Centroamérica), por eso tolera más calor y sequía. En la prueba con datos reales es la especie con mayor idoneidad en Almería (241 mm/año). **[D]**
- **Pulquero.** Es del Altiplano (2000-2800 m), con medias frías y heladas. Los reportes de vivero dan resistencia a heladas breves de −4 a −12 °C según la humedad. **[D]**
- **Papalote.** Proviene de la Depresión del Balsas a 1220-1850 m, con media ~19 °C y ~961 mm, de modo que es más sensible al calor. **[L]** para el clima de origen; **[D]** para los umbrales.
- **Arabidopsis.** Planta anual C3, mucho menos tolerante a la sequía (tolerancia letal de 15 días). Su ciclo de ~45 días no se ajusta a un horizonte de 7 años: ver la sección 11.

---

## 9. Escenarios de verificación

Resultados reales de `simularCiclo()` (logístico, r = 0.14, K = 4500 g, 7 años). Todas las variables quedan en el centro del óptimo salvo la indicada.

| Escenario | Biomasa final | D final | Daño permanente | Estado final | Interpretación |
|---|---|---|---|---|---|
| Todas las variables óptimas | 4500 g | 0 | 0 | Saludable | Llega a K hacia el año 5 |
| Agua 25 % los 7 años (subóptima) | 4173 g | 0 | 0 | Saludable | Solo crece más lento |
| Agua 10 % solo el año 3 (crítica) | 4097 g | 8.8 | 8.8 | Saludable | Recupera casi todo |
| Agua 10 % años 3 y 4 | 2644 g | 38.6 | 38.6 | **Daño parcial** | Recuperación parcial: K efectiva baja |
| Agua 4 % el año 3 (letal) | 27 g | 100 | — | **Muerta** (año 3) | Sin recuperación |
| Agua 82 % todo el año 2 (crítica alta) | 27 g | 100 | — | **Muerta** (año 2) | Un año de anegamiento mata |
| Agua 95 % el año 2 (letal alta) | 27 g | 100 | — | **Muerta** en ~1 mes | Encharcamiento |
| Temperatura media 35 °C el año 4 | 34 g | 100 | — | **Muerta** (año 4) | Calor crítico sostenido |
| Temperatura media 39 °C el año 4 | 27 g | 100 | — | **Muerta** (año 4) | Calor letal |
| Temperatura media 9 °C los 7 años | 27 g | 100 | — | **Muerta** (año 1) | Clima demasiado frío |
| Helada de −2 °C en el año 2 | 4184 g | 7 | 7 | Saludable | Daño leve |
| Heladas de −4 °C en los años 2 y 5 | 2279 g | 47.6 | 47.6 | **Daño parcial** | Dos heladas severas |
| Helada de −7 °C en el año 3 | 27 g | 100 | — | **Muerta** (año 3) | Helada letal |
| pH 5.0 (subóptimo) | 2649 g | 0 | 0 | Saludable | Crece a 1/3 de ritmo |
| pH 4.2 (crítico) los 7 años | 27 g | 100 | — | **Muerta** (año 4) | Toxicidad crónica |
| Nutrientes 25 | 2649 g | 0 | 0 | Saludable | Suelo pobre: lento, no letal |
| Luz 25 % | 2649 g | 0 | 0 | Saludable | Sombra: lento |
| CO₂ 800 ppm | 4500 g | 0 | 0 | Saludable | Llega a K ~1 año antes |
| CO₂ 280 ppm | 4494 g | 0 | 0 | Saludable | Más lento |

**Validación con ubicaciones reales.** El modelo se corrió con datos reales de NASA POWER 2019-2025, SoilGrids y GBIF:

| Ubicación | Clima real | Mejor especie según el modelo | ¿Coincide con la realidad? |
|---|---|---|---|
| Tequila, Jalisco | 20.9 °C, 766 mm, mín. 0.5 °C | Agave azul (índice 100) | Sí: núcleo de la DO Tequila |
| Apan, Hidalgo | 14.6 °C, 833 mm, mín. −0.4 °C | Pulquero (índice 100; 846 registros GBIF) | Sí: Llanos de Apan |
| Chilapa, Guerrero | 22.3 °C, 1054 mm | Espadín (100) / papalote (98; 290 registros GBIF) | Sí: mezcal de papalote |
| Almería, España | 17.2 °C, 241 mm | Espadín (61, idoneidad media) | Plausible: el más tolerante a sequía |
| Córdoba, España | 17.9 °C, 439 mm, **mín. −4.8 °C** | Agave azul **muere por helada** | Coherente con su sensibilidad al frío |
| Iquitos, Perú | 25.9 °C, **3135 mm** | Todos los agaves **mueren por encharcamiento** | Coherente: el agave exige buen drenaje |

---

## 10. Reglas de decisión derivadas

| Regla | Umbral | Recomendación |
|---|---|---|
| Precipitación anual | < 400 mm | Riego suplementario obligatorio (crítica) |
| Temperatura media | > 35 °C | Estrés térmico severo; considerar una variedad resistente |
| Mínima extrema | ≤ letal de la especie | Helada letal: sitio no apto sin protección |
| Ocurrencias GBIF en el radio | = 0 | Especie no reportada en la región: alto riesgo |
| pH del suelo | < 5.5 | Suelo ácido: encalar antes de sembrar |
| Radiación | > 25 MJ/m²/día | Alta radiación: considerar sombra parcial |
| Arcilla | > 40 % | Drenaje lento: camellones o maguey pulquero |
| Agua estimada | > crítico_max | Riesgo de encharcamiento |

---

## 11. Limitaciones

1. Los umbrales **[C]** son calibraciones didácticas. Para uso real habría que ajustarlos con ensayos de campo (biomasa medida contra clima medido).
2. El paso de 18.25 días y el clima **anual** suavizan los extremos: una sequía de 3 meses dentro de un año lluvioso no aparece. Usar series mensuales de NASA POWER (ya disponibles en el proxy) es la mejora natural.
3. La mínima extrema anual de NASA POWER corresponde a una celda de ~0.5°, no a una ladera concreta. Las heladas de hondonada pueden ser varios grados más frías.
4. *Arabidopsis* es anual de invierno en clima mediterráneo; promediar su clima en años completos la penaliza injustamente (muere en Córdoba aunque GBIF la reporta 117 veces).
5. SoilGrids no tiene datos en zonas urbanas o en cuerpos de agua. El proxy usa entonces la celda vecina a ~8 km, o valores típicos de la especie.

---

## 12. Referencias

- Nobel, P. S. y Smith, S. D. (1983). High and low temperature tolerances and their relationships to distribution of agaves. *Plant, Cell & Environment*, 6, 711-719. <https://digitalscholarship.unlv.edu/sls_fac_articles/7>
- Nobel, P. S. y Valenzuela, A. G. (1987). Environmental responses and productivity of the CAM plant *Agave tequilana*. *Agricultural and Forest Meteorology*, 39, 319-334.
- Pimienta-Barrios, E., Robles-Murguía, C. y Nobel, P. S. (2001). Net CO₂ uptake for *Agave tequilana* in a warm and a temperate environment. *Biotropica*, 33(2), 312-318. <https://complete.bioone.org/journals/biotropica/volume-33/issue-2/0006-3606(2001)033[0312:NCUFAT]2.0.CO;2/Net-CO2-Uptake-for-Agave-tequilana-in-a-Warm-and/10.1646/0006-3606(2001)033[0312:NCUFAT]2.0.CO;2.full>
- Graham, E. A. y Nobel, P. S. (1996). Long-term effects of a doubled atmospheric CO₂ concentration on the CAM species *Agave deserti*. <https://agris.fao.org/search/ar/records/65de42de7c7033e84bea5eb2>
- Drennan, P. M. y Nobel, P. S. (2000). Responses of CAM species to increasing atmospheric CO₂ concentrations. *Plant, Cell & Environment*, 23, 767-781. <https://faculty.eeb.ucla.edu/Nobel/Reprints/330%20Drennan%20Nobel%202000%20Plant%20Cell%20Environ.pdf>
- Linton, M. J. y Nobel, P. S. (2001). Hydraulic conductivity, xylem cavitation, and water potential for succulent leaves of *Agave deserti* and *Agave tequilana*. *International Journal of Plant Sciences*, 162. <https://faculty.eeb.ucla.edu/Nobel/Reprints/335%20Linton%20Nobel%202001%20Int%20J%20Plant%20Sci.pdf>
- UC Davis. *Guidelines for selection and production of Agave in California* (incluye la tabla de temperaturas de Ruiz-Corral 2002, Nobel et al. 1998 y CRT 2018-2019). <https://watermanagement.ucdavis.edu/application/files/5616/9263/8368/Guidelines_for_selection_and_production_of_Agave_in_California_V5.pdf>
- Ramírez-Ramírez, M. J. et al. (2017). Estudio sobre *Fusarium oxysporum* y *F. solani* en la marchitez del agave azul. *Plant Protection Science*, 53, 144-152. <https://pps.agriculturejournals.cz/pdfs/pps/2017/03/03.pdf>
- *Terra Latinoamericana*: diagnóstico de acidez y necesidades de encalado en suelos cultivados con agave azul. <https://mail.terralatinoamericana.org.mx/index.php/terra/article/download/1236/1459/12286>
- Caracterización agroclimática de *Agave tequilana* en la barranca del Río Santiago. *Revista Mexicana de Ciencias Agrícolas* (INIFAP), 14(3), 2023. <https://cienciasagricolas.inifap.gob.mx/index.php/agricolas/en/article/view/3085>
- Estudio de 12 poblaciones nativas de *Agave cupreata* (clima de origen y proyecciones a 2030). <https://www.redalyc.org/pdf/629/62926234003.pdf>
- Ruiz Corral, J. A. et al. (2013). *Requerimientos agroecológicos de cultivos*, 2.ª ed. INIFAP. <https://www.researchgate.net/profile/Jose_Ruiz_Corral/publication/343047223_REQUERIMIENTOS_AGROECOLOGICOS_DE_CULTIVOS_2da_Edicion/links/5f1310e04585151299a4c447/REQUERIMIENTOS-AGROECOLOGICOS-DE-CULTIVOS-2da-Edicion.pdf> (capítulo "Agave tequilero"; recomendado para afinar los rangos de precipitación y pH).
- Fuentes de datos: NASA POWER (<https://power.larc.nasa.gov/>), Open-Meteo (<https://open-meteo.com>), SoilGrids 2.0 (<https://rest.isric.org>), GBIF (<https://www.gbif.org/developer/occurrence>).
