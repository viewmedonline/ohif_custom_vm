/** @type {AppTypes.Config} */
window.config = {
  routerBasename: '/',
  showStudyList: true,
  extensions: [],
  modes: [],
  customizationService: {
    'studyBrowser.studyMode': 'primary',
  },
  // Desactivar mensajes de advertencia
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: false,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  // Eliminar mensaje de "investigational use"
  investigationalUseDialog: {
    option: 'never',
  },

  // Logo personalizado ViewMed
  whiteLabeling: {
    createLogoComponentFn: function (React) {
      return React.createElement(
        'a',
        {
          href: '/',
          target: '_self',
          rel: 'noopener noreferrer',
          className: 'inline-flex items-center',
        },
        React.createElement('img', {
          src: './logo.png',
          alt: 'ViewMed',
          style: { height: '32px', width: 'auto' },
        })
      );
    },
  },

  // ============================================================
  // Optimizaciones de rendimiento — balanceadas para proxy con cache
  // ============================================================
  //
  // El proxy nginx cachea frames y metadata, pero saturarlo con
  // requests excesivos degrada la experiencia para todos los usuarios.
  // Estos valores priorizan la fluidez percibida sobre el throughput bruto.
  // ============================================================
  maxNumberOfWebWorkers: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4,
  maxNumRequests: {
    interaction: 30, // Aumentado para prioridad en estudios grandes
    thumbnail: 15, // Thumbnails de la lista
    prefetch: 15, // Prefetch en background un poco más agresivo
  },

  // Lazy loading habilitado — carga series bajo demanda, no todas de golpe
  // Esto reduce el tiempo inicial de "click a estudio → primera imagen"
  // Carga toda la metadata al inicio para que el prefetcher pueda descargar todo el estudio
  enableStudyLazyLoad: false,

  // Interleaved loading: carga desde el centro hacia afuera
  // El usuario ve la imagen central primero (mejor percepción de velocidad)
  interleaveCenter: true,

  // Precarga de TODAS las series al abrir estudio
  // Mientras el radiólogo ve la primera serie, las demás se cargan en background
  studyPrefetcher: {
    enabled: true,
    displaySetsCount: 999, // Todas las series (no solo 3)
    maxNumPrefetchRequests: 15, // Aumentado para mayor velocidad de descarga en segundo plano
    order: 'closest',
  },

  // Handler de errores HTTP para evitar crashes
  httpErrorHandler: error => {
    // El error puede venir con diferentes estructuras
    const status = error?.status || error?.statusCode || error?.status_code;
    const url = error?.url || error?.config?.url || 'unknown';

    // Silenciar errores comunes del PACS que no son críticos
    if (status === 404 || status === 410) {
      return;
    }
    if (status === 403) {
      console.warn('[VIEWMED] Acceso denegado:', url);
      return;
    }
    // Loguear errores HTTP pero no crashear
    console.warn('[VIEWMED] Error HTTP:', status, url);
  },

  defaultDataSourceName: 'viewmed',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'viewmed',
      configuration: {
        friendlyName: 'VIEWMED PACS',
        name: 'VIEWMED',
        // Mismo origen: el servidor del visor reenvía /pacs al proxy nginx.
        wadoUriRoot: '/pacs/aets/VIEWMED/wado',
        qidoRoot: '/pacs/aets/VIEWMED/rs',
        wadoRoot: '/pacs/aets/VIEWMED/rs',
        qidoSupportsIncludeField: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        supportsFuzzyMatching: true,
        supportsWildcard: true,
        dicomUploadEnabled: true,
        // No pedir singlepart — el PACS sirve multipart y el proxy lo cachea bien
        omitQuotationForMultipartRequest: true,
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomjson',
      sourceName: 'dicomjson',
      configuration: {
        friendlyName: 'dicom json',
        name: 'json',
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
      sourceName: 'dicomlocal',
      configuration: {
        friendlyName: 'dicom local',
      },
    },
  ],
  studyListFunctionsEnabled: false,
};

// Filtrar mensajes ERMF ruidosos de Cornerstone3D.
// Bug en @cornerstonejs/core: ERMF=1 es válido (sin magnificación) pero el código
// no maneja el caso 1 > 1 === false && 1 === true === false, cae al console.error.
// Se filtra tanto warn como error porque la librería usa console.error directamente.
(function () {
  function isErmfNoise(args) {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    return msg.includes('Illegal ERMF') || msg.includes('ERMF value');
  }

  const _originalWarn = console.warn.bind(console);
  console.warn = function (...args) {
    if (isErmfNoise(args)) return;
    _originalWarn.apply(console, args);
  };

  const _originalError = console.error.bind(console);
  console.error = function (...args) {
    if (isErmfNoise(args)) return;
    _originalError.apply(console, args);
  };
})();

// Interceptar rechazos de promesas XHR antes de que lleguen al overlay de React/webpack
window.addEventListener(
  'unhandledrejection',
  function (event) {
    const reason = event.reason;
    const isXHRError =
      reason instanceof XMLHttpRequest ||
      (reason && typeof reason === 'object' && 'status' in reason && 'statusText' in reason);

    if (isXHRError) {
      const status = reason.status;
      if (status !== 404 && status !== 410 && status !== 403) {
        console.warn('[VIEWMED] XHR error interceptado, status:', status);
      }
      event.preventDefault();
      event.stopImmediatePropagation(); // impide que el handler de webpack/React se ejecute
    }
  },
  true // capture phase: se ejecuta antes que cualquier otro handler
);
