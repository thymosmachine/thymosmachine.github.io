const logEl = document.getElementById("logOutput");
function log(msg) {
  const t = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.textContent = `[${t}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

(async function init() {
  try {
    const res = await fetch("./firmwareFiles/manifest.json");
    if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
    const manifest = await res.json();
    const builds = manifest.builds || [];
    log("Manifest načten: " + (builds.map(b => b.name || b.version).join(", ") || "1 build"));
  } catch (e) {
    log("Chyba při načítání manifestu: " + e.message);
  }
})();
