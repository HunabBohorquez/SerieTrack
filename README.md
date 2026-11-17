# 🎬 SerieTrack — Gestor y Analizador de Progreso Audiovisual

> **Enlaces del proyecto** — _pega aquí tus URLs antes de entregar_

**Link:** `(espacio para pegar el link)`

**Repositorio en GitHub:** `(espacio para pegar el link)`

> 📝 **Nota:** este proyecto tiene los **mismos archivos** que el repositorio de GitLab
> (`index.html`, `styles.css`, `app.js`, `README.md`). Solo cambia la plataforma de alojamiento.

---

Aplicación web **100 % frontend** construida con **HTML5, CSS3 y JavaScript ES6+ Vanilla**
(sin frameworks, sin librerías, sin build step) para registrar, seguir y analizar tu
progreso viendo **series y películas**.

---

## 📁 Estructura de archivos

```
serietrack/
├── index.html     → Estructura semántica: cabecera, panel de estadísticas,
│                    formulario CRUD, filtros y rejilla de tarjetas.
├── styles.css     → Tema oscuro/claro con variables CSS, CSS Grid + Flexbox,
│                    diseño responsivo y estilos del canvas.
├── app.js         → Toda la lógica, modularizada en 11 secciones:
│                    Utils · Toast · Storage · Schema · Calc · Chart ·
│                    Tema · Render · DATOS_DEMO · App · Arranque.
└── README.md      → Este documento.
```

---

## 🚀 Instrucciones de ejecución

1. Crea una carpeta llamada `serietrack`.
2. Guarda dentro los cuatro archivos (`index.html`, `styles.css`, `app.js`, `README.md`).
3. Haz **doble clic en `index.html`** (o arrástralo a tu navegador).
4. No requiere servidor, ni instalación, ni conexión a internet.

> Compatible con Chrome, Edge, Firefox y Safari actuales.
> Los datos se guardan automáticamente en `localStorage` bajo la clave `serietrack:datos:v1`.

---

## ✨ Funcionalidades

| Función | Descripción |
|---|---|
| **CRUD completo** | Crear, leer, editar y eliminar títulos con 9 campos: título, tipo, estado, temporada, episodios vistos, episodios totales, duración por episodio (min), calificación (0–10) y notas. |
| **Acción rápida “+1 Episodio”** | Visible solo en tarjetas de **series** con estado **Viendo**. Incrementa los vistos, recalcula el % y, al alcanzar el total, cambia el estado a **Terminada** automáticamente. |
| **Filtros combinables en tiempo real** | Búsqueda por texto (título + notas) **AND** filtro por estado **AND** filtro por tipo. Se aplican al instante sin recargar. |
| **Estadísticas en vivo** | Total de títulos, series terminadas, episodios vistos, tiempo total invertido (horas + días equivalentes), calificación promedio y gráfico de barras en `<canvas>` con la distribución por estado. |
| **Persistencia** | `localStorage` con `try/catch` y *fallback* a memoria si el almacenamiento está lleno o bloqueado. |
| **Datos demo** | Botón que carga 5 registros verificables con distintos estados, tipos y duraciones. |
| **Backup JSON** | Exportar la biblioteca completa a un `.json` descargable e importarla de vuelta con validación y saneado. |
| **Tema claro/oscuro** | Conmutador persistente que además redibuja el canvas con los colores del tema. |
| **Validaciones** | Título obligatorio, episodios vistos ≤ totales, episodios totales ≥ 1, duración ≥ 1 min, calificación 0–10. **Nunca se produce división entre cero** (`Calc.progreso` devuelve 0 si el total es 0). |

---

## 🧮 Fórmulas de cálculo

```
progreso(%)       = (episodiosVistos / episodiosTotales) * 100   → 0 si total = 0
minutosInvertidos = episodiosVistos * duracion
horasTotales      = Σ minutosInvertidos / 60
diasEquivalentes  = Σ minutosInvertidos / 1440
promedio          = Σ calificaciones / nº de títulos con calificación > 0
```

> El **promedio ignora las calificaciones en 0** (títulos sin calificar).
> Las estadísticas se calculan **sobre toda la biblioteca**, no sobre la vista filtrada.

---

## ✅ Pruebas verificables

### 1. Cargar los datos demo

Pulsa **“📦 Cargar datos demo”**. Se insertan estos 5 registros:

| # | Título | Tipo | Estado | Temporada | Vistos | Totales | Min/unidad | Calificación | Progreso |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Breaking Bad | Serie | Terminada | 5 | 62 | 62 | 47 | 9.5 | 100.0 % |
| 2 | Stranger Things | Serie | Viendo | 4 | 33 | 34 | 51 | 8.7 | 97.1 % |
| 3 | The Office | Serie | Viendo | 4 | 50 | 201 | 22 | 9.0 | 24.9 % |
| 4 | Inception | Película | Terminada | 0 | 1 | 1 | 148 | 8.8 | 100.0 % |
| 5 | Dune: Parte Dos | Película | Pendiente | 0 | 0 | 1 | 166 | 0.0 | 0.0 % |

**Panel de estadísticas esperado (valores exactos):**

| Métrica | Cálculo | Valor mostrado |
|---|---|---|
| Total de títulos | 5 | **5** |
| Series terminadas | solo Breaking Bad | **1** |
| Episodios vistos | 62 + 33 + 50 + 1 + 0 | **146** |
| Minutos totales | (62×47) + (33×51) + (50×22) + (1×148) + (0×166)<br>= 2914 + 1683 + 1100 + 148 + 0 | **5845 min** |
| Tiempo invertido | 5845 / 60 | **97.4 h** |
| Días equivalentes | 5845 / 1440 | **≈ 4.06 días** |
| Calificación promedio | (9.5 + 8.7 + 9.0 + 8.8) / 4 = 36.0 / 4 | **9.0 / 10** |
| Distribución | Viendo 2 · Terminada 2 · Pendiente 1 · Abandonada 0 | **2 / 2 / 1 / 0** |

> El gráfico de barras debe mostrar 4 barras con alturas 2, 2, 1 y 0 respectivamente.

---

### 2. Prueba estrella: “+1 Episodio” con autocompletado

Con los datos demo recién cargados, pulsa **“+1 Episodio” en *Stranger Things*** (33/34).

**Resultado esperado:**

| Elemento | Antes | Después |
|---|---|---|
| Episodios vistos del título | 33 / 34 (97.1 %) | **34 / 34 (100.0 %)** |
| Estado del título | Viendo | **Terminada** (automático) |
| Botón “+1 Episodio” | Visible | **Desaparece** |
| Series terminadas | 1 | **2** |
| Episodios vistos totales | 146 | **147** |
| Minutos totales | 5845 | **5896** (5845 + 51) |
| Tiempo invertido | 97.4 h | **98.3 h** (5896 / 60 = 98.2666…) |
| Días equivalentes | 4.06 | **4.09 días** (5896 / 1440 = 4.0944…) |
| Calificación promedio | 9.0 | **9.0** (sin cambios) |
| Distribución | 2 / 2 / 1 / 0 | **1 / 3 / 1 / 0** |

Aparece un *toast*: `🎉 "Stranger Things" completada y marcada como Terminada.`

---

### 3. “+1 Episodio” sin completar la serie

Vuelve a cargar los datos demo y pulsa **“+1 Episodio” en *The Office*** (50/201).

| Elemento | Antes | Después |
|---|---|---|
| Progreso del título | 50 / 201 = 24.9 % | **51 / 201 = 25.4 %** |
| Estado | Viendo | **Viendo** (no cambia) |
| Episodios vistos totales | 146 | **147** |
| Minutos totales | 5845 | **5867** (5845 + 22) |
| Tiempo invertido | 97.4 h | **97.8 h** (5867 / 60 = 97.7833…) |
| Días equivalentes | 4.06 | **4.07 días** (5867 / 1440 = 4.0743…) |

---

### 4. Prueba de validación (evitar vistos > totales)

1. En el formulario, escribe el título `Prueba`.
2. Pon **Episodios totales = 5** y **Episodios vistos = 9**.
3. Pulsa **Añadir título**.

**Resultado esperado:** el título **no se guarda**, el campo “Episodios vistos” se marca en rojo
con el mensaje `No puede superar los episodios totales.` y aparece el toast
`Revisa los campos marcados en rojo.`

> Nota: el campo se auto-limita mientras escribes, por lo que para reproducir el error debes
> bajar primero “Episodios totales” por debajo del valor ya introducido en “vistos”.

---

### 5. Prueba de filtros combinables

| Acción | Resultado esperado |
|---|---|
| Escribir `the` en el buscador | **1 resultado**: The Office |
| Limpiar filtros → Estado = `Viendo` | **2 resultados**: Stranger Things y The Office |
| Limpiar filtros → Tipo = `Película` | **2 resultados**: Inception y Dune: Parte Dos |
| Tipo = `Película` **y** Estado = `Terminada` | **1 resultado**: Inception |
| Estado = `Abandonada` | **0 resultados** + mensaje “Sin resultados” |

> El contador junto al título “Mi biblioteca” refleja siempre el número de coincidencias.

---

### 6. Prueba de persistencia

1. Carga los datos demo.
2. **Recarga la página (F5).**
3. Los 5 títulos y las estadísticas deben mostrarse idénticos.

---

### 7. Prueba de exportación / importación

1. Pulsa **Exportar JSON** → se descarga `serietrack-backup-AAAA-MM-DD.json`.
2. Pulsa **Borrar todo** → la biblioteca queda vacía y las estadísticas a 0.
3. Pulsa **Importar JSON** y selecciona el archivo descargado.
4. Confirma el diálogo → los 5 títulos vuelven exactamente iguales.

---

### 8. Prueba de tema y responsividad

- Pulsa el botón 🌙 / ☀️: toda la interfaz cambia de tema **y el gráfico del canvas se redibuja**
  con los colores correctos (las líneas guía y las etiquetas cambian de color).
- Redimensiona la ventana por debajo de 1024 px y 480 px: el layout pasa a una columna,
  el formulario deja de ser *sticky* y las tarjetas se reorganizan sin desbordarse.

---

## 🧱 Decisiones técnicas destacadas

- **Modularización por objetos-namespace**: `Storage`, `Calc`, `Render`, `Chart` y `App` están
  desacoplados. `Calc` es 100 % puro (sin DOM) y por tanto trivialmente testeable.
- **Delegación de eventos**: un único listener en `#cards-grid` gestiona “+1 Episodio”,
  “Editar” y “Eliminar” de todas las tarjetas, evitando *memory leaks* al re-renderizar.
- **Canvas con soporte HiDPI**: se escala por `devicePixelRatio` para que las barras se vean
  nítidas en pantallas Retina, y se redibuja con `ResizeObserver` + `requestAnimationFrame`.
- **Saneado defensivo**: `Schema.normalizar` garantiza que ningún registro (propio o importado)
  pueda romper la aplicación, recortando valores fuera de rango en lugar de lanzar errores.
- **Accesibilidad**: `aria-label` en las barras de progreso y en el canvas, `aria-invalid` en los
  campos con error, `role="status"` en el toast y enlace “saltar al contenido”.
