async function escanearOCR(file) {
  if (!file) return;
  const st = document.getElementById("ocr-st");
  if (!window.Tesseract) { st.textContent = "OCR no disponible (¿sin internet?). Escríbelo a mano."; return; }
  st.textContent = "Leyendo etiqueta… la primera vez descarga el idioma y tarda más.";
  try {
    const r = await Tesseract.recognize(file, "spa", {
      logger: m => { if (m.status === "recognizing text") st.textContent = "Leyendo… " + Math.round(m.progress * 100) + "%"; }
    });
    const d = analizar(r.data);
    st.textContent = "Procesado con Tesseract OCR básico (Gemini no disponible o falló). Revisa todos los datos antes de guardar.";
    abrirForm(null, d);
  } catch (e) {
    st.textContent = "No se pudo leer la foto. Intenta de nuevo o escríbelo a mano.";
  }
}

function analizar(data) {
  const lines = data.text.split("\n").map(s => s.trim()).filter(Boolean);
  const avisos = [];
  const g = ((data.text.match(/JPE\s?\d{9,}/i) || [""])[0]).replace(/\s/g, "").toUpperCase();
  const iN = lines.findIndex(l => /nombre/i.test(l));
  const n = iN >= 0 ? lines[iN].replace(/.*nombre\s*:?/i, "").trim() : "";
  const iT = lines.findIndex((l, i) => i >= Math.max(iN, 0) && /tel/i.test(l));
  let t = "", conf = 0;
  if (iT >= 0) {
    const rest = lines[iT].split(/tel\s*:?/i)[1] || "";
    const m = rest.replace(/\D/g, "").match(/9\d{8}/);
    if (m) {
      t = m[0];
      const ws = (data.words || []).filter(w => { const dg = w.text.replace(/\D/g, ""); return dg.length >= 5 && t.includes(dg.slice(-5)); });
      conf = ws.length ? Math.min(...ws.map(w => w.confidence)) : 0;
    }
  }
  const iE = lines.findIndex((l, i) => i > iT && /\w+\s*\/\s*\w+\s*\/\s*\w+/.test(l));
  let a = iT >= 0 ? lines.slice(iT + 1, iE > iT ? iE : iT + 3).join(" ") : "";
  if (data.confidence < 60 || (a.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]/g) || []).length < a.length * 0.8) a = "";
  if (!t) avisos.push("No se leyó el teléfono: escríbelo");
  else if (conf < 85) avisos.push("Teléfono poco legible (" + Math.round(conf) + "%): confírmalo antes de llamar");
  if (!n) avisos.push("No se leyó el nombre");
  if (!a) avisos.push("No se leyó la dirección");
  if (data.confidence < 70) avisos.push("Foto de baja calidad: revisa todo");
  return { n, t, a, g, x: "", w: avisos.join(" · ") };
}

async function reducir(file, max = 1600) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) { bmp = await createImageBitmap(file); }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}

const PROMPT_IA = `Eres un lector de etiquetas de envío J&T Express (Perú). Lee SOLO los datos impresos del DESTINATARIO: el primer bloque "Nombre / C.P. / Tel" y la dirección que está justo debajo.
IGNORA: el bloque del remitente (Nombre CAN... / Tel 123456789 / Av. Elmer Faucett), las firmas y todo lo escrito a mano con lapicero.
La foto puede ser de una pantalla, estar arrugada o con brillo.
NO ADIVINES: si un dato o dígito no se lee con certeza, deja el campo vacío o marca el dígito dudoso con "?" y descríbelo en "dudas".
En "direccion" no incluyas el teléfono ni frases como "llamar al ...".
Responde SOLO este JSON: {"nombre":"","telefono":"9 dígitos","direccion":"","guia":"JPE y números","dudas":["..."]}`;

async function leerConIA(file) {
  const b64 = await reducir(file);
  const j = await pedirGemini(
    [{ inline_data: { mime_type: "image/jpeg", data: b64 } }, { text: PROMPT_IA }],
    { responseMimeType: "application/json", temperature: 0 },
    60000
  );
  const txt = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  const d = JSON.parse(txt.replace(/```json|```/g, "").trim());
  const avisos = Array.isArray(d.dudas) ? d.dudas.map(String) : [];
  let t = String(d.telefono || "").trim();
  const dg = t.replace(/\D/g, "");
  if (!t.includes("?")) t = dg.length === 11 && dg.startsWith("51") ? dg.slice(2) : dg;
  const dg2 = t.replace(/\D/g, "");
  if (t.includes("?") || dg2.length !== 9 || dg2[0] !== "9") avisos.push("Teléfono dudoso: confírmalo antes de llamar");
  if (!d.nombre) avisos.push("No se leyó el nombre");
  if (!d.direccion) avisos.push("No se leyó la dirección");
  return { n: String(d.nombre || ""), t, a: String(d.direccion || ""), g: String(d.guia || "").replace(/\s/g, "").toUpperCase(), x: "", w: avisos.join(" · ") };
}

async function escanear(file) {
  if (!file) return;
  const st = document.getElementById("ocr-st");
  if (!CFG.gem) { st.textContent = "Sin clave de Gemini; utilizando Tesseract OCR básico."; await escanearOCR(file); return; }
  st.textContent = "Leyendo con IA…";
  try {
    const d = await leerConIA(file);
    st.textContent = "Procesado con Gemini IA ✓. Revisa los datos antes de guardar.";
    abrirForm(null, d);
  } catch (e) {
    const motivo = describirErrorGemini(e);
    st.textContent = "Gemini no respondió: " + motivo + ". Intentando Tesseract…";
    await escanearOCR(file);
  }
}


