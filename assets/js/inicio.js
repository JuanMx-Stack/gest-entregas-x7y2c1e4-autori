window.addEventListener("DOMContentLoaded", async () => {
  await cargarConfigPublica();
  configurar(false);
  document.getElementById("ocr-st").textContent = CFG.gem ? "Clave configurada; verificando Gemini…" : "Falta la clave de Gemini: pégala en ⚙️.";
  comprobarInternet();
  comprobarGemini();
  comprobarAppsScript();
  comprobarSheets();
  actualizarDiagSync();
  window.addEventListener("online", () => {
    comprobarInternet();
    comprobarGemini();
    comprobarAppsScript();
    comprobarSheets();
    vaciarCola();
  });
  window.addEventListener("offline", () => { comprobarInternet(); actualizarDiagSync(); });
  setInterval(() => {
    comprobarInternet();
    if (navigator.onLine) { comprobarGemini(); comprobarAppsScript(); comprobarSheets(); }
    if (leerCola().length) vaciarCola();
    actualizarDiagSync();
  }, 300000);
  setInterval(() => { if (leerCola().length) vaciarCola(); }, 20000);
});
