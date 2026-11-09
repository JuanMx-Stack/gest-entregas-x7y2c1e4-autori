const normG = g => String(g || "").replace(/\s/g, "").toUpperCase();
function duplicada(g, exceptId) {
  const k = normG(g);
  return k ? L.find(p => normG(p.g) === k && p.id != exceptId) : null;
}
function avisoDup(p) { return "La guía " + p.g + " ya está registrada (" + p.n + ", " + p.fecha + ")."; }
let L = [];
let filtroActual = 'todos';

const ph = s => { s = String(s||"").replace(/\D/g,""); return s.length === 9 ? "51" + s : s; };
function saludo() { const h = new Date().getHours(); return h < 12 ? "buenos días" : h < 19 ? "buenas tardes" : "buenas noches"; }
function msg(p) { return `Hola, ${saludo()}, somos de Temu, me estuve intentando comunicar con usted por la entrega de su paquete.`; }
function wa(p, num) { return "https://wa.me/" + ph(num) + "?text=" + encodeURIComponent(msg(p)); }

window.procesarDatosSheets = function(response) {
  if (sheetCheckTimer) { clearTimeout(sheetCheckTimer); sheetCheckTimer = null; }
  if (!response || !response.table) {
    pintarDiag("sheet", "Respuesta inválida de Google Sheets", "bad");
    document.getElementById("sync-status").textContent = "Error de lectura";
    return;
  }
  pintarDiag("sheet", "Conectada; lectura correcta ✓", "ok");
  L = response.table.rows.map((row, idx) => {
    const c = row.c;
    return {
      id: c[0]?.v || idx + 1,
      fecha: fechaSheet(c[1]?.v),
      n: String(c[2]?.v || "Sin nombre"),
      t: c[3]?.v ? String(c[3].v) : "",
      a: String(c[4]?.v || "Sin dirección"),
      g: String(c[5]?.v || ""),
      x: c[6]?.v ? String(c[6].v) : "",
      att: parseInt(c[7]?.v) || 0,
      st: c[8]?.v || "pend",
      w: String(c[9]?.v || "")
    };
  });
  falloRed = false;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(L)); } catch (e) {}
  if (lecturaSheetsPendiente) lecturaSheetsPendiente.resolve(L);
  refrescarEstado();
  render();
};

function cargarDatos() {
  if (!SPREADSHEET_ID) return;
  if (leerCola().length) {
    vaciarCola().then(() => { if (!leerCola().length) setTimeout(cargarDatos, 800); else usarCache(); });
    return;
  }
  solicitarLecturaSheets().catch(e => {
    if (sheetCheckTimer) { clearTimeout(sheetCheckTimer); sheetCheckTimer = null; }
    pintarDiag("sheet", "No se pudo consultar la hoja: " + e.message, "bad");
    falloRed = true; usarCache(); refrescarEstado();
  });
}

function setFiltroFecha(tipo, btn) {
  filtroActual = tipo;
  document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  if(tipo !== 'rango') {
    document.getElementById("date-from").value = "";
    document.getElementById("date-to").value = "";
  }
  render();
}

function accion(id, act) {
  const p = L.find(x => x.id == id);
  if (p) {
    if (act === "intentar") p.att = Math.min(3, p.att + 1);
    else if (act === "menos" && p.att > 0) p.att--;
    else if (act === "reiniciar") p.att = 0;
    else if (act === "entregado") p.st = p.st === "ent" ? "pend" : "ent";
    else if (act === "sin_contacto") p.st = p.st === "sin" ? "pend" : "sin";
    else if (act === "corregir") {
      abrirForm(p.id); return;
    } else if (act === "eliminar") {
      if (!confirm("¿Eliminar este paquete?")) return;
      L = L.filter(x => x.id != id);
      enviar({action:"deletePackage", id});
      render(); return;
    }
    enviar(paquete(p,"updatePackage"));
    render();
  }
}

function render() {
  const query = document.getElementById("search").value.toLowerCase();
  const dateFrom = document.getElementById("date-from").value;
  const dateTo = document.getElementById("date-to").value;
  
  const hoyStr = hoyLocal();

  const filtrados = L.filter(p => {
    // Búsqueda de texto
    const matchText = p.n.toLowerCase().includes(query) || 
                      p.t.toLowerCase().includes(query) || 
                      p.a.toLowerCase().includes(query) || 
                      p.g.toLowerCase().includes(query);
    if (!matchText) return false;

    // Filtros de fecha / calendario
    if (dateFrom && dateTo) {
      return p.fecha >= dateFrom && p.fecha <= dateTo;
    }
    if (filtroActual === 'hoy') {
      return p.fecha === hoyStr;
    }
    if (filtroActual === 'semana') {
      // Filtro aproximado últimos 7 días
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return p.fecha >= isoLocal(d);
    }
    if (filtroActual === 'mes') {
      return p.fecha.startsWith(hoyStr.substring(0, 7));
    }
    return true;
  });

  // Actualizar contadores del reporte
  document.getElementById("rep-total").textContent = L.length;
  document.getElementById("rep-pend").textContent = L.filter(x => x.st === "pend").length;
  document.getElementById("rep-ent").textContent = L.filter(x => x.st === "ent").length;

  const container = document.getElementById("list");
  if (!filtrados.length) {
    container.innerHTML = '<div style="text-align:center; color:var(--mu); padding:10px;">No hay paquetes en este periodo o filtro.</div>';
    return;
  }

  container.innerHTML = filtrados.map(p => {
    const done = p.st !== "pend", ready = p.att >= 3;
    const tag = p.st === "ent" ? '<span class="tag ok">Entregado</span>' : p.st === "sin" ? '<span class="tag no">Sin contacto</span>' : "";
    return '<div class="card' + (done ? " done" : "") + '">' +
      '<div class="nm"><span>' + E(p.n) + '</span>' + tag + '</div>' +
      '<div class="ad">' + E(p.a) + '</div>' +
      '<div class="meta">📅 ' + E(p.fecha) + ' · 📱 ' + E(p.t) + (p.g ? " · " + E(p.g) : "") + '</div>' +
      (p.w ? '<div class="meta" style="color:var(--wr)">⚠️ ' + E(p.w) + '</div>' : "") +
      '<div class="at">Llamadas: <b>' + p.att + '/3</b></div>' +
      '<div class="main-actions">' +
        '<a class="b-main" href="tel:+' + ph(p.t) + '" onclick="accion(' + p.id + ',\'intentar\')">📞 Llamar</a>' +
        '<a class="b-main wa" href="' + wa(p, p.t) + '" target="_blank">💬 WhatsApp</a>' +
      '</div>' +
      '<div class="sm-row">' +
        '<button class="sm-btn ok" onclick="accion(' + p.id + ',\'entregado\')">✅ Entregado</button>' +
        '<button class="sm-btn no" onclick="accion(' + p.id + ',\'sin_contacto\')">🚫 Sin contacto</button>' +
        '<button class="sm-btn" onclick="accion(' + p.id + ',\'corregir\')">✏️ Editar datos</button>' +
        '<button class="sm-btn" onclick="accion(' + p.id + ',\'reiniciar\')">🔄 Reiniciar</button>' +
        '<button class="sm-btn" onclick="accion(' + p.id + ',\'menos\')">-1</button>' +
        '<button class="sm-btn del" onclick="accion(' + p.id + ',\'eliminar\')">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join("");
}

function guardarPaquete() {
  const n = document.getElementById("add-name").value;
  const t = document.getElementById("add-tel").value;
  const a = document.getElementById("add-dir").value;
  const g = document.getElementById("add-gui").value;
  const b = document.getElementById("add-blur").checked;
  if(!n) return alert("Ingresa el nombre del cliente");
  const dup = duplicada(g, null);
  if (dup && !confirm(avisoDup(dup) + "\n¿Guardar de todos modos?")) return;
  
  const nuevo = { id: Date.now(), fecha: hoyLocal(), n, t, a, g, x: "", att: 0, st: "pend", w: b ? "Etiqueta borrosa" : "" };
  L.push(nuevo);
  enviar(paquete(nuevo,"addPackage"));
  
  document.getElementById("add-name").value = "";
  document.getElementById("add-tel").value = "";
  document.getElementById("add-dir").value = "";
  document.getElementById("add-gui").value = "";
  document.getElementById("add-blur").checked = false;
  render();
}

function configurar(forzar) {
  if (!forzar && CFG.sheet && CFG.api) return;
  document.getElementById("c-sheet").value = CFG.sheet || "";
  document.getElementById("c-api").value = CFG.api || "";
  document.getElementById("c-gem").value = CFG.gem || "";
  document.getElementById("c-model").value = CFG.model || "";
  document.getElementById("dlg-cfg").showModal();
}
function enlaceCfg() {
  // Solo comparte la URL pública de la aplicación, nunca los IDs ni las claves.
  const url = location.href.split("#")[0].split("?")[0];
  const ok = () => alert("Enlace del sistema copiado. En el otro dispositivo configura tus servicios de forma independiente desde ⚙️.");
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(ok).catch(() => prompt("Copia este enlace:", url));
  else prompt("Copia este enlace:", url);
}
function guardarCfg() {
  const v = i => document.getElementById(i).value.trim();
  if (!v("c-sheet") || !v("c-api")) return alert("Faltan la hoja y la URL de Apps Script");
  const id = (v("c-sheet").match(/\/d\/([^\/]+)/) || [null, v("c-sheet")])[1];
  let gem = v("c-gem"), model = v("c-model");
  if (/^(AQ\.|AIza)/.test(model)) { if (!gem) gem = model; model = ""; }
  const cfg = JSON.stringify({ sheet: id, api: v("c-api"), gem, model });
  try { localStorage.setItem("cfg_entregas", cfg); } catch (e) {}
  let leido = null;
  try { leido = localStorage.getItem("cfg_entregas"); } catch (e) {}
  if (leido !== cfg) return alert("Este navegador NO está guardando los datos de esta página (suele pasar al abrir el archivo desde el explorador de archivos). Aloja la página en una dirección https o ábrela de otra forma.");
  location.reload();
}

let editId = null;
function abrirForm(id, pre) {
  editId = id;
  const d = pre || L.find(x => x.id == id) || {};
  const set = (k, v) => { document.getElementById(k).value = v || ""; };
  set("f-n", d.n); set("f-t", d.t); set("f-x", d.x); set("f-a", d.a); set("f-g", d.g); set("f-w", d.w);
  document.getElementById("dlg-t").textContent = id ? "Editar paquete" : "Revisar y guardar paquete";
  const dup = !id && d.g ? duplicada(d.g, null) : null;
  document.getElementById("dlg-warn").textContent = (d.w ? "⚠️ " + d.w : "") + (dup ? " ⛔ " + avisoDup(dup) : "");
  document.getElementById("dlg").showModal();
}
function guardarForm() {
  const v = i => document.getElementById(i).value.trim();
  if (!v("f-n")) return alert("Falta el nombre");
  const datos = { n: v("f-n"), t: v("f-t"), x: v("f-x"), a: v("f-a"), g: v("f-g"), w: v("f-w") };
  const dup = duplicada(datos.g, editId);
  if (dup && !confirm(avisoDup(dup) + "\n¿Guardar de todos modos?")) return;
  if (editId) {
    const p = L.find(x => x.id == editId);
    Object.assign(p, datos);
    enviar(paquete(p, "updatePackage"));
  } else {
    const nuevo = { id: Date.now(), fecha: hoyLocal(), att: 0, st: "pend", ...datos };
    L.push(nuevo);
    enviar(paquete(nuevo, "addPackage"));
  }
  document.getElementById("dlg").close();
  render();
}


