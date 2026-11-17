/* =========================================================
   SerieTrack · app.js
   Gestor y Analizador de Progreso Audiovisual
   Vanilla JavaScript ES6+ — sin dependencias externas
   ---------------------------------------------------------
   Arquitectura modular:
     Utils   → helpers puros (ids, escape, formato, descargas)
     Toast   → notificaciones no bloqueantes
     Storage → persistencia en localStorage con fallback
     Schema  → normalización y saneado de registros
     Calc    → lógica de cálculo (progreso, tiempo, resumen)
     Chart   → gráfico de barras en <canvas> nativo
     Tema    → modo oscuro / claro
     Render  → pintado del DOM (tarjetas y estadísticas)
     App     → estado, filtros, eventos y orquestación
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   0. CONSTANTES GLOBALES
   --------------------------------------------------------- */
const CLAVE_DATOS = 'serietrack:datos:v1';
const CLAVE_TEMA  = 'serietrack:tema:v1';

const ESTADOS = ['Viendo', 'Terminada', 'Pendiente', 'Abandonada'];
const TIPOS   = ['Serie', 'Película'];

const COLOR_ESTADO = {
  Viendo:     '#3b82f6',
  Terminada:  '#22c55e',
  Pendiente:  '#f59e0b',
  Abandonada: '#ef4444'
};

/* ---------------------------------------------------------
   1. UTILS — helpers puros y reutilizables
   --------------------------------------------------------- */
const Utils = {
  $(selector, raiz = document) {
    return raiz.querySelector(selector);
  },

  $$(selector, raiz = document) {
    return Array.from(raiz.querySelectorAll(selector));
  },

  /** Genera un identificador único (UUID v4 si el navegador lo soporta). */
  uid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  },

  /** Escapa texto para insertarlo con seguridad en plantillas HTML. */
  esc(valor) {
    const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(valor ?? '').replace(/[&<>"']/g, (c) => mapa[c]);
  },

  clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  },

  num(valor, porDefecto = 0) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : porDefecto;
  },

  entero(valor, porDefecto = 0) {
    const n = Number.parseInt(valor, 10);
    return Number.isFinite(n) ? n : porDefecto;
  },

  /** Formatea con punto decimal y sin separador de miles (fácil de verificar). */
  fmt(valor, decimales = 0) {
    const n = Number(valor);
    return Number.isFinite(n) ? n.toFixed(decimales) : (0).toFixed(decimales);
  },

  /** Lee una variable CSS del documento (para el canvas y temas). */
  cssVar(nombre, porDefecto = '') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nombre);
    return (v || '').trim() || porDefecto;
  },

  /** Fuerza la descarga de un archivo generado en memoria. */
  descargar(nombre, contenido, tipoMime = 'application/json') {
    const blob = new Blob([contenido], { type: tipoMime + ';charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
};

/* ---------------------------------------------------------
   2. TOAST — feedback no bloqueante
   --------------------------------------------------------- */
const Toast = {
  _temporizador: null,

  mostrar(mensaje, tipo = 'info') {
    const el = Utils.$('#toast');
    if (!el) return;
    el.textContent = mensaje;
    el.dataset.tipo = tipo;
    el.classList.add('is-visible');
    clearTimeout(this._temporizador);
    this._temporizador = setTimeout(() => el.classList.remove('is-visible'), 3400);
  }
};

/* ---------------------------------------------------------
   3. STORAGE — persistencia con manejo de errores
   --------------------------------------------------------- */
const Storage = {
  _memoria: [],
  _modoMemoria: false,

  leer() {
    if (this._modoMemoria) return this._memoria.slice();
    try {
      const crudo = window.localStorage.getItem(CLAVE_DATOS);
      if (!crudo) return [];
      const datos = JSON.parse(crudo);
      if (!Array.isArray(datos)) {
        throw new TypeError('El almacenamiento no contiene una lista de títulos.');
      }
      return datos;
    } catch (error) {
      console.error('[SerieTrack] Error leyendo localStorage:', error);
      this._modoMemoria = true;
      Toast.mostrar('No se pudo leer el almacenamiento local. Se usará memoria temporal.', 'error');
      return this._memoria.slice();
    }
  },

  escribir(items) {
    this._memoria = items.slice();
    if (this._modoMemoria) return false;
    try {
      window.localStorage.setItem(CLAVE_DATOS, JSON.stringify(items));
      return true;
    } catch (error) {
      console.error('[SerieTrack] Error escribiendo en localStorage:', error);
      this._modoMemoria = true;
      Toast.mostrar('Almacenamiento lleno o bloqueado. Los datos solo viven en esta sesión.', 'error');
      return false;
    }
  }
};

/* ---------------------------------------------------------
   4. SCHEMA — normalización y saneado de registros
   --------------------------------------------------------- */
const Schema = {
  /**
   * Convierte cualquier objeto en un registro válido de SerieTrack.
   * Devuelve null si el registro es irrecuperable (sin título).
   */
  normalizar(registro) {
    if (!registro || typeof registro !== 'object') return null;

    const titulo = String(registro.titulo ?? '').trim();
    if (!titulo) return null;

    const tipo   = TIPOS.includes(registro.tipo) ? registro.tipo : 'Serie';
    const estado = ESTADOS.includes(registro.estado) ? registro.estado : 'Pendiente';

    let totales = Utils.entero(registro.episodiosTotales, 1);
    if (totales < 1) totales = 1;
    if (tipo === 'Película') totales = 1;

    let vistos = Utils.entero(registro.episodiosVistos, 0);
    if (vistos < 0) vistos = 0;
    if (vistos > totales) vistos = totales;

    let temporada = Utils.entero(registro.temporada, 0);
    if (temporada < 0) temporada = 0;
    if (tipo === 'Película') temporada = 0;

    let duracion = Utils.entero(registro.duracion, 1);
    if (duracion < 1) duracion = 1;

    const calificacion = Utils.clamp(Utils.num(registro.calificacion, 0), 0, 10);

    return {
      id: typeof registro.id === 'string' && registro.id ? registro.id : Utils.uid(),
      titulo: titulo.slice(0, 80),
      tipo,
      estado,
      temporada,
      episodiosVistos: vistos,
      episodiosTotales: totales,
      duracion,
      calificacion: Math.round(calificacion * 10) / 10,
      notas: String(registro.notas ?? '').slice(0, 240),
      creadoEn: Number.isFinite(registro.creadoEn) ? registro.creadoEn : Date.now()
    };
  },

  /** Valida los datos del formulario. Devuelve un mapa de errores por campo. */
  validar(datos) {
    const errores = {};

    if (!datos.titulo) {
      errores.titulo = 'El título es obligatorio.';
    } else if (datos.titulo.length > 80) {
      errores.titulo = 'Máximo 80 caracteres.';
    }

    if (!Number.isFinite(datos.episodiosTotales) || datos.episodiosTotales < 1) {
      errores.totales = 'Debe ser un entero mayor o igual a 1.';
    }

    if (!Number.isFinite(datos.episodiosVistos) || datos.episodiosVistos < 0) {
      errores.vistos = 'No puede ser negativo.';
    } else if (
      Number.isFinite(datos.episodiosTotales) &&
      datos.episodiosVistos > datos.episodiosTotales
    ) {
      errores.vistos = 'No puede superar los episodios totales.';
    }

    if (!Number.isFinite(datos.duracion) || datos.duracion < 1) {
      errores.duracion = 'La duración mínima es 1 minuto.';
    }

    if (!Number.isFinite(datos.calificacion) || datos.calificacion < 0 || datos.calificacion > 10) {
      errores.calificacion = 'La calificación debe estar entre 0 y 10.';
    }

    if (!Number.isFinite(datos.temporada) || datos.temporada < 0) {
      errores.temporada = 'La temporada no puede ser negativa.';
    }

    return errores;
  }
};

/* ---------------------------------------------------------
   5. CALC — lógica de cálculo pura (sin DOM)
   --------------------------------------------------------- */
const Calc = {
  /** Porcentaje de avance 0–100. Blindado contra división entre cero. */
  progreso(item) {
    const total  = Utils.num(item.episodiosTotales, 0);
    const vistos = Utils.num(item.episodiosVistos, 0);
    if (total <= 0) return 0;
    return Utils.clamp((vistos / total) * 100, 0, 100);
  },

  /** Minutos totales invertidos en un título. */
  minutosInvertidos(item) {
    const vistos = Math.max(0, Utils.num(item.episodiosVistos, 0));
    const dur    = Math.max(0, Utils.num(item.duracion, 0));
    return vistos * dur;
  },

  /** Resumen agregado de toda la biblioteca. */
  resumen(items) {
    const distribucion = { Viendo: 0, Terminada: 0, Pendiente: 0, Abandonada: 0 };
    let total = 0;
    let seriesTerminadas = 0;
    let episodiosVistos = 0;
    let minutos = 0;
    let sumaCalificaciones = 0;
    let calificados = 0;

    for (const item of items) {
      total += 1;

      if (item.tipo === 'Serie' && item.estado === 'Terminada') {
        seriesTerminadas += 1;
      }

      episodiosVistos += Math.max(0, Utils.entero(item.episodiosVistos, 0));
      minutos += Calc.minutosInvertidos(item);

      const cal = Utils.num(item.calificacion, 0);
      if (cal > 0) {
        sumaCalificaciones += cal;
        calificados += 1;
      }

      if (Object.prototype.hasOwnProperty.call(distribucion, item.estado)) {
        distribucion[item.estado] += 1;
      }
    }

    return {
      total,
      seriesTerminadas,
      episodiosVistos,
      minutos,
      horas: minutos / 60,
      dias: minutos / 1440,
      promedio: calificados > 0 ? sumaCalificaciones / calificados : 0,
      calificados,
      distribucion
    };
  },

  /** "2914" → "48 h 34 min" */
  duracionLegible(minutos) {
    const total = Math.max(0, Math.round(Utils.num(minutos, 0)));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  }
};

/* ---------------------------------------------------------
   6. CHART — gráfico de barras en <canvas> nativo
   --------------------------------------------------------- */
const Chart = {
  canvas: null,
  ctx: null,
  ultimaDistribucion: null,
  _raf: null,
  _observer: null,

  init(canvas) {
    this.canvas = canvas;
    if (!canvas) return;
    this.ctx = canvas.getContext('2d');

    if (typeof ResizeObserver === 'function' && canvas.parentElement) {
      this._observer = new ResizeObserver(() => this.programar());
      this._observer.observe(canvas.parentElement);
    }
    window.addEventListener('resize', () => this.programar());
  },

  programar() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this.dibujar(this.ultimaDistribucion));
  },

  dibujar(distribucion) {
    if (!this.canvas || !this.ctx) return;

    const dist = distribucion || { Viendo: 0, Terminada: 0, Pendiente: 0, Abandonada: 0 };
    this.ultimaDistribucion = dist;

    const rect  = this.canvas.getBoundingClientRect();
    const ancho = rect.width  || this.canvas.clientWidth;
    const alto  = rect.height || this.canvas.clientHeight;
    if (ancho <= 0 || alto <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width  = Math.round(ancho * dpr);
    this.canvas.height = Math.round(alto * dpr);

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);

    const datos = ESTADOS.map((estado) => ({
      estado,
      valor: Math.max(0, Utils.entero(dist[estado], 0))
    }));
    const maximo = Math.max(1, ...datos.map((d) => d.valor));

    const padArriba = 24;
    const padAbajo  = 30;
    const padLados  = 6;
    const separacion = 14;
    const alturaPlot = Math.max(12, alto - padArriba - padAbajo);
    const anchoBarra = Math.max(
      8,
      (ancho - padLados * 2 - separacion * (datos.length - 1)) / datos.length
    );

    const colorTexto = Utils.cssVar('--text-muted', '#94a3b8');
    const colorGuia  = Utils.cssVar('--border', '#2a3455');

    /* Líneas de referencia horizontales */
    ctx.save();
    ctx.strokeStyle = colorGuia;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    for (let i = 0; i <= 3; i += 1) {
      const y = padArriba + (alturaPlot / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padLados, Math.round(y) + 0.5);
      ctx.lineTo(ancho - padLados, Math.round(y) + 0.5);
      ctx.stroke();
    }
    ctx.restore();

    /* Barras */
    datos.forEach((d, i) => {
      const x = padLados + i * (anchoBarra + separacion);
      const alturaBarra = (d.valor / maximo) * alturaPlot;
      const y = padArriba + alturaPlot - alturaBarra;

      /* Riel de fondo */
      ctx.fillStyle = 'rgba(148, 163, 184, 0.13)';
      Chart._roundRect(ctx, x, padArriba, anchoBarra, alturaPlot, 6);
      ctx.fill();

      /* Barra de color */
      const hVisible = Math.max(alturaBarra, d.valor > 0 ? 4 : 0);
      if (hVisible > 0) {
        ctx.fillStyle = COLOR_ESTADO[d.estado] || '#6366f1';
        Chart._roundRect(ctx, x, padArriba + alturaPlot - hVisible, anchoBarra, hVisible, 6);
        ctx.fill();
      }

      /* Valor encima de la barra */
      ctx.fillStyle = colorTexto;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(String(d.valor), x + anchoBarra / 2, Math.max(12, y - 8));

      /* Etiqueta del estado debajo */
      Chart._ajustarFuente(ctx, d.estado, anchoBarra + separacion - 2, 11, 8);
      ctx.fillStyle = colorTexto;
      ctx.fillText(d.estado, x + anchoBarra / 2, alto - 8);
    });

    /* Accesibilidad: descripción textual del gráfico */
    const resumenTexto = datos.map((d) => `${d.estado}: ${d.valor}`).join(', ');
    this.canvas.setAttribute(
      'aria-label',
      `Gráfico de barras de títulos por estado. ${resumenTexto}.`
    );
  },

  _ajustarFuente(ctx, texto, anchoMax, tamInicial, tamMinimo) {
    let tam = tamInicial;
    ctx.font = `${tam}px ui-sans-serif, system-ui, sans-serif`;
    while (ctx.measureText(texto).width > anchoMax && tam > tamMinimo) {
      tam -= 0.5;
      ctx.font = `${tam}px ui-sans-serif, system-ui, sans-serif`;
    }
  },

  _roundRect(ctx, x, y, w, h, r) {
    const radio = Math.max(0, Math.min(r, w / 2, h / 2));
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radio);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + radio, y);
    ctx.arcTo(x + w, y,       x + w, y + h, radio);
    ctx.arcTo(x + w, y + h,   x,     y + h, radio);
    ctx.arcTo(x,     y + h,   x,     y,     radio);
    ctx.arcTo(x,     y,       x + w, y,     radio);
    ctx.closePath();
  }
};

/* ---------------------------------------------------------
   7. TEMA — modo oscuro / claro persistente
   --------------------------------------------------------- */
const Tema = {
  iniciar() {
    let guardado = null;
    try {
      guardado = window.localStorage.getItem(CLAVE_TEMA);
    } catch (error) {
      console.warn('[SerieTrack] No se pudo leer el tema guardado:', error);
    }
    this.aplicar(guardado === 'light' ? 'light' : 'dark');
  },

  aplicar(tema) {
    document.documentElement.dataset.theme = tema;
    const boton = Utils.$('#btn-theme');
    if (boton) {
      boton.textContent = tema === 'dark' ? '🌙' : '☀️';
      boton.setAttribute(
        'aria-label',
        tema === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'
      );
    }
    if (Chart.canvas) Chart.programar();
  },

  alternar() {
    const actual = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    this.aplicar(actual);
    try {
      window.localStorage.setItem(CLAVE_TEMA, actual);
    } catch (error) {
      console.warn('[SerieTrack] No se pudo guardar el tema:', error);
    }
  }
};

/* ---------------------------------------------------------
   8. RENDER — pintado del DOM
   --------------------------------------------------------- */
const Render = {
  estadisticas(resumen) {
    Utils.$('#stat-total').textContent         = String(resumen.total);
    Utils.$('#stat-series-term').textContent   = String(resumen.seriesTerminadas);
    Utils.$('#stat-episodios').textContent     = String(resumen.episodiosVistos);
    Utils.$('#stat-horas').textContent         = `${Utils.fmt(resumen.horas, 1)} h`;
    Utils.$('#stat-dias').textContent          = `≈ ${Utils.fmt(resumen.dias, 2)} días`;

    const valorPromedio = Utils.$('#stat-promedio');
    const detallePromedio = Utils.$('#stat-promedio-detalle');

    if (resumen.calificados > 0) {
      valorPromedio.textContent = `${Utils.fmt(resumen.promedio, 1)} / 10`;
      detallePromedio.textContent =
        `${resumen.calificados} título${resumen.calificados === 1 ? '' : 's'} con calificación`;
    } else {
      valorPromedio.textContent = '—';
      detallePromedio.textContent = 'Sin calificaciones registradas';
    }
  },

  tarjetas(items, totalBiblioteca) {
    const grid    = Utils.$('#cards-grid');
    const vacio   = Utils.$('#empty-state');
    const contador = Utils.$('#results-count');

    contador.textContent =
      items.length === 1 ? '1 título' : `${items.length} títulos`;

    if (items.length === 0) {
      grid.innerHTML = '';
      vacio.hidden = false;
      Utils.$('#empty-title').textContent =
        totalBiblioteca === 0 ? 'Tu biblioteca está vacía' : 'Sin resultados';
      Utils.$('#empty-text').textContent =
        totalBiblioteca === 0
          ? 'Añade tu primer título con el formulario o carga los datos demo para explorar la aplicación.'
          : 'Ningún título coincide con los filtros activos. Prueba a limpiarlos.';
      return;
    }

    vacio.hidden = true;
    grid.innerHTML = items.map((item) => Render._tarjeta(item)).join('');
  },

  _tarjeta(item) {
    const progreso   = Calc.progreso(item);
    const minutos    = Calc.minutosInvertidos(item);
    const esSerie    = item.tipo === 'Serie';
    const enCurso    = item.estado === 'Viendo';
    const puedeSumar = esSerie && enCurso && item.episodiosVistos < item.episodiosTotales;

    const calificacionTxt =
      item.calificacion > 0 ? `${Utils.fmt(item.calificacion, 1)} / 10` : 'Sin calificar';

    const unidad = esSerie ? 'episodios' : 'visionados';
    const duracionUnidad = esSerie ? 'ep' : 'peli';

    return `
      <article class="card" data-id="${Utils.esc(item.id)}" data-estado="${Utils.esc(item.estado)}">
        <header class="card__head">
          <h3 class="card__title" title="${Utils.esc(item.titulo)}">${Utils.esc(item.titulo)}</h3>
          <span class="badge badge--estado" data-estado="${Utils.esc(item.estado)}">${Utils.esc(item.estado)}</span>
        </header>

        <div class="card__tags">
          <span class="tag">${esSerie ? '📺 Serie' : '🎞️ Película'}</span>
          ${esSerie ? `<span class="tag">T${item.temporada}</span>` : ''}
          <span class="tag">${item.duracion} min/${duracionUnidad}</span>
        </div>

        <div
          class="progress"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${Utils.fmt(progreso, 1)}"
          aria-label="Progreso de ${Utils.esc(item.titulo)}"
        >
          <div class="progress__fill" style="width:${Utils.fmt(progreso, 1)}%"></div>
        </div>

        <div class="card__row">
          <span class="card__episodes">${item.episodiosVistos} / ${item.episodiosTotales} ${unidad}</span>
          <strong class="card__percent">${Utils.fmt(progreso, 1)}%</strong>
        </div>

        <div class="card__row card__row--muted">
          <span title="Tiempo invertido">⏱️ ${Calc.duracionLegible(minutos)}</span>
          <span title="Calificación">⭐ ${calificacionTxt}</span>
        </div>

        ${item.notas ? `<p class="card__notes">${Utils.esc(item.notas)}</p>` : ''}

        <footer class="card__actions">
          ${puedeSumar ? '<button type="button" class="btn btn--primary btn--sm" data-action="episode">+1 Episodio</button>' : ''}
          <button type="button" class="btn btn--ghost btn--sm" data-action="edit">Editar</button>
          <button type="button" class="btn btn--danger btn--sm" data-action="delete">Eliminar</button>
        </footer>
      </article>
    `;
  }
};

/* ---------------------------------------------------------
   9. DATOS DEMO — 5 registros verificables
   --------------------------------------------------------- */
const DATOS_DEMO = [
  {
    titulo: 'Breaking Bad',
    tipo: 'Serie',
    estado: 'Terminada',
    temporada: 5,
    episodiosVistos: 62,
    episodiosTotales: 62,
    duracion: 47,
    calificacion: 9.5,
    notas: 'Final perfecto. Serie de referencia.'
  },
  {
    titulo: 'Stranger Things',
    tipo: 'Serie',
    estado: 'Viendo',
    temporada: 4,
    episodiosVistos: 33,
    episodiosTotales: 34,
    duracion: 51,
    calificacion: 8.7,
    notas: 'A un episodio del final de temporada.'
  },
  {
    titulo: 'The Office',
    tipo: 'Serie',
    estado: 'Viendo',
    temporada: 4,
    episodiosVistos: 50,
    episodiosTotales: 201,
    duracion: 22,
    calificacion: 9.0,
    notas: 'Maratón de fondo mientras trabajo.'
  },
  {
    titulo: 'Inception',
    tipo: 'Película',
    estado: 'Terminada',
    temporada: 0,
    episodiosVistos: 1,
    episodiosTotales: 1,
    duracion: 148,
    calificacion: 8.8,
    notas: 'Revisitada en versión original.'
  },
  {
    titulo: 'Dune: Parte Dos',
    tipo: 'Película',
    estado: 'Pendiente',
    temporada: 0,
    episodiosVistos: 0,
    episodiosTotales: 1,
    duracion: 166,
    calificacion: 0,
    notas: 'Reservada para el fin de semana.'
  }
];

/* ---------------------------------------------------------
   10. APP — estado, eventos y orquestación
   --------------------------------------------------------- */
const App = {
  items: [],
  filtros: { texto: '', estado: '', tipo: '' },
  editandoId: null,

  /* ---------- Ciclo de vida ---------- */
  iniciar() {
    Tema.iniciar();
    Chart.init(Utils.$('#chart-estados'));

    this.items = Storage.leer()
      .map((registro) => Schema.normalizar(registro))
      .filter(Boolean);

    this.enlazarEventos();
    this.salirEdicion();
    this.renderizar();
  },

  /* ---------- Suscripción de eventos ---------- */
  enlazarEventos() {
    const form = Utils.$('#form-title');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.guardarDesdeFormulario();
    });

    Utils.$('#btn-cancel').addEventListener('click', () => this.salirEdicion());
    Utils.$('#field-tipo').addEventListener('change', () => this.ajustarPorTipo());
    Utils.$('#field-totales').addEventListener('input', () => this.sincronizarLimites());

    Utils.$('#field-calificacion').addEventListener('input', (e) => {
      Utils.$('#out-calificacion').textContent = Utils.fmt(e.target.value, 1);
    });

    Utils.$('#field-vistos').addEventListener('input', () => {
      const totales = Utils.entero(Utils.$('#field-totales').value, 1);
      const campo = Utils.$('#field-vistos');
      if (Utils.entero(campo.value, 0) > totales) campo.value = String(totales);
    });

    Utils.$('#filter-search').addEventListener('input', (e) => {
      this.filtros.texto = e.target.value;
      this.renderizarLista();
    });
    Utils.$('#filter-estado').addEventListener('change', (e) => {
      this.filtros.estado = e.target.value;
      this.renderizarLista();
    });
    Utils.$('#filter-tipo').addEventListener('change', (e) => {
      this.filtros.tipo = e.target.value;
      this.renderizarLista();
    });
    Utils.$('#btn-reset-filters').addEventListener('click', () => this.limpiarFiltros());

    Utils.$('#cards-grid').addEventListener('click', (e) => this.delegarTarjeta(e));

    Utils.$('#btn-demo').addEventListener('click', () => this.cargarDemo());
    Utils.$('#btn-export').addEventListener('click', () => this.exportar());
    Utils.$('#btn-import').addEventListener('click', () => Utils.$('#file-import').click());
    Utils.$('#file-import').addEventListener('change', (e) => this.importar(e));
    Utils.$('#btn-clear').addEventListener('click', () => this.borrarTodo());
    Utils.$('#btn-theme').addEventListener('click', () => Tema.alternar());
  },

  /* ---------- Persistencia + repintado ---------- */
  persistir() {
    Storage.escribir(this.items);
  },

  renderizar() {
    const resumen = Calc.resumen(this.items);
    Render.estadisticas(resumen);
    Chart.dibujar(resumen.distribucion);
    this.renderizarLista();
  },

  renderizarLista() {
    const filtrados = this.aplicarFiltros();
    Render.tarjetas(filtrados, this.items.length);
  },

  /* ---------- Filtros combinables ---------- */
  aplicarFiltros() {
    const { texto, estado, tipo } = this.filtros;
    const consulta = texto.trim().toLowerCase();

    return this.items.filter((item) => {
      if (estado && item.estado !== estado) return false;
      if (tipo && item.tipo !== tipo) return false;
      if (consulta) {
        const heno = `${item.titulo} ${item.notas}`.toLowerCase();
        if (!heno.includes(consulta)) return false;
      }
      return true;
    });
  },

  limpiarFiltros() {
    this.filtros = { texto: '', estado: '', tipo: '' };
    Utils.$('#filter-search').value = '';
    Utils.$('#filter-estado').value = '';
    Utils.$('#filter-tipo').value = '';
    this.renderizarLista();
  },

  /* ---------- Formulario ---------- */
  limpiarErrores() {
    Utils.$$('.field__error').forEach((el) => { el.textContent = ''; });
    Utils.$$('.field input, .field select').forEach((el) => {
      el.removeAttribute('aria-invalid');
    });
  },

  mostrarErrores(errores) {
    this.limpiarErrores();
    Object.entries(errores).forEach(([campo, mensaje]) => {
      const salida = Utils.$(`[data-error-for="${campo}"]`);
      if (salida) salida.textContent = mensaje;
      const input = Utils.$(`#field-${campo}`);
      if (input) input.setAttribute('aria-invalid', 'true');
    });

    const primero = Utils.$('.field input[aria-invalid="true"], .field select[aria-invalid="true"]');
    if (primero) primero.focus();
  },

  leerFormulario() {
    return {
      titulo: Utils.$('#field-titulo').value.trim(),
      tipo: Utils.$('#field-tipo').value,
      estado: Utils.$('#field-estado').value,
      temporada: Utils.entero(Utils.$('#field-temporada').value, 0),
      episodiosVistos: Utils.entero(Utils.$('#field-vistos').value, 0),
      episodiosTotales: Utils.entero(Utils.$('#field-totales').value, 0),
      duracion: Utils.entero(Utils.$('#field-duracion').value, 0),
      calificacion: Utils.num(Utils.$('#field-calificacion').value, 0),
      notas: Utils.$('#field-notas').value.trim()
    };
  },

  guardarDesdeFormulario() {
    const datos = this.leerFormulario();
    const errores = Schema.validar(datos);

    if (Object.keys(errores).length > 0) {
      this.mostrarErrores(errores);
      Toast.mostrar('Revisa los campos marcados en rojo.', 'error');
      return;
    }

    this.limpiarErrores();

    if (this.editandoId) {
      const indice = this.items.findIndex((i) => i.id === this.editandoId);
      if (indice === -1) {
        Toast.mostrar('El título ya no existe.', 'error');
        this.salirEdicion();
        return;
      }
      const actualizado = Schema.normalizar({
        ...this.items[indice],
        ...datos,
        id: this.editandoId
      });
      this.items[indice] = actualizado;
      Toast.mostrar(`"${actualizado.titulo}" actualizado.`, 'ok');
    } else {
      const nuevo = Schema.normalizar({ ...datos, id: Utils.uid(), creadoEn: Date.now() });
      this.items.unshift(nuevo);
      Toast.mostrar(`"${nuevo.titulo}" añadido a la biblioteca.`, 'ok');
    }

    this.persistir();
    this.salirEdicion();
    this.renderizar();
  },

  ajustarPorTipo() {
    const esPelicula = Utils.$('#field-tipo').value === 'Película';
    const totales  = Utils.$('#field-totales');
    const temporada = Utils.$('#field-temporada');
    const vistos   = Utils.$('#field-vistos');

    if (esPelicula) {
      totales.value = '1';
      temporada.value = '0';
      if (Utils.entero(vistos.value, 0) > 1) vistos.value = '1';
      totales.disabled = true;
      temporada.disabled = true;
      vistos.max = '1';
    } else {
      totales.disabled = false;
      temporada.disabled = false;
      vistos.removeAttribute('max');
      if (Utils.entero(totales.value, 0) < 1) totales.value = '10';
      if (Utils.entero(temporada.value, 0) < 1) temporada.value = '1';
    }
    this.sincronizarLimites();
  },

  sincronizarLimites() {
    const totales = Utils.entero(Utils.$('#field-totales').value, 1);
    const campoVistos = Utils.$('#field-vistos');
    campoVistos.max = String(Math.max(1, totales));
    if (Utils.entero(campoVistos.value, 0) > totales) {
      campoVistos.value = String(totales);
    }
  },

  salirEdicion() {
    this.editandoId = null;
    Utils.$('#form-title').reset();
    Utils.$('#field-id').value = '';
    Utils.$('#field-tipo').value = 'Serie';
    Utils.$('#field-estado').value = 'Pendiente';
    Utils.$('#field-temporada').value = '1';
    Utils.$('#field-duracion').value = '45';
    Utils.$('#field-vistos').value = '0';
    Utils.$('#field-totales').value = '10';
    Utils.$('#field-calificacion').value = '0';
    Utils.$('#out-calificacion').textContent = '0.0';
    Utils.$('#field-notas').value = '';
    Utils.$('#form-heading').textContent = 'Añadir título';
    Utils.$('#btn-submit').textContent = 'Añadir título';
    Utils.$('#btn-cancel').hidden = true;
    this.limpiarErrores();
    this.ajustarPorTipo();
  },

  /* ---------- Acciones sobre tarjetas ---------- */
  delegarTarjeta(evento) {
    const boton = evento.target.closest('button[data-action]');
    if (!boton) return;
    const tarjeta = boton.closest('.card');
    if (!tarjeta) return;

    const id = tarjeta.dataset.id;
    const accion = boton.dataset.action;

    if (accion === 'episode') this.sumarEpisodio(id);
    else if (accion === 'edit') this.editar(id);
    else if (accion === 'delete') this.eliminar(id);
  },

  /**
   * Acción rápida "+1 Episodio".
   * Incrementa vistos, recalcula el % y, si alcanza el total,
   * cambia automáticamente el estado a "Terminada".
   */
  sumarEpisodio(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;

    if (item.tipo !== 'Serie') {
      Toast.mostrar('La acción "+1 Episodio" solo aplica a series.', 'error');
      return;
    }
    if (item.episodiosVistos >= item.episodiosTotales) {
      Toast.mostrar('Este título ya está completo.', 'error');
      return;
    }

    item.episodiosVistos += 1;
    let mensaje;

    if (item.episodiosVistos >= item.episodiosTotales) {
      item.episodiosVistos = item.episodiosTotales;
      item.estado = 'Terminada';
      mensaje = `🎉 "${item.titulo}" completada y marcada como Terminada.`;
    } else {
      mensaje = `+1 episodio en "${item.titulo}" (${item.episodiosVistos}/${item.episodiosTotales}).`;
    }

    this.persistir();
    this.renderizar();
    Toast.mostrar(mensaje, 'ok');
  },

  editar(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;

    this.editandoId = id;
    Utils.$('#field-id').value = id;
    Utils.$('#field-titulo').value = item.titulo;
    Utils.$('#field-tipo').value = item.tipo;
    Utils.$('#field-estado').value = item.estado;
    Utils.$('#field-temporada').value = String(item.temporada);
    Utils.$('#field-duracion').value = String(item.duracion);
    Utils.$('#field-vistos').value = String(item.episodiosVistos);
    Utils.$('#field-totales').value = String(item.episodiosTotales);
    Utils.$('#field-calificacion').value = String(item.calificacion);
    Utils.$('#out-calificacion').textContent = Utils.fmt(item.calificacion, 1);
    Utils.$('#field-notas').value = item.notas;

    Utils.$('#form-heading').textContent = 'Editar título';
    Utils.$('#btn-submit').textContent = 'Guardar cambios';
    Utils.$('#btn-cancel').hidden = false;

    this.limpiarErrores();
    this.ajustarPorTipo();
    Utils.$('#field-titulo').focus();
    Utils.$('#form-title').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  eliminar(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (!window.confirm(`¿Eliminar "${item.titulo}" de la biblioteca?`)) return;

    this.items = this.items.filter((i) => i.id !== id);
    if (this.editandoId === id) this.salirEdicion();

    this.persistir();
    this.renderizar();
    Toast.mostrar(`"${item.titulo}" eliminado.`, 'ok');
  },

  /* ---------- Datos demo ---------- */
  cargarDemo() {
    if (
      this.items.length > 0 &&
      !window.confirm('Esto reemplazará tu biblioteca actual por 5 títulos de demostración. ¿Continuar?')
    ) {
      return;
    }

    const ahora = Date.now();
    this.items = DATOS_DEMO.map((registro, indice) =>
      Schema.normalizar({ ...registro, id: Utils.uid(), creadoEn: ahora + indice })
    );

    this.persistir();
    this.salirEdicion();
    this.renderizar();
    Toast.mostrar('Datos demo cargados: 5 títulos.', 'ok');
  },

  /* ---------- Exportar / Importar ---------- */
  exportar() {
    if (this.items.length === 0) {
      Toast.mostrar('No hay títulos para exportar.', 'error');
      return;
    }

    const paquete = {
      app: 'SerieTrack',
      version: 1,
      exportadoEn: new Date().toISOString(),
      titulos: this.items
    };

    const fecha = new Date().toISOString().slice(0, 10);
    Utils.descargar(
      `serietrack-backup-${fecha}.json`,
      JSON.stringify(paquete, null, 2),
      'application/json'
    );
    Toast.mostrar('Respaldo JSON exportado correctamente.', 'ok');
  },

  importar(evento) {
    const input = evento.target;
    const archivo = input.files && input.files[0];
    if (!archivo) return;

    const lector = new FileReader();

    lector.onload = () => {
      try {
        const crudo = JSON.parse(String(lector.result));
        const lista = Array.isArray(crudo)
          ? crudo
          : Array.isArray(crudo.titulos)
            ? crudo.titulos
            : null;

        if (!lista) {
          throw new TypeError('El archivo no contiene una lista de títulos válida.');
        }

        const normalizados = lista.map((r) => Schema.normalizar(r)).filter(Boolean);
        if (normalizados.length === 0) {
          throw new TypeError('No se encontraron títulos válidos en el archivo.');
        }

        if (
          !window.confirm(
            `Se importarán ${normalizados.length} título(s) y se reemplazará la biblioteca actual. ¿Continuar?`
          )
        ) {
          return;
        }

        this.items = normalizados;
        this.persistir();
        this.salirEdicion();
        this.renderizar();
        Toast.mostrar(`Importados ${normalizados.length} título(s) correctamente.`, 'ok');
      } catch (error) {
        console.error('[SerieTrack] Error al importar JSON:', error);
        Toast.mostrar(`No se pudo importar: ${error.message}`, 'error');
      } finally {
        input.value = '';
      }
    };

    lector.onerror = () => {
      Toast.mostrar('Error al leer el archivo seleccionado.', 'error');
      input.value = '';
    };

    lector.readAsText(archivo);
  },

  /* ---------- Borrado total ---------- */
  borrarTodo() {
    if (this.items.length === 0) {
      Toast.mostrar('La biblioteca ya está vacía.', 'error');
      return;
    }
    if (!window.confirm('Se eliminarán TODOS los títulos guardados. Esta acción no se puede deshacer.')) {
      return;
    }

    this.items = [];
    this.persistir();
    this.salirEdicion();
    this.limpiarFiltros();
    this.renderizar();
    Toast.mostrar('Biblioteca vaciada.', 'ok');
  }
};

/* ---------------------------------------------------------
   11. ARRANQUE
   --------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => App.iniciar());
