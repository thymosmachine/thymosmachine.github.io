let port = null;
let open = false;
let reader = null;
let writer = null;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const ADD_CRLF = true; // přidávat \r\n při odesílání

// -------------------- Async fronta (producent/konzument) --------------------
function makeAsyncQueue() {
  const q = [];
  const waiters = [];
  let closed = false;

  return {
    push(v) {
      if (closed) return;
      const w = waiters.shift();
      w ? w(v) : q.push(v);
    },
    async pop() {
      if (q.length) return q.shift();
      return await new Promise((resolve) => waiters.push(resolve));
    },
    close() {
      closed = true;
      // odblokuj případné čekající konzumenty "poison pill" hodnotou null
      while (waiters.length) waiters.shift()(null);
    }
  };
}

const lineQueue = makeAsyncQueue(); // budeme do ní sypat celé "řádky"

// ---------------------------------------------------------------------------

function post(type, payload) {
  self.postMessage({ type, ...payload });
}

function setStatus(text, { ok = false, warn = false, connected = false } = {}) {
  post('status', { text, ok, warn, connected });
}

async function openPort(match, options) {
  const ports = await navigator.serial.getPorts();
  if (!ports.length) throw new Error('No serial ports available after permission');

  port = ports.find(p => {
    const info = p.getInfo?.();
    return info && match && match.vid && match.pid &&
           info.usbVendorId === match.vid && info.usbProductId === match.pid;
  }) ?? ports[0];

  await port.open(options);

  writer = port.writable?.getWriter() ?? null;
  reader = port.readable?.getReader() ?? null;

  open = true;
  setStatus('Connected', { ok: true, connected: true });

  // start obou asynchronních „vláken“
  readLoop().catch(err => { if (open) post('error', { text: String(err) }); });
  parseLoop().catch(err => { if (open) post('error', { text: String(err) }); });
}

// ČTECÍ SMYČKA: byte → text (stream) → řádkování → fronta
async function readLoop() {
  if (!reader) return;

  // lokální zbytek neukončené řádky
  let remainder = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;              // reader zrušen / port zavřen
    if (!value || !value.length) continue;

    // value je Uint8Array
    const chunk = textDecoder.decode(value, { stream: true });
    if (!chunk) continue;

    remainder += chunk;

    // rozdělení na řádky (CRLF i LF)
    for (;;) {
      const m = /\r?\n/.exec(remainder);
      if (!m) break;
      const end = m.index;
      const line = remainder.slice(0, end);
      remainder = remainder.slice(end + m[0].length);
      lineQueue.push(line);       // hotový kus do fronty (producent)
    }
  }

  // po ukončení čtení může zbýt „nedokončená“ řádka – pošli ji, jestli chceš
  if (remainder) lineQueue.push(remainder);
  lineQueue.close(); // odblokuj parseLoop (poison pill)
}

// PARSOVACÍ SMYČKA: bere z fronty a zpracovává
async function parseLoop() {
  for (;;) {
    const line = await lineQueue.pop(); // blokující čekání bez busy-waitu
    if (line == null) break;            // fronta uzavřena

    try {
      const parsed = parseData(line);
      if (parsed) post('data', { text: parsed });
    } catch (e) {
      post('error', { text: 'Parse error: ' + e.message });
    }
  }
}

function parseData(data) {
  // Tvoje parsování – sem si dej rámcování/JSON/CSV apod.
  // Příklad: trim + ignoruj prázdné
  const s = String(data ?? '').trim();
  return s;
}

async function writeLine(text) {
  if (!writer) return;
  const payload = textEncoder.encode(ADD_CRLF ? (text + '\r\n') : text);
  await writer.write(payload);
}

async function closePort() {
  try {
    open = false;

    // ukonči čtení (odblokuje readLoop)
    try {
      if (reader) {
        try { await reader.cancel(); } catch {}
        reader.releaseLock?.();
      }
    } catch {}

    // zavři frontu (odblokuje parseLoop, pokud zrovna čeká)
    try { lineQueue.close(); } catch {}

    try {
      if (writer) writer.releaseLock?.();
    } catch {}

    try { await port?.close(); } catch {}
  } finally {
    reader = null;
    writer = null;
    port = null;
    setStatus('Disconnected', { warn: true, connected: false });
  }
}

self.onmessage = async (e) => {
  const m = e.data ?? {};
  try {
    if (m.cmd === 'serial-start') {
      setStatus('Connecting…', { warn: true });
      await openPort(m.match, m.options);
      post('log', { text: `Port otevřen (baud=${m.options?.baudRate ?? '?'})` });
    } else if (m.cmd === 'serial-send') {
      await writeLine(m.data ?? '');
    } else if (m.cmd === 'serial-disconnect') {
      await closePort();
    }
  } catch (err) {
    post('error', { text: String(err) });
    await closePort();
  }
};
