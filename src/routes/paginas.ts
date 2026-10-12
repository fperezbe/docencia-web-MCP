import { Router } from "express";

// Páginas mínimas del flujo OAuth (ChatGPT / Claude Desktop).
// El plugin redirige aquí con la query de autorización firmada:
//  - /sign-in?...  -> tras iniciar sesión se vuelve a /api/auth/oauth2/authorize con la misma query.
//  - /consent?...  -> muestra cliente y scopes; al aprobar llama a POST /oauth2/consent y sigue la url resultante.

const CSS =
  "body{font-family:system-ui,sans-serif;background:#f4f6f8;color:#1a1a1a;display:flex;justify-content:center;padding:48px 16px;margin:0}" +
  ".tarjeta{background:#fff;border-radius:12px;padding:28px;max-width:420px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.08)}" +
  "h1{font-size:20px;margin:0 0 6px}.sub{color:#555;font-size:14px;margin:0 0 18px}" +
  "label{font-size:13px;font-weight:600;display:block;margin:12px 0 4px}" +
  "input{width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:15px;box-sizing:border-box}" +
  "button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer}" +
  ".primario{background:#005596;color:#fff}.peligro{background:#fff;color:#a00;border:1px solid #a00;margin-top:8px}" +
  ".error{background:#fdecec;color:#a00;border-radius:8px;padding:10px;font-size:14px;margin-top:12px;display:none}" +
  ".ok{background:#e8f5e9;color:#1b5e20;border-radius:8px;padding:10px;font-size:14px;margin-top:12px;display:none}" +
  ".ambitos{background:#f4f6f8;border-radius:8px;padding:10px 14px;font-size:14px;margin:12px 0}" +
  ".pestanas{display:flex;gap:8px;margin-bottom:8px}.pestanas button{margin:0;padding:8px;background:#eef1f4;color:#333;font-weight:600}" +
  ".pestanas button.activo{background:#005596;color:#fff}" +
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
  "async function leerError(res){try{var d=await res.json();return res.status+' '+(d.message||d.error||d.code||'Error');}catch(e){return res.status+' Error';}}";

function paginaSignIn(): string {
  const cuerpo =
    "<h1>Iniciar sesión</h1>" +
    "<p class='sub'>Usa tu cuenta de la app DocenciaWeb MCP para autorizar a la aplicación.</p>" +
    "<div class='pestanas'><button id='tabLogin' class='activo' onclick='modo(\"login\")'>Entrar</button>" +
    "<button id='tabRegistro' onclick='modo(\"registro\")'>Crear cuenta</button></div>" +
    "<div id='formLogin'><label> Email</label><input id='email' type='email' autocomplete='email'>" +
    "<label>Contraseña</label><input id='clave' type='password' autocomplete='current-password'>" +
    "<button class='primario' onclick='entrar()'>Entrar y continuar</button></div>" +
    "<div id='formRegistro' style='display:none'><label>Nombre</label><input id='nombre' type='text' autocomplete='name'>" +
    "<label>Email</label><input id='email2' type='email' autocomplete='email'>" +
    "<label>Contraseña (mínimo 8 caracteres)</label><input id='clave2' type='password' autocomplete='new-password'>" +
    "<button class='primario' onclick='registrar()'>Crear cuenta y continuar</button></div>" +
    "<div class='error' id='error'></div><div class='ok' id='ok'></div>" +
    "<script>" +
    JS_COMUN +
    "function modo(m){var l=m==='login';document.getElementById('formLogin').style.display=l?'block':'none';" +
    "document.getElementById('formRegistro').style.display=l?'none':'block';" +
    "document.getElementById('tabLogin').className=l?'activo':'';document.getElementById('tabRegistro').className=l?'':'activo';}" +
    "function destinoTrasLogin(){var q=window.location.search;" +
    "if(q.indexOf('client_id=')>=0){return '/api/auth/oauth2/authorize'+q;}" +
    "return null;}" +
    "async function postAuth(ruta,datos){var res=await fetch(ruta,{method:'POST',credentials:'same-origin'," +
    "headers:{'Content-Type':'application/json'},body:JSON.stringify(datos)});" +
    "if(!res.ok){throw new Error(await leerError(res));}}" +
    "async function entrar(){try{await postAuth('/api/auth/sign-in/email',{email:document.getElementById('email').value," +
    "password:document.getElementById('clave').value});var d=destinoTrasLogin();" +
    "if(d){window.location.href=d;}else{mostrarOk('Sesión iniciada. Ya puedes volver a la aplicación y continuar.');}}" +
    "catch(e){mostrarError(e.message);}}" +
    "async function registrar(){try{await postAuth('/api/auth/sign-up/email',{name:document.getElementById('nombre').value," +
    "email:document.getElementById('email2').value,password:document.getElementById('clave2').value});var d=destinoTrasLogin();" +
    "if(d){window.location.href=d;}else{mostrarOk('Cuenta creada y sesión iniciada. Ya puedes volver a la aplicación.');}}" +
    "catch(e){mostrarError(e.message);}}" +
    "</script>";
  return pagina("Iniciar sesión", cuerpo);
}

function paginaConsent(): string {
  const cuerpo =
    "<h1>Autorizar aplicación</h1>" +
    "<p class='sub'>La siguiente aplicación quiere acceder a tu cuenta de DocenciaWeb MCP.</p>" +
    "<div><b>Aplicación</b><div class='mono' id='cliente'>…</div></div>" +
    "<div class='ambitos'><b>Permisos solicitados</b><div id='scopes'>…</div></div>" +
    "<button class='primario' onclick='decidir(true)'>Permitir acceso</button>" +
    "<button class='peligro' onclick='decidir(false)'>Denegar</button>" +
    "<div class='error' id='error'></div><div class='ok' id='ok'></div>" +
    "<script>" +
    JS_COMUN +
    "var params=new URLSearchParams(window.location.search);" +
    "var clientId=params.get('client_id')||'(desconocida)';" +
    "document.getElementById('cliente').textContent=clientId;" +
    "document.getElementById('scopes').textContent=(params.get('scope')||'(ninguno)').split(' ').join(', ');" +
    "fetch('/api/auth/oauth2/public-client?client_id='+encodeURIComponent(clientId),{credentials:'same-origin'})" +
    ".then(function(r){if(r.ok){return r.json();}if(r.status===401){window.location.href='/sign-in'+window.location.search;return null;}return null;})" +
    ".then(function(d){if(d&&(d.name||d.clientName)){document.getElementById('cliente').textContent=d.name||d.clientName;}})" +
    ".catch(function(){});" +
    "async function decidir(aceptar){try{var res=await fetch('/api/auth/oauth2/consent',{method:'POST'," +
    "credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({accept:aceptar})});" +
    "var txt=await res.text();var url=null;try{var d=JSON.parse(txt);url=d&&(d.url||d.redirectUrl||d.redirect);}catch(e){}" +
    "if(!res.ok&&!url){throw new Error(txt||('Error '+res.status));}" +
    "if(url){window.location.href=url;return;}" +
    "mostrarOk('Listo. Ya puedes volver a la aplicación y continuar.');}" +
    "catch(e){mostrarError(e.message);}}" +
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
