import { Router } from "express";

// Páginas mínimas del flujo OAuth (ChatGPT / Claude Desktop).
// El plugin redirige aquí con la query de autorización firmada:
//  - /sign-in?...  -> login con usuario+clave de DocenciaWeb y vuelta a /api/auth/oauth2/authorize.
//  - /consent?...  -> muestra cliente y scopes; al aprobar llama a POST /oauth2/consent
//                     (con oauth_query) y sigue la url resultante.

const CSS =
  "body{font-family:system-ui,sans-serif;background:#f4f6f8;color:#1a1a1a;display:flex;justify-content:center;padding:48px 16px;margin:0}" +
  ".tarjeta{background:#fff;border-radius:12px;padding:28px;max-width:420px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.08)}" +
  "h1{font-size:20px;margin:0 0 6px}.sub{color:#555;font-size:14px;margin:0 0 18px}" +
  "label{font-size:13px;font-weight:600;display:block;margin:12px 0 4px}" +
  "input{width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:15px;box-sizing:border-box}" +
  "button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer}" +
  ".primario{background:#005596;color:#fff}.peligro{background:#fff;color:#a00;border:1px solid #a00;margin-top:8px}" +
  "button:disabled{opacity:.6;cursor:wait}" +
  ".error{background:#fdecec;color:#a00;border-radius:8px;padding:10px;font-size:14px;margin-top:12px;display:none}" +
  ".ok{background:#e8f5e9;color:#1b5e20;border-radius:8px;padding:10px;font-size:14px;margin-top:12px;display:none}" +
  ".ambitos{background:#f4f6f8;border-radius:8px;padding:10px 14px;font-size:14px;margin:12px 0}" +
  ".mono{font-family:ui-monospace,monospace;font-size:13px;word-break:break-all}";

function pagina(titulo: string, cuerpo: string): string {
  return (
    "<!doctype html><html lang='es'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>" + titulo + " - DocenciaWeb MCP</title>" +
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

function paginaSignIn(): string {
  const cuerpo =
    "<h1>Iniciar sesión</h1>" +
    "<p class='sub'>Usa tu usuario y clave de DocenciaWeb. Con esto entras a la app y queda conectada tu cuenta.</p>" +
    "<label>Usuario de DocenciaWeb</label><input id='usuario' type='text' autocomplete='username'>" +
    "<label>Contraseña</label><input id='clave' type='password' autocomplete='current-password'>" +
    "<button class='primario' id='btn' onclick='entrar()'>Entrar y continuar</button>" +
    "<div class='error' id='error'></div><div class='ok' id='ok'></div>" +
    "<script>" +
    JS_COMUN +
    "async function entrar(){var btn=document.getElementById('btn');btn.disabled=true;try{" +
    "var acc=await postJSON('/api/acceso',{usuario:document.getElementById('usuario').value," +
    "clave:document.getElementById('clave').value});" +
    "await postJSON('/api/auth/sign-in/email',{email:acc.email,password:acc.claveTemporal});" +
    "var q=window.location.search;" +
    "if(q.indexOf('client_id=')>=0){window.location.href='/api/auth/oauth2/authorize'+q;}" +
    "else{mostrarOk('Sesión iniciada como '+acc.usuario+'. Ya puedes volver a la aplicación y continuar.');btn.disabled=false;}}" +
    "catch(e){mostrarError(e.message);btn.disabled=false;}}" +
    "</script>";
  return pagina("Iniciar sesión", cuerpo);
}

function paginaConsent(): string {
  const cuerpo =
    "<h1>Autorizar aplicación</h1>" +
    "<p class='sub'>La siguiente aplicación quiere acceder a tu cuenta de DocenciaWeb MCP.</p>" +
    "<div><b>Aplicación</b><div class='mono' id='cliente'>…</div></div>" +
    "<div class='ambitos'><b>Permisos solicitados</b><div id='scopes'>…</div></div>" +
    "<button class='primario' id='btnSi' onclick='decidir(true)'>Permitir acceso</button>" +
    "<button class='peligro' id='btnNo' onclick='decidir(false)'>Denegar</button>" +
    "<div class='error' id='error'></div><div class='ok' id='ok'></div>" +
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
    "mostrarOk('Listo. Ya puedes volver a la aplicación y continuar.');}" +
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
