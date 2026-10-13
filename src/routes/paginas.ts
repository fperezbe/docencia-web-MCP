import { Router } from "express";

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
  ".pie .firma{margin-top:14px;color:#777;font-size:14px}";

function pagina(titulo: string, cuerpo: string): string {
  return (
    "<!doctype html><html lang='es'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>" + titulo + "</title>" +
    "<style>" + CSS + "</style></head><body><div class='tarjeta'>" + cuerpo + "</div></body></html>"
  );
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
    "<div class='pie'><div class='firma'>@fperezbe</div></div>" +
    "<script>" +
    JS_COMUN +
    "async function entrar(){var btn=document.getElementById('btn');btn.disabled=true;try{" +
    "var acc=await postJSON('/api/acceso',{usuario:document.getElementById('usuario').value," +
    "clave:document.getElementById('clave').value});" +
    "await postJSON('/api/auth/sign-in/email',{email:acc.email,password:acc.claveTemporal});" +
    "var q=window.location.search;" +
    "if(q.indexOf('client_id=')>=0){window.location.href='/api/auth/oauth2/authorize'+q;}" +
    "else{mostrarOk('Sesi\u00f3n iniciada como '+acc.usuario+'. Ya puedes volver a la aplicaci\u00f3n y continuar.');btn.disabled=false;}}" +
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

export const paginasRouter = Router();
paginasRouter.get("/sign-in", (_req, res) => {
  res.type("html").send(paginaSignIn());
});
paginasRouter.get("/consent", (_req, res) => {
  res.type("html").send(paginaConsent());
});
