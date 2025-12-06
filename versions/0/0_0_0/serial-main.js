const byId = (id) => document.getElementById(id);
const logEl = byId('serLog');
const statusEl = byId('serStatus');

const serConnectBtn = byId('serConnectBtn');
const serDisconnectBtn = byId('serDisconnectBtn');
const serSendBtn = byId('serSendBtn');
const serCmd = byId('serCmd');

let worker = new Worker('./serial-worker.js', {type: 'module'});
let match = null; // {vid, pid}


let lines = 0;

function log(line, cls = '') {
    const div = document.createElement('div');
    if (cls) div.className = cls;
    div.textContent = line;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
    lines++;
    if (lines > 3) {
        logEl.removeChild(logEl.firstChild);
    }
}

function setStatus(text, cls = '') {
    statusEl.className = cls;
    statusEl.textContent = text;
}

function enableUi(connected) {
    serConnectBtn.disabled = connected;
    serDisconnectBtn.disabled = !connected;
    serSendBtn.disabled = !connected;
}

serConnectBtn?.addEventListener('click', async () => {
    try {
        // uživatelské gesto → requestPort
        const port = await navigator.serial.requestPort({
            // volitelně:
            //
            // filters: [
            //     { usbVendorId: 0x2341 }, // Arduino SA
            //     { usbVendorId: 0x2A03 }, // Arduino (dřívější VID)
            //     { usbVendorId: 0x16C0 }, // PJRC (Teensy)
            //
            //     // Volitelné: USB-serial převodníky (klony Arduino apod.)
            //     { usbVendorId: 0x1A86 }, // WCH (CH340/CH341)
            //     { usbVendorId: 0x10C4 }, // Silicon Labs (CP210x)
            //     { usbVendorId: 0x0403 }, // FTDI
            //     { usbVendorId: 0x067B }, // Prolific (PL2303)
            //   ]

            // filters: [
            //    { usbVendorId: 0x2341, usbProductId: 0x0043 }, // Arduino Uno (příklad)
            //    { usbVendorId: 0x16C0, usbProductId: 0x0483 }, // Teensy (Serial mód – příklad)
            //  ]

            filters: [{usbVendorId: 0x303a, usbProductId: 0x1001}] // Example: DFRobot Bluno (Arduino 101)
        });

        const info = port.getInfo?.() ?? {};
        match = {
            vid: info.usbVendorId ?? null, pid: info.usbProductId ?? null
        };

        log(`Vybraný port: VID=0x${(match.vid ?? 0).toString(16)}, PID=0x${(match.pid ?? 0).toString(16)}`);
        setStatus('Connecting…', 'warn');

        // Worker si port dohledá přes getPorts() a otevře
        worker.postMessage({
            cmd: 'serial-start', match, options: {
                baudRate: 921_600,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none',
                bufferSize: Math.min(Math.max(65_536  * 256, 0), 16_777_216) // volitelně
            }
        });
    } catch (err) {
        log(`requestPort: ${err}`, 'err');
    }
});

serDisconnectBtn?.addEventListener('click', () => {
    worker.postMessage({cmd: 'serial-disconnect'});
});

serSendBtn?.addEventListener('click', () => {
    const text = serCmd.value ?? '';
    if (!text.trim()) return;
    worker.postMessage({cmd: 'serial-send', data: text});
});

serCmd?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') serSendBtn?.click();
});

// zprávy z workeru
worker.onmessage = (e) => {
    const m = e.data ?? {};
    switch (m.type) {
        case 'status':
            setStatus(m.text, m.ok ? 'ok' : (m.warn ? 'warn' : ''));
            enableUi(!!m.connected);
            break;
        case 'log':
            log(m.text);
            break;
        case 'data':
            log(`RX: ${m.text}`);
            break;
        case 'error':
            log(`Error: ${m.text}`, 'err');
            setStatus('Error', 'err');
            enableUi(false);
            break;
        default:
            break; // ignore
    }
};

window.addEventListener('beforeunload', () => worker.terminate());
