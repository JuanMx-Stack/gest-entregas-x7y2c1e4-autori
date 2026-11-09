// Traduce errores sin confundir saturación o lentitud con una clave inválida.
function describirErrorGemini(error) {
  if (error && error.name === "AbortError") return "Tiempo de espera agotado; el servicio podría estar lento";
  const codigo = error && error.httpStatus;
  if (codigo === 400) return "Solicitud o modelo no válido (HTTP 400)";
  if (codigo === 401 || codigo === 403) return "Acceso rechazado: revisa la clave, permisos y restricciones (HTTP " + codigo + ")";
  if (codigo === 404) return "Modelo no disponible o nombre incorrecto (HTTP 404)";
  if (codigo === 429) return "Cuota o límite de solicitudes alcanzado (HTTP 429)";
  if (codigo === 500 || codigo === 502 || codigo === 503 || codigo === 504) return "Servidor de Gemini ocupado o no disponible (HTTP " + codigo + ")";
  if (codigo) return "Error del servicio (HTTP " + codigo + ")";
  if (error instanceof TypeError) return "Error de red o bloqueo del navegador";
  return (error && error.message) ? String(error.message).slice(0, 150) : "No se pudo verificar";
}
async function pedirGemini(partes, configuracion, tiempoMs) {
  const modelo = CFG.model || APP_PUBLIC.modeloOCR;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), tiempoMs);
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(modelo) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": CFG.gem },
      body: JSON.stringify({ contents: [{ parts: partes }], generationConfig: configuracion }),
      signal: controller.signal
    });
    if (!r.ok) {
      const err = new Error("Gemini devolvió HTTP " + r.status);
      err.httpStatus = r.status;
      throw err;
    }
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}
async function comprobarGemini() {
  if (gemCheckRunning) return;
  if (!CFG.gem) { pintarDiag("gem", "Falta configurar la clave", "warn"); return; }
  if (!comprobarInternet()) return;
  gemCheckRunning = true;
  pintarDiag("gem", "Verificando respuesta de Gemini…", "wait");
  try {
    const data = await pedirGemini([{ text: "Responde únicamente: OK" }], { temperature: 0, maxOutputTokens: 16 }, 45000);
    if (!data.candidates?.length) throw new Error("Gemini no devolvió candidatos");
    pintarDiag("gem", "Conectada y verificada ✓", "ok");
  } catch (e) {
    pintarDiag("gem", "No verificada: " + describirErrorGemini(e), "bad");
  } finally {
    gemCheckRunning = false;
    refrescarEstado();
  }
}
function comprobarSheets() {
  if (!SPREADSHEET_ID) { pintarDiag("sheet", "Falta configurar la hoja", "warn"); return; }
  if (!comprobarInternet()) return;
  pintarDiag("sheet", "Consultando hoja…", "wait");
  if (sheetCheckTimer) clearTimeout(sheetCheckTimer);
  sheetCheckTimer = setTimeout(() => {
    pintarDiag("sheet", "Sin respuesta de Google Sheets", "bad");
    falloRed = true; refrescarEstado(); usarCache();
  }, 15000);
  cargarDatos();
}
function actualizarDiagSync() {
  const n = leerCola().length;
  if (!navigator.onLine) pintarDiag("sync", n ? n + " cambio(s) guardados localmente" : "Sin conexión", "warn");
  else if (n) pintarDiag("sync", n + " cambio(s) pendientes de confirmar", "warn");
  else if (ultimaConfirmacionSync) pintarDiag("sync", "Cambios confirmados; cola vacía ✓", "ok");
  else pintarDiag("sync", "Sin cambios pendientes; escritura aún no probada", "warn");
}
function leerCola() { try { return JSON.parse(localStorage.getItem(COLA_KEY) || "[]"); } catch (e) { return []; } }
function guardarCola(c) { try { localStorage.setItem(COLA_KEY, JSON.stringify(c)); } catch (e) {} }
function estado(texto, ok) {
  const st = document.getElementById("sync-status");
  st.textContent = texto;
  st.classList.toggle("off", !ok);
}
function refrescarEstado() {
  const n = leerCola().length;
  if (!navigator.onLine) return estado("Sin conexión" + (n ? " · " + n + " cambio(s) guardados" : ""), false);
  if (falloRed) return estado("Error de conexión", false);
  if (n) return estado("Cambios pendientes: " + n, false);
  if ([diagnostico.gem, diagnostico.api, diagnostico.sheet].includes("bad")) return estado("Revisar servicios", false);
  if ([diagnostico.gem, diagnostico.api, diagnostico.sheet].includes("wait")) return estado("Verificando servicios…", false);
  if ([diagnostico.gem, diagnostico.api, diagnostico.sheet].includes("warn")) return estado("Configuración incompleta", false);
  estado("Sistema Activo", true);
  actualizarDiagSync();
}
function usarCache() {
  if (L.length) return;
  try { L = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch (e) { L = []; }
  render();
}
function solicitarLecturaSheets(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!SPREADSHEET_ID) return reject(new Error("Falta configurar Google Sheets"));
    if (lecturaSheetsPendiente) return reject(new Error("Ya hay una lectura de Sheets en curso"));
    const oldScript = document.getElementById("jsonp-sheet");
    if (oldScript) oldScript.remove();
    const script = document.createElement("script");
    script.id = "jsonp-sheet";
    const timer = setTimeout(() => {
      lecturaSheetsPendiente = null;
      script.remove();
      reject(new Error("Tiempo de espera al leer Google Sheets"));
    }, timeoutMs);
    lecturaSheetsPendiente = {
      resolve: data => { clearTimeout(timer); lecturaSheetsPendiente = null; resolve(data); },
      reject: err => { clearTimeout(timer); lecturaSheetsPendiente = null; reject(err); }
    };
    script.onerror = () => {
      if (lecturaSheetsPendiente) lecturaSheetsPendiente.reject(new Error("No se pudo leer Google Sheets"));
    };
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:procesarDatosSheets&_=` + Date.now();
    document.body.appendChild(script);
  });
}
function coincideCampo(a, b) { return String(a ?? "") === String(b ?? ""); }
function operacionConfirmada(payload, paquetes) {
  const p = paquetes.find(x => String(x.id) === String(payload.id));
  if (payload.action === "deletePackage") return !p;
  if (!p) return false;
  if (payload.action === "addPackage" || payload.action === "updatePackage") {
    return coincideCampo(p.n, payload.n || "") &&
      coincideCampo(p.t, payload.t || "") &&
      coincideCampo(p.a, payload.a || "") &&
      coincideCampo(p.g, payload.g || "") &&
      coincideCampo(p.x, payload.x || "") &&
      coincideCampo(p.att, payload.att || 0) &&
      coincideCampo(p.st, payload.st || "pend") &&
      coincideCampo(p.w, payload.w || "");
  }
  return false;
}
async function vaciarCola() {
  if (enviando || !API_URL || !SPREADSHEET_ID || !navigator.onLine) return;
  enviando = true;
  try {
    while (navigator.onLine) {
      const cola = leerCola();
      if (!cola.length) break;
      const payload = cola[0];
      // no-cors no permite leer la respuesta; por eso confirmamos el resultado
      // consultando de nuevo la hoja y comprobando el paquete afectado.
      await fetch(API_URL, { method: "POST", mode: "no-cors", body: JSON.stringify(payload) });
      let confirmada = false;
      for (let intento = 0; intento < 3 && navigator.onLine; intento++) {
        if (intento) await new Promise(r => setTimeout(r, 1200));
        const paquetes = await solicitarLecturaSheets();
        if (operacionConfirmada(payload, paquetes)) { confirmada = true; break; }
      }
      if (!confirmada) throw new Error("Sheets no confirmó la operación " + payload.action + " del paquete " + payload.id);
      const actual = leerCola();
      if (actual.length && JSON.stringify(actual[0]) === JSON.stringify(payload)) {
        actual.shift();
        guardarCola(actual);
      }
      ultimaConfirmacionSync = true;
      falloRed = false;
      actualizarDiagSync();
      refrescarEstado();
    }
  } catch (e) {
    falloRed = true;
    pintarDiag("sync", "No se pudo confirmar: " + (e.message || "error"), "bad");
  } finally {
    enviando = false;
    refrescarEstado();
    actualizarDiagSync();
  }
}
function enviar(payload) {
  if (!API_URL) return estado("Falta la URL de Apps Script", false);
  const c = leerCola(); c.push(payload); guardarCola(c);
  ultimaConfirmacionSync = false;
  refrescarEstado();
  actualizarDiagSync();
  vaciarCola();
}
window.addEventListener("online", () => { falloRed = false; refrescarEstado(); vaciarCola(); });
window.addEventListener("offline", refrescarEstado);


