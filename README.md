# Práctica 05 - Persistencia de Datos y Simulaciones para la Toma de Decisiones

**Autores:** Chavarin & Godinez  
**Materia:** Bioinformática y Biología Computacional Avanzados

## Descripción del Proyecto
Laboratorio Bioinformático de Cultivo 3D que extiende el simulador procedural de *Agave* en **Three.js** conectándolo a una base de datos **MySQL** mediante una API REST en **PHP (FlightPHP)** con **PDO** y visualización analítica en tiempo real con **Chart.js**.

## Arquitectura de Tres Capas
1. **Capa de Presentación (`index.html`, `style.css`):** Escena 3D interactiva (cultivo 2x3), panel de control de variables ambientales/genéticas, tablero de KPIs, curvas en vivo con Chart.js, comparador A/B, modal de reportes y cuestionario técnico.
2. **Capa de Lógica (`main.js`):** Modelos matemáticos seleccionables (*Logístico de Verhulst, Gompertz, Exponencial y Lineal*), cálculo de índices de estrés (hídrico, térmico, lumínico, nutricional), motor heurístico de decisiones agronómicas, raycasting con contribución de biomasa y exportación a CSV/PDF.
3. **Capa de Datos (`api/`, `database/`):** Base de datos `practica05_bioinformatica` con 4 tablas (`especies`, `simulaciones`, `mediciones`, `decisiones`) expuestas vía FlightPHP y PDO con protección contra SQL Injection.

## Cómo Ejecutar en XAMPP
1. Iniciar **Apache** y **MySQL** en el panel de XAMPP.
2. Importar `database/schema.sql` y `database/seed.sql` desde `http://localhost/phpmyadmin`.
3. Colocar la carpeta `practica-05-bioinformatica` dentro de `xampp/htdocs/git/`.
4. Abrir en el navegador: `http://localhost/git/practica-05-bioinformatica/`.