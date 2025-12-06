// Konfigurace zařízení (UPRAV dle svého USB zařízení!)
const CONFIG = 1;             // obvyklá defaultní config=1
const INTERFACE = 0;          // číslo interface, který chceš claimnout
const ENDPOINT_IN = 1;        // číslo IN endpointu (zařízení -> host)
const ENDPOINT_OUT = 2;       // číslo OUT endpointu (host -> zařízení)
const PACKET_SIZE = 64;       // typicky 64/512/64k – dle zařízení
const ADD_CRLF = true;        // přidat \r\n při odeslání

let device = null;
let open = false;
let readerActive = false;
const textDecoder = new TextDecoder();
let rxBuffer = '';

function post(type, payload) {
    self.postMessage({type, ...payload});
}

function setStatus(text, {ok = false, warn = false, connected = false} = {}) {
    post('status', {text, ok, warn, connected});
}

async function openDevice(ids) {
    // Najdi povolené zařízení (po requestDevice v main threadu)
    const devs = await navigator.usb.getDevices();
    device = devs.find(d => d.vendorId === ids.vendorId && d.productId === ids.productId && (!ids.serialNumber || d.serialNumber === ids.serialNumber)) ?? devs[0];

    if (!device) throw new Error('USB device not found after permission');

    await device.open();

    // selectConfiguration jen pokud je jiná/žádná
    if (!device.configuration || device.configuration.configurationValue !== CONFIG) {
        await device.selectConfiguration(CONFIG);
    }

    await device.claimInterface(INTERFACE);

    open = true;
    setStatus('Connected', {ok: true, connected: true});
    post('log', {text: `Opened ${device.productName ?? ''} (VID=0x${device.vendorId.toString(16)}, PID=0x${device.productId.toString(16)})`});
}

async function closeDevice() {
    try {
        open = false;
        if (device) {
            // releaseInterface není povinné, ale vhodné
            try {
                await device.releaseInterface(INTERFACE);
            } catch {
            }
            try {
                await device.close();
            } catch {
            }
        }
    } finally {
        device = null;
        setStatus('Disconnected', {warn: true, connected: false});
    }
}

async function readLoop() {
    if (!device) return;
    readerActive = true;
    try {
        while (open) {
            const res = await device.transferIn(ENDPOINT_IN, PACKET_SIZE);
            if (res.status !== 'ok' || !res.data) continue;
            const chunk = textDecoder.decode(res.data.buffer);
            if (!chunk) continue;

            // jednoduché řádkování
            rxBuffer += chunk;
            const lines = rxBuffer.split(/\r?\n/);
            rxBuffer = lines.pop() ?? '';
            for (const line of lines) {
                post('data', {text: line});
            }
        }
    } catch (err) {
        // pokud jsme to sami nezavřeli
        if (open) post('error', {text: String(err)});
    } finally {
        readerActive = false;
    }
}

async function usbSend(data) {
    if (!device || !open) return;
    const enc = new TextEncoder();
    const payload = enc.encode(ADD_CRLF ? (data + '\r\n') : data);
    const res = await device.transferOut(ENDPOINT_OUT, payload);
    if (res.status !== 'ok') post('log', {text: `TX status: ${res.status}`});
}

self.onmessage = async (e) => {
    const m = e.data ?? {};
    try {
        if (m.cmd === 'usb-start') {
            setStatus('Connecting…', {warn: true});
            await openDevice(m.ids);
            // start čtecí smyčky (neblokuje worker úplně – ale je to asynchronní)
            readLoop();
        } else if (m.cmd === 'usb-send') {
            await usbSend(m.data ?? '');
        } else if (m.cmd === 'usb-disconnect') {
            await closeDevice();
        }
    } catch (err) {
        post('error', {text: String(err)});
        await closeDevice();
    }
};
