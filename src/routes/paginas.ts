import { Router } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";

// Páginas mínimas del flujo OAuth (ChatGPT / Claude Desktop).
// El plugin redirige aquí con la query de autorización firmada:
//  - /sign-in?...  -> login con usuario+clave y vuelta a /api/auth/oauth2/authorize.
//  - /consent?...  -> muestra cliente y scopes; al aprobar llama a POST /oauth2/consent
//                     (con oauth_query) y sigue la url resultante.

const CSS =
  "*{box-sizing:border-box}" +
  "body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#0a2f8a;color:#1a1a1a;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:24px 16px;margin:0}" +
  ".tarjeta{background:#fff;border-radius:8px;padding:52px 48px 26px;max-width:440px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.35)}" +
  "h1{font-size:20px;margin:0 0 6px;text-align:center;color:#0a2f8a;font-weight:600}" +
  ".sub{color:#555;font-size:14px;margin:0 0 8px;text-align:center}" +
  ".campo{margin:30px 0 0}" +
  ".etiqueta{display:flex;align-items:center;gap:6px;color:#0a2f8a;font-size:15px;font-weight:500}" +
  ".etiqueta svg{width:20px;height:20px;fill:#0a2f8a;flex-shrink:0}" +
  "input{width:100%;border:0;border-bottom:1px solid #d5d5d5;padding:10px 0;font-size:20px;outline:none;background:transparent;border-radius:0}" +
  "input::placeholder{color:#9e9e9e}" +
  "input:focus{border-bottom-color:#0a2f8a}" +
  "button{width:100%;margin-top:26px;padding:16px;border:0;border-radius:2px;font-size:15px;font-weight:500;letter-spacing:.5px;text-transform:uppercase;cursor:pointer}" +
  ".primario{background:#0a2f8a;color:#fff}" +
  ".primario:hover{background:#082a7d}" +
  ".peligro{background:#fff;color:#a00;border:1px solid #a00;margin-top:8px;text-transform:none;letter-spacing:normal;padding:12px}" +
  "button:disabled{opacity:.6;cursor:wait}" +
  ".error{background:#fdecec;color:#a00;border-radius:4px;padding:10px;font-size:14px;margin-top:12px;display:none;text-transform:none;letter-spacing:normal}" +
  ".ok{background:#e8f5e9;color:#1b5e20;border-radius:4px;padding:10px;font-size:14px;margin-top:12px;display:none;text-transform:none;letter-spacing:normal}" +
  ".ambitos{background:#f4f6f8;border-radius:4px;padding:10px 14px;font-size:14px;margin:12px 0;text-transform:none;letter-spacing:normal}" +
  ".mono{font-family:ui-monospace,monospace;font-size:13px;word-break:break-all}" +
  ".pie{text-align:center;margin-top:24px;color:#555;font-size:14px;text-transform:none;letter-spacing:normal}" +
  ".pie .firma{margin-top:14px;color:#777;font-size:14px}" +
  ".pie a{color:#0a2f8a}" +
  ".tarjeta.ancha{max-width:860px;margin:24px 0}" +
  ".ancha h1,.ancha .sub{text-align:left}" +
  "h2{font-size:16px;margin:28px 0 8px;color:#0a2f8a}" +
  ".fila{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end}" +
  ".fila .campo{flex:1;min-width:180px;margin-top:14px}" +
  "select{width:100%;border:0;border-bottom:1px solid #d5d5d5;padding:12px 0;font-size:16px;background:transparent;outline:none;border-radius:0}" +
  "button.crear{width:auto;margin-top:16px;padding:12px 22px}" +
  ".tabla-wrap{overflow-x:auto;margin-top:8px}" +
  "table{width:100%;border-collapse:collapse;font-size:14px}" +
  "th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:middle;white-space:nowrap}" +
  "th{color:#555;font-weight:500;font-size:13px}" +
  ".badge{display:inline-block;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:600}" +
  ".badge.activa{background:#e8f5e9;color:#1b5e20}" +
  ".badge.revocada{background:#fdecec;color:#a00}" +
  ".badge.expirada{background:#fff3e0;color:#8a4b00}" +
  ".nueva{background:#eef4ff;border:1px solid #b8ccf5;border-radius:6px;padding:16px;margin-top:18px;display:none}" +
  ".nueva p{margin:0 0 10px;font-size:14px}" +
  ".clave{display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
  ".clave code{flex:1;min-width:220px;background:#fff;border:1px solid #ccd6ea;border-radius:4px;padding:10px;font-family:ui-monospace,monospace;font-size:13px;word-break:break-all}" +
  "button.mini{width:auto;margin:0;padding:7px 10px;font-size:12px;text-transform:none;letter-spacing:normal;background:#fff;color:#0a2f8a;border:1px solid #0a2f8a;border-radius:4px}" +
  "button.mini:hover{background:#eef4ff}" +
  "button.mini.peligro{color:#a00;border-color:#a00}" +
  "button.mini.peligro:hover{background:#fdecec}" +
  "button:disabled{opacity:.6;cursor:not-allowed}" +
  ".vacio{color:#666;font-size:14px;padding:14px 0}" +
  ".mono{font-family:ui-monospace,monospace;font-size:13px}";

function pagina(titulo: string, cuerpo: string, clase = ""): string {
  return (
    "<!doctype html><html lang='es'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>" + titulo + "</title>" +
    "<style>" + CSS + "</style></head><body><div class='tarjeta " + clase + "'>" + cuerpo + "</div></body></html>"
  );
}

function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

const JS_COMUN =
  "function mostrarError(m){var e=document.getElementById('error');e.style.display='block';e.textContent=m;}" +
  "function mostrarOk(m){var e=document.getElementById('ok');e.style.display='block';e.textContent=m;}" +
  "async function leerError(res){try{var d=await res.json();return res.status+' '+(d.message||d.error||d.code||'Error');}catch(e){return res.status+' Error';}}" +
  "async function postJSON(ruta,datos){var res=await fetch(ruta,{method:'POST',credentials:'same-origin'," +
  "headers:{'Content-Type':'application/json'},body:JSON.stringify(datos)});" +
  "if(!res.ok){throw new Error(await leerError(res));}return res.json();}";

const ICONO_USUARIO =
  "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/></svg>";

const ICONO_CLAVE =
  "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z'/></svg>";

function paginaSignIn(): string {
  const cuerpo =
    "<div class='campo'><div class='etiqueta'>" + ICONO_USUARIO + "<span>Usuario</span></div>" +
    "<input id='usuario' type='text' autocomplete='username' placeholder='Nombre de Usuario'></div>" +
    "<div class='campo'><div class='etiqueta'>" + ICONO_CLAVE + "<span>Contrase&ntilde;a</span></div>" +
    "<input id='clave' type='password' autocomplete='current-password' placeholder='**********'></div>" +
    "<button class='primario' id='btn' onclick='entrar()'>Ingresar</button>" +
    "<div class='error' id='error'></div><div class='ok' id='ok'></div>" +
    "<div class='pie'><a href='/api-keys'>Administrar API keys</a><div class='firma'>@fperezbe</div></div>" +
    "<script>" +
    JS_COMUN +
    "async function entrar(){var btn=document.getElementById('btn');btn.disabled=true;try{" +
    "var acc=await postJSON('/api/acceso',{usuario:document.getElementById('usuario').value," +
    "clave:document.getElementById('clave').value});" +
    "await postJSON('/api/auth/sign-in/email',{email:acc.email,password:acc.claveTemporal});" +
    "var q=window.location.search;" +
    "if(q.indexOf('client_id=')>=0){window.location.href='/api/auth/oauth2/authorize'+q;}" +
    "else{var red=new URLSearchParams(q).get('redirect');" +
    "if(red==='/api-keys'){window.location.href=red;}" +
    "else{mostrarOk('Sesi\u00f3n iniciada como '+acc.usuario+'. Ya puedes volver a la aplicaci\u00f3n y continuar.');btn.disabled=false;}}}" +
    "catch(e){mostrarError(e.message);btn.disabled=false;}}" +
    "</script>";
  return pagina("Iniciar sesión", cuerpo);
}

function paginaConsent(): string {
  const cuerpo =
    "<h1>Autorizar aplicaci&oacute;n</h1>" +
    "<p class='sub'>La siguiente aplicaci&oacute;n quiere acceder a tu cuenta.</p>" +
    "<div><b>Aplicaci&oacute;n</b><div class='mono' id='cliente'>…</div></div>" +
    "<div class='ambitos'><b>Permisos solicitados</b><div id='scopes'>…</div></div>" +
    "<button class='primario' id='btnSi' onclick='decidir(true)'>Permitir acceso</button>" +
    "<button class='peligro' id='btnNo' onclick='decidir(false)'>Denegar</button>" +
    "<div class='error' id='error'></div><div class='ok' id='ok'></div>" +
    "<div class='pie'><div class='firma'>@fperezbe</div></div>" +
    "<script>" +
    JS_COMUN +
    "var params=new URLSearchParams(window.location.search);" +
    "var clientId=params.get('client_id')||'(desconocida)';" +
    "var oauthQuery=window.location.search.slice(1);" +
    "document.getElementById('cliente').textContent=clientId;" +
    "document.getElementById('scopes').textContent=(params.get('scope')||'(ninguno)').split(' ').join(', ');" +
    "fetch('/api/auth/oauth2/public-client?client_id='+encodeURIComponent(clientId),{credentials:'same-origin'})" +
    ".then(function(r){if(r.ok){return r.json();}if(r.status===401){window.location.href='/sign-in'+window.location.search;return null;}return null;})" +
    ".then(function(d){if(d&&(d.name||d.clientName)){document.getElementById('cliente').textContent=d.name||d.clientName;}})" +
    ".catch(function(){});" +
    "async function decidir(aceptar){document.getElementById('btnSi').disabled=true;" +
    "document.getElementById('btnNo').disabled=true;try{" +
    "var res=await fetch('/api/auth/oauth2/consent',{method:'POST',credentials:'same-origin'," +
    "headers:{'Content-Type':'application/json'}," +
    "body:JSON.stringify({accept:aceptar,oauth_query:oauthQuery})});" +
    "var txt=await res.text();var url=null;try{var d=JSON.parse(txt);url=d&&(d.url||d.redirectUrl||d.redirect);}catch(e){}" +
    "if(!res.ok&&!url){throw new Error(txt||('Error '+res.status));}" +
    "if(url){window.location.href=url;return;}" +
    "mostrarOk('Listo. Ya puedes volver a la aplicaci\u00f3n y continuar.');}" +
    "catch(e){mostrarError(e.message);" +
    "document.getElementById('btnSi').disabled=false;document.getElementById('btnNo').disabled=false;}}" +
    "</script>";
  return pagina("Autorizar", cuerpo);
}

const JS_API_KEYS =
  "function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e;}" +
  "function fecha(v){return v?new Date(v).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}):'—';}" +
  "function estado(k){if(k.revokedAt)return ['Revocada','revocada'];if(k.expiresAt&&new Date(k.expiresAt)<=new Date())return ['Expirada','expirada'];return ['Activa','activa'];}" +
  "async function pedir(ruta,opciones){var res=await fetch(ruta,Object.assign({credentials:'same-origin'},opciones||{}));var datos=null;try{datos=await res.json();}catch(e){}if(!res.ok){throw new Error((datos&&datos.error)||('Error '+res.status));}return datos;}" +
  "async function cargar(){var cont=document.getElementById('lista');try{var datos=await pedir('/api/keys');" +
  "if(!datos.keys.length){cont.className='vacio';cont.textContent='Aún no tienes API keys.';return;}" +
  "cont.className='';var wrap=el('div','tabla-wrap');var t=el('table');var th=el('thead');var trh=el('tr');" +
  "['Nombre','Cursos','Periodos','Prefijo','Creada','Último uso','Expira','Estado',''].forEach(function(x){trh.appendChild(el('th',null,x));});" +
  "th.appendChild(trh);t.appendChild(th);var tb=el('tbody');" +
  "datos.keys.forEach(function(k){var tr=el('tr');" +
  "tr.appendChild(el('td',null,k.nombre));" +
  "tr.appendChild(el('td',null,(k.cursosPermitidos&&k.cursosPermitidos.length)?k.cursosPermitidos.join(', '):'Todos'));" +
  "tr.appendChild(el('td',null,(k.periodosPermitidos&&k.periodosPermitidos.length)?k.periodosPermitidos.join(', '):'Todos'));" +
  "tr.appendChild(el('td','mono',k.keyPrefix+'…'));" +
  "tr.appendChild(el('td',null,fecha(k.createdAt)));" +
  "tr.appendChild(el('td',null,fecha(k.lastUsedAt)));" +
  "tr.appendChild(el('td',null,fecha(k.expiresAt)));" +
  "var e=estado(k);var tde=el('td');tde.appendChild(el('span','badge '+e[1],e[0]));tr.appendChild(tde);" +
  "var tda=el('td');if(!k.revokedAt){var b=el('button','mini peligro','Revocar');b.onclick=function(){revocar(k.id,k.nombre);};tda.appendChild(b);}else{tda.appendChild(el('span',null,'—'));}tr.appendChild(tda);tb.appendChild(tr);});" +
  "t.appendChild(tb);wrap.appendChild(t);cont.replaceChildren(wrap);}catch(e){mostrarError(e.message);}}" +
  "async function crear(){var btn=document.getElementById('btnCrear');btn.disabled=true;ocultarMensajes();try{" +
  "var nombre=document.getElementById('nombre').value.trim();var dias=document.getElementById('dias').value;" +
  "var cursosTxt=document.getElementById('cursos').value.trim();" +
  "var cursos=cursosTxt?cursosTxt.split(',').map(function(c){return c.trim();}).filter(Boolean):[];" +
  "var periodosTxt=document.getElementById('periodos').value.trim();" +
  "var periodos=periodosTxt?periodosTxt.split(',').map(function(p){return p.trim();}).filter(Boolean):[];" +
  "var cuerpo={nombre:nombre||'Apps Script'};if(dias)cuerpo.expiraEnDias=Number(dias);if(cursos.length)cuerpo.cursos=cursos;if(periodos.length)cuerpo.periodos=periodos;" +
  "var datos=await pedir('/api/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cuerpo)});" +
  "document.getElementById('clave').textContent=datos.clave;document.getElementById('nueva').style.display='block';" +
  "document.getElementById('nombre').value='';document.getElementById('cursos').value='';document.getElementById('periodos').value='';mostrarOk('API key creada. Cópiala ahora.');await cargar();" +
  "}catch(e){mostrarError(e.message);}finally{btn.disabled=false;}}" +
  "async function copiar(){var texto=document.getElementById('clave').textContent;try{await navigator.clipboard.writeText(texto);mostrarOk('Clave copiada al portapapeles.');}catch(e){var r=document.createRange();r.selectNodeContents(document.getElementById('clave'));var s=window.getSelection();s.removeAllRanges();s.addRange(r);try{document.execCommand('copy');mostrarOk('Clave copiada.');}catch(_){mostrarError('No pude copiar; selecciónala manualmente.');}}}" +
  "async function revocar(id,nombre){if(!window.confirm('¿Revocar la key \"'+nombre+'\"? Apps Script dejará de funcionar con ella.'))return;try{await pedir('/api/keys/'+encodeURIComponent(id),{method:'DELETE'});document.getElementById('nueva').style.display='none';mostrarOk('Key revocada.');await cargar();}catch(e){mostrarError(e.message);}}" +
  "function ocultarMensajes(){document.getElementById('error').style.display='none';document.getElementById('ok').style.display='none';}" +
  "async function salir(){try{await fetch('/api/auth/sign-out',{method:'POST',credentials:'same-origin'});}catch(e){}window.location.href='/sign-in';}" +
  "document.getElementById('btnCrear').onclick=crear;" +
  "document.getElementById('btnCopiar').onclick=copiar;" +
  "cargar();";

function paginaApiKeys(usuario: string): string {
  const cuerpo =
    "<h1>API keys</h1>" +
    "<p class='sub'>Sesi&oacute;n iniciada como <b>" + escaparHtml(usuario) + "</b>. " +
    "Crea una clave para que Apps Script lea tus cursos, alumnos y justificaciones sin guardar tu contrase&ntilde;a. " +
    "Puedes limitarla a uno o m&aacute;s cursos y periodos.</p>" +
    "<div class='campo' style='margin-top:26px'>" +
      "<div class='etiqueta'><span>Nueva key</span></div>" +
      "<div class='fila'>" +
        "<div class='campo'><input id='nombre' type='text' maxlength='80' placeholder='Ej. Planilla notas'></div>" +
        "<div class='campo'><select id='dias'>" +
          "<option value='90'>Expira en 90 d&iacute;as</option>" +
          "<option value='180' selected>Expira en 180 d&iacute;as</option>" +
          "<option value='365'>Expira en 1 a&ntilde;o</option>" +
          "<option value=''>Sin expiraci&oacute;n</option>" +
        "</select></div>" +
      "</div>" +
      "<div class='campo' style='margin-top:14px'>" +
        "<input id='cursos' type='text' maxlength='600' placeholder='Cursos permitidos: ENMES2505, EC2106 (vac&iacute;o = todos)'>" +
      "</div>" +
      "<div class='campo' style='margin-top:14px'>" +
        "<input id='periodos' type='text' maxlength='300' placeholder='Periodos permitidos: 20262, 20261 (vac&iacute;o = todos)'>" +
      "</div>" +
      "<button class='primario crear' id='btnCrear'>Crear API key</button>" +
    "</div>" +
    "<div class='error' id='error'></div><div class='ok' id='ok'></div>" +
    "<div class='nueva' id='nueva'>" +
      "<p><b>Guarda esta clave ahora.</b> No se vuelve a mostrar; si la pierdes, crea otra y revoca esta.</p>" +
      "<div class='clave'><code id='clave'></code><button class='mini' id='btnCopiar'>Copiar</button></div>" +
    "</div>" +
    "<h2>Tus keys</h2>" +
    "<div id='lista' class='vacio'>Cargando&hellip;</div>" +
    "<div class='pie'><a href='#' onclick='salir();return false'>Cerrar sesi&oacute;n</a><div class='firma'>@fperezbe</div></div>" +
    "<script>" + JS_COMUN + JS_API_KEYS + "</script>";
  return pagina("API keys", cuerpo, "ancha");
}

export const paginasRouter = Router();

paginasRouter.get("/api-keys", async (req, res) => {
  try {
    const datos = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!datos?.user) {
      res.redirect("/sign-in?redirect=%2Fapi-keys");
      return;
    }
    res.type("html").send(paginaApiKeys(datos.user.name || datos.user.email));
  } catch {
    res.redirect("/sign-in?redirect=%2Fapi-keys");
  }
});

paginasRouter.get("/sign-in", (_req, res) => {
  res.type("html").send(paginaSignIn());
});
// Alias corto para compartir desde el chat: /conectar -> /sign-in (conserva ?client_id=...).
paginasRouter.get("/conectar", (req, res) => {
  const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.redirect("/sign-in" + q);
});
paginasRouter.get("/consent", (_req, res) => {
  res.type("html").send(paginaConsent());
});
