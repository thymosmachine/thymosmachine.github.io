/* appState.js v1.0.0 */
(() => {
  // --- SINGLETON & KOLIZE ---------------------------------------------------
  const KEY = Symbol.for('appState.singleton');
  const g = globalThis;

  if (g[KEY]) {
    // Už existuje – nic nepřepisuj, jen expose znovu (bez chyb)
    g.APP = g[KEY].api;
    return;
  }

  const VERSION = '1.0.0';

  // --- UTILITY --------------------------------------------------------------
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  const deepClone = (obj) => {
    if (!isObj(obj)) return Array.isArray(obj) ? obj.map(deepClone) : obj;
    const out = {};
    for (const k of Object.keys(obj)) out[k] = deepClone(obj[k]);
    return out;
  };

  const deepFreeze = (obj) => {
    if (isObj(obj) || Array.isArray(obj)) {
      Object.freeze(obj);
      for (const k of Object.keys(obj)) deepFreeze(obj[k]);
    }
    return obj;
  };

  // --- SEED Z HTML (#3) -----------------------------------------------------
  // Očekává JSON ve <script type="application/json" id="app-config">
  // Struktura doporučená: { "critical": {...}, "noncritical": {...} }
  let seedCritical = {};
  let seedNoncritical = {};

  try {
    const el = document.getElementById('app-config');
    if (el && el.textContent.trim()) {
      const parsed = JSON.parse(el.textContent);
      if (isObj(parsed.critical)) seedCritical = parsed.critical;
      if (isObj(parsed.noncritical)) seedNoncritical = parsed.noncritical;
      // fallback: pokud uživatel neposkytne dvě větve, vezmeme vše do noncritical
      if (!isObj(parsed.critical) && !isObj(parsed.noncritical)) {
        seedNoncritical = parsed;
      }
    }
  } catch (e) {
    console.warn('[appState] Nelze načíst/parsovat #app-config:', e);
  }

  // --- TOKEN PRO ŘÍZENÝ ZÁPIS DO KRITICKÝCH ---------------------------------
  // Volitelné: meta <meta name="app-state-token" content="...">
  const PAGE_TOKEN =
    document.querySelector('meta[name="app-state-token"]')?.content ?? null;

  // --- VNITŘNÍ STAV ---------------------------------------------------------
  // Kritické – neprůstřelný snapshot, ven dáváme jen kopie.
  let _critical = deepFreeze(deepClone(seedCritical));

  // Nekritické – pohodlně mutovatelné napříč skripty.
  const flags = Object.assign({}, seedNoncritical);

  // --- EVENTY ----------------------------------------------------------------
  const EVENT_FLAG = 'app:flag';         // set/clear noncritical
  const EVENT_CRIT = 'app:critical';     // změna critical
  const emit = (type, detail) => dispatchEvent(new CustomEvent(type, { detail }));

  // --- API -------------------------------------------------------------------
  const api = {
    version: VERSION,

    // Nekritické (A)
    get(key) { return flags[key]; },
    set(key, value) {
      flags[key] = value;
      emit(EVENT_FLAG, { key, value });
      return value;
    },
    has(key) { return Object.prototype.hasOwnProperty.call(flags, key); },
    all() { return { ...flags }; },
    clear(key) {
      const existed = Object.prototype.hasOwnProperty.call(flags, key);
      if (existed) {
        const old = flags[key];
        delete flags[key];
        emit(EVENT_FLAG, { key, value: undefined, old });
      }
      return existed;
    },

    // Kritické (B)
    getCritical(key) { return deepClone(_critical[key]); },
    criticalAll() { return deepClone(_critical); },

    /**
     * Bezpečná změna kritických hodnot.
     * - `token` musí odpovídat meta[name="app-state-token"] (pokud je nastavena)
     * - update může být objekt (merge) nebo funkce (prev => next)
     */
    setCritical(update, token) {
      if (PAGE_TOKEN && token !== PAGE_TOKEN) {
        throw new Error('[appState] Neplatný token pro setCritical');
      }
      const prev = deepClone(_critical);
      let next;
      if (typeof update === 'function') {
        next = update(prev);
        if (!isObj(next)) throw new Error('[appState] setCritical(updater) musí vrátit objekt');
      } else if (isObj(update)) {
        next = { ...prev, ...update };
      } else {
        throw new Error('[appState] setCritical očekává objekt nebo funkci');
      }
      _critical = deepFreeze(deepClone(next));
      emit(EVENT_CRIT, { prev, next: deepClone(_critical) });
      return deepClone(_critical);
    },

    // Události
    on(type, handler) { addEventListener(type, handler); return () => removeEventListener(type, handler); },
    off(type, handler) { removeEventListener(type, handler); },

    // Util: načtení tokenu (kvůli DI/testům nebo logování)
    getPageToken() { return PAGE_TOKEN; }
  };

  // Zabránit přepisům API zvenku
  Object.freeze(api);

  // Zapsat do globálu (A) i do skrytého symbolu
  g[KEY] = { api };
  // Bezpečné připojení ke globálu (nepřepisuj existující APP, pokud by kolidovala)
  if (!g.APP) Object.defineProperty(g, 'APP', { value: api, writable: false, configurable: false });

})();


/*

Doporučené použití v HTML

1) Seed kritických a/nebo výchozích nekritických hodnot přes JSON (#3):

<script type="application/json" id="app-config">
{
  "critical": { "featureX": true, "apiBase": "/v1" },
  "noncritical": { "darkMode": false }
}
</script>


2) Volitelný token (pro změny kritických hodnot jen „z důvěryhodného“ kódu):

<meta name="app-state-token" content="RANDOM_SECURE_TOKEN_123" />


Token generuj na serveru (krátkodobý, náhodný). Když meta neexistuje, setCritical půjde volat bez tokenu (vhodné pro interní projekty).

3) Načtení balíčku co nejdřív (ideálně v <head>):

<script src="/scripts/appState.js"></script>


4) Čtení/Zápis – nekritické (A):

<script>
  if (APP.get('darkMode')) document.documentElement.classList.add('dark');

  APP.on('app:flag', (e) => {
    if (e.detail.key === 'darkMode') {
      document.documentElement.classList.toggle('dark', !!e.detail.value);
    }
  });

  // později:
  APP.set('darkMode', true);
</script>


5) Čtení – kritické (B):

<script type="module">
  const apiBase = APP.getCritical('apiBase'); // "/v1"
  // APP.criticalAll() → deep clone všech kritických hodnot
</script>


6) Řízená změna kritických (B) – pouze s tokenem:

<script type="module">
  const token = APP.getPageToken();    // nebo si ho načti jinak
  APP.setCritical(prev => ({ ...prev, featureX: false }), token);
</script>

Proč je to „chráněné“?

Singleton + Symbol: balíček se nespustí 2×, nehrozí přepsání stavu.

Kritické hodnoty jsou držené v closure, ven se dávají jen deep-clony a vnitřní snapshot je deep-frozen → nelze je mimo API mutovat.

setCritical vyžaduje token (je-li přítomen v <meta>), jinak vyhodí chybu.

API je Object.freeze: nelze ho přepsat.

Události: bezpečně informují ostatní skripty bez sdílených referencí.

Poznámky k CSP

Pokud máš CSP zakazující inline skripty, dej appState.js do externího souboru (jak výše) a JSON seed nech v <script type="application/json">, což CSP obvykle povoluje.

Pro token nepoužívej CSP nonce; to se mění per request. Vhodnější je krátkodobý tajný token v meta tagu nebo přístupný přes „bootstrap“ skript ze serveru.

Chceš k tomu malý vite/webpack plugin, který ti při buildu vygeneruje <meta name="app-state-token"> a vloží ho do šablony? Nebo ukázkový test (Vitest/Jest) na ochranu kritických hodnot?

 */