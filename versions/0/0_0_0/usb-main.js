// UI helpers
const byId = (id) => document.getElementById(id);
const logEl = byId('usbLog');
const statusEl = byId('usbStatus');

const usbConnectBtn = byId('usbConnectBtn');
const usbDisconnectBtn = byId('usbDisconnectBtn');
const usbSendBtn = byId('usbSendBtn');
const usbCmd = byId('usbCmd');

let worker = new Worker('./usb-worker.js', {type: 'module'});
let selectedIds = null; // {vendorId, productId, serialNumber?}

function log(line, cls = '') {
    const div = document.createElement('div');
    if (cls) div.className = cls;
    div.textContent = line;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text, cls = '') {
    statusEl.className = cls;
    statusEl.textContent = text;
}

function enableUi(connected) {
    usbConnectBtn.disabled = connected;
    usbDisconnectBtn.disabled = !connected;
    usbSendBtn.disabled = !connected;
}

usbConnectBtn?.addEventListener('click', async () => {
    try {
        // POZOR: uprav filtry dle svého zařízení:
        const device = await navigator.usb.requestDevice({
            filters: [// { vendorId: 0x2341 }, // Arduino (příklad)
                // { vendorId: 0x16C0 }, // Teensy (příklad)
                // ... nebo nech prázdné, ale uživateli se pak ukáže hodně zařízení
            ]
        });

        selectedIds = {
            vendorId: device.vendorId,
            productId: device.productId,
            serialNumber: device.serialNumber ?? null,
            productName: device.productName ?? ''
        };

        log(`Vybrané USB: VID=0x${device.vendorId.toString(16)}, PID=0x${device.productId.toString(16)}, SN=${device.serialNumber ?? '-'}`);
        setStatus('Connecting…', 'warn');

        worker.postMessage({cmd: 'usb-start', ids: selectedIds});
    } catch (err) {
        log(`requestDevice: ${err}`, 'err');
    }
});

usbDisconnectBtn?.addEventListener('click', () => {
    worker.postMessage({cmd: 'usb-disconnect'});
});

usbSendBtn?.addEventListener('click', () => {
    const text = usbCmd.value ?? '';
    if (!text.trim()) return;
    worker.postMessage({cmd: 'usb-send', data: text});
});

usbCmd?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') usbSendBtn?.click();
});

// Zprávy z workeru
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
        // ignore
    }
};

// (volitelné) znovuvytvoření workeru po reloadu/odpojení
window.addEventListener('beforeunload', () => worker.terminate());
