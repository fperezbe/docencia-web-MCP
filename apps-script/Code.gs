/**
 * DocenciaWeb → Google Sheets (Google Apps Script)
 * ------------------------------------------------
 * No guarda tu clave de DocenciaWeb: usa una API key personal del servidor,
 * guardada en las propiedades del script (nunca en el código).
 *
 * Configuración:
 *   1. Crea la key en /api-keys (o con POST /api/keys). Puedes limitarla a cursos
 *      y periodos, por ejemplo { "cursos": ["ENMES2505"], "periodos": ["20262"] };
 *      vacío = todos. Copia el campo "clave" (empieza con dwmcp_); no se vuelve a mostrar.
 *   2. Edita CONFIG_URL y CONFIG_API_KEY aquí abajo y ejecuta `configurar` UNA vez
 *      desde el editor de Apps Script. (También puedes cargarlas a mano en
 *      Project Settings → Script Properties con los nombres DOCENCIA_API_URL y
 *      DOCENCIA_API_KEY.)
 *   3. Recarga la hoja: aparece el menú "DocenciaWeb". Usa "Probar conexión".
 *
 * Seguridad:
 *   - La key queda en Script Properties: cualquier editor del script puede verla.
 *     Comparte la planilla/script solo con quien deba poder extraer datos.
 *   - No dejes la key en el código después de configurar: bórrala de CONFIG_API_KEY.
 *     Revócala con DELETE /api/keys/:id.
 */

const PROP_URL = 'DOCENCIA_API_URL';
const PROP_KEY = 'DOCENCIA_API_KEY';

// Edita estos dos valores y ejecuta `configurar` una vez. Luego puedes borrar la key
// de aquí: queda guardada en las propiedades privadas del script.
const CONFIG_URL = 'https://TU-APP.vercel.app';
const CONFIG_API_KEY = 'dwmcp_PEGA_TU_KEY_AQUI';

function configurar() {
  guardarConfiguracion(CONFIG_URL, CONFIG_API_KEY);
  SpreadsheetApp.getActive().toast('Configuración guardada.');
}

function guardarConfiguracion(url, apiKey) {
  PropertiesService.getScriptProperties().setProperties({
    [PROP_URL]: String(url).replace(/\/+$/, ''),
    [PROP_KEY]: String(apiKey).trim(),
  });
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('DocenciaWeb')
    .addItem('Importar alumnos…', 'promptAlumnos')
    .addItem('Importar justificaciones…', 'promptJustificaciones')
    .addItem('Listar cursos', 'listarCursosEnHoja')
    .addSeparator()
    .addItem('Probar conexión', 'probarConexion')
    .addToUi();
}

// Diagnóstico: valida URL + API key y si la cuenta de DocenciaWeb está conectada.
function probarConexion() {
  const datos = pedir_('/api/v1/estado', {});
  const mensaje = datos.conectado
    ? 'OK: conectado a DocenciaWeb como ' + datos.usuario + '.'
    : 'La API key funciona, pero falta conectar tu cuenta de DocenciaWeb en el navegador.';
  SpreadsheetApp.getActive().toast(mensaje, 'DocenciaWeb', 8);
  return datos;
}

// --- Acciones del menú -------------------------------------------------------

function promptAlumnos() {
  const datos = pedirParametros_('Importar alumnos');
  if (!datos) return;
  importarAlumnos(datos.curso, datos.periodo, datos.secciones);
}

function promptJustificaciones() {
  const datos = pedirParametros_('Importar justificaciones');
  if (!datos) return;
  importarJustificaciones(datos.curso, datos.periodo, datos.secciones);
}

function pedirParametros_(titulo) {
  const ui = SpreadsheetApp.getUi();
  const curso = ui.prompt(titulo, 'Código del curso (ej. EC2106):', ui.ButtonSet.OK_CANCEL);
  if (curso.getSelectedButton() !== ui.Button.OK) return null;

  const periodo = ui.prompt(titulo, 'Periodo de 5 dígitos (ej. 20262):', ui.ButtonSet.OK_CANCEL);
  if (periodo.getSelectedButton() !== ui.Button.OK) return null;

  const secciones = ui.prompt(titulo, 'Secciones separadas por coma (ej. 1,2):', ui.ButtonSet.OK_CANCEL);
  if (secciones.getSelectedButton() !== ui.Button.OK) return null;

  return {
    curso: curso.getResponseText().trim().toUpperCase(),
    periodo: periodo.getResponseText().trim(),
    secciones: secciones.getResponseText().trim(),
  };
}

// --- Funciones invocables desde otras macros ---------------------------------

function listarCursosEnHoja() {
  const datos = pedir_('/api/v1/cursos', {});
  escribirHoja_('Cursos', ['Código', 'Sección', 'Periodo'], datos.cursos.map(function (c) {
    return [c.catedra, c.seccion, c.periodo];
  }));
}

function importarAlumnos(curso, periodo, secciones) {
  const datos = pedir_('/api/v1/alumnos', {
    curso: curso,
    periodo: periodo,
    secciones: secciones,
  });
  escribirHoja_('Alumnos ' + datos.curso, ['Sección', 'RUT', 'Código alumno', 'Nombre', 'Repitencias', 'Carrera'],
    datos.filas.map(function (a) {
      return [a.seccion, a.rut, a.codigoAlumno, a.nombre, a.repitencias, a.carrera];
    }));
  SpreadsheetApp.getActive().toast('Alumnos importados: ' + datos.total);
  return datos;
}

function importarJustificaciones(curso, periodo, secciones) {
  const datos = pedir_('/api/v1/justificaciones', {
    curso: curso,
    periodo: periodo,
    secciones: secciones,
  });
  escribirHoja_('Justificaciones ' + datos.curso,
    ['Sección', 'Nombre', 'RUT', 'Tipo', 'Desde', 'Hasta', 'Observaciones'],
    datos.filas.map(function (j) {
      return [j.seccion, j.nombre, j.rut, j.tipo, j.desde, j.hasta, j.observaciones];
    }));
  SpreadsheetApp.getActive().toast('Justificaciones importadas: ' + datos.total);
  return datos;
}

// --- Infraestructura ---------------------------------------------------------

function pedir_(ruta, params) {
  const props = PropertiesService.getScriptProperties();
  const base = props.getProperty(PROP_URL);
  const apiKey = props.getProperty(PROP_KEY);
  if (!base || !apiKey) {
    throw new Error('Falta configuración. Ejecuta guardarConfiguracion(url, apiKey).');
  }

  const query = Object.keys(params)
    .filter(function (k) { return params[k] !== '' && params[k] !== null && params[k] !== undefined; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');

  const res = UrlFetchApp.fetch(base + ruta + (query ? '?' + query : ''), {
    method: 'get',
    headers: { Authorization: 'Bearer ' + apiKey },
    muteHttpExceptions: true,
  });

  const codigo = res.getResponseCode();
  const texto = res.getContentText();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    throw new Error('Respuesta no JSON (HTTP ' + codigo + '): ' + texto.slice(0, 300));
  }
  if (codigo < 200 || codigo >= 300) {
    throw new Error((datos && datos.error) || ('HTTP ' + codigo));
  }
  return datos;
}

function escribirHoja_(nombre, encabezados, filas) {
  const libro = SpreadsheetApp.getActive();
  let hoja = libro.getSheetByName(nombre);
  if (!hoja) hoja = libro.insertSheet(nombre);
  hoja.clearContents();
  hoja.getRange(1, 1, 1, encabezados.length)
    .setValues([encabezados])
    .setFontWeight('bold');
  if (filas.length) {
    hoja.getRange(2, 1, filas.length, encabezados.length).setValues(filas);
  }
  hoja.setFrozenRows(1);
  hoja.autoResizeColumns(1, encabezados.length);
}
