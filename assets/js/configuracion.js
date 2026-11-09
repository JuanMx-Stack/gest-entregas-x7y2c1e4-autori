// Solo opciones públicas. Nunca guardes claves, números ni datos de clientes en config.json.
const APP_PUBLIC = { modeloOCR: "gemini-2.5-flash" };
async function cargarConfigPublica() {
  try {
    const r = await fetch("./config.json", {cache: "no-store"});
    if (!r.ok) return;
    const cfg = await r.json();
    if (typeof cfg.modeloOCR === "string" && /^[a-zA-Z0-9._-]{2,80}$/.test(cfg.modeloOCR)) {
      APP_PUBLIC.modeloOCR = cfg.modeloOCR;
    }
  } catch (_) { /* Vista previa file://: se conserva el valor predeterminado. */ }
}

const CFG = (() => { try { return JSON.parse(localStorage.getItem("cfg_entregas") || "{}"); } catch (e) { return {}; } })();
if (CFG.model && /^(AQ\.|AIza)/.test(CFG.model)) {
  if (!CFG.gem) CFG.gem = CFG.model;
  CFG.model = "";
  try { localStorage.setItem("cfg_entregas", JSON.stringify(CFG)); } catch (e) {}
}
const SPREADSHEET_ID = CFG.sheet || "";
const API_URL = CFG.api || "";
const E = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function isoLocal(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function hoyLocal(){return isoLocal(new Date());}
function fechaSheet(v){
  if(!v) return hoyLocal();
  const m=/^Date\((\d+),(\d+),(\d+)/.exec(v);
  if(m) return m[1]+"-"+String(+m[2]+1).padStart(2,"0")+"-"+String(+m[3]).padStart(2,"0");
  return String(v).split("T")[0];
}
function paquete(p,action){return {action,id:p.id,date:p.fecha,n:p.n,t:p.t,a:p.a,g:p.g,x:p.x||"",att:p.att,st:p.st,w:p.w};}
const COLA_KEY = "cola_entregas", CACHE_KEY = "cache_entregas";
let falloRed = false, enviando = false;
const diagnostico = { net: "wait", gem: "wait", api: "wait", sheet: "wait", sync: "wait" };
let gemCheckRunning = false, sheetCheckTimer = null;
let lecturaSheetsPendiente = null;
let ultimaConfirmacionSync = false;
let apiCheckTimer = null;
let apiCheckCompleted = false;
let apiCallbackName = null;
function pintarDiag(clave, texto, tipo) {
  diagnostico[clave] = tipo;
  const el = document.getElementById("diag-" + clave);
  if (el) { el.textContent = texto; el.className = tipo === "ok" ? "diag-ok" : tipo === "bad" ? "diag-bad" : tipo === "warn" ? "diag-warn" : "diag-wait"; }
  const up = document.getElementById("diag-updated");
  if (up) up.textContent = "Última actualización: " + new Date().toLocaleTimeString();
}
function comprobarInternet() {
  const ok = navigator.onLine;
  pintarDiag("net", ok ? "Conectado" : "Sin conexión", ok ? "ok" : "bad");
  if (!ok) {
    pintarDiag("gem", "En espera de Internet", "warn");
    pintarDiag("api", "En espera de Internet", "warn");
    pintarDiag("sheet", "En espera de Internet", "warn");
  }
  refrescarEstado();
  return ok;
}
function comprobarAppsScript() {
  if (!API_URL) { pintarDiag("api", "Falta configurar la URL", "warn"); return; }
  if (!comprobarInternet()) return;

  pintarDiag("api", "Comprobando servidor…", "wait");
  if (apiCheckTimer) clearTimeout(apiCheckTimer);

  // Evita que una respuesta antigua interfiera con una comprobación nueva.
  const anterior = document.getElementById("jsonp-api-health");
  if (anterior) anterior.remove();
  if (apiCallbackName) {
    try { delete window[apiCallbackName]; } catch (e) {}
    apiCallbackName = null;
  }

  apiCheckCompleted = false;
  const nombreCallback = "procesarEstadoAppsScript_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  apiCallbackName = nombreCallback;

  const limpiar = () => {
    if (apiCheckTimer) clearTimeout(apiCheckTimer);
    apiCheckTimer = null;
    const actual = document.getElementById("jsonp-api-health");
    if (actual) actual.remove();
    if (apiCallbackName === nombreCallback) {
      try { delete window[nombreCallback]; } catch (e) {}
      apiCallbackName = null;
    }
  };

  window[nombreCallback] = function(data) {
    if (apiCheckCompleted) return;
    apiCheckCompleted = true;
    limpiar();
    if (data && data.status === "ok") {
      pintarDiag("api", "Servidor operativo ✓", "ok");
    } else {
      pintarDiag("api", "Respuesta inválida del servidor", "bad");
    }
    refrescarEstado();
  };

  const script = document.createElement("script");
  script.id = "jsonp-api-health";
  script.async = true;
  script.onerror = () => {
    if (apiCheckCompleted) return;
    apiCheckCompleted = true;
    limpiar();
    pintarDiag("api", "No se pudo cargar la respuesta de Apps Script", "bad");
    refrescarEstado();
  };
  script.onload = () => {
    // Si el archivo se cargó pero no ejecutó el callback, la respuesta no era JSONP válida.
    if (apiCheckCompleted) return;
    apiCheckCompleted = true;
    limpiar();
    pintarDiag("api", "Apps Script respondió, pero no ejecutó el callback JSONP", "bad");
    refrescarEstado();
  };

  const separador = API_URL.includes("?") ? "&" : "?";
  script.src = API_URL + separador + "callback=" + encodeURIComponent(nombreCallback) + "&_=" + Date.now();
  apiCheckTimer = setTimeout(() => {
    if (apiCheckCompleted) return;
    apiCheckCompleted = true;
    limpiar();
    pintarDiag("api", "Tiempo de espera agotado al consultar Apps Script", "bad");
    refrescarEstado();
  }, 20000);

  document.body.appendChild(script);
}

