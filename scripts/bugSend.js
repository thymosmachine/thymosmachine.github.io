/* ===== BugReporter (FormSubmit + success screen + max compression) ===== */
    (() => {
        const DEFAULTS = {
            delivery: 'formsubmit', // 'formsubmit' | 'gmail' | 'mailto'
            toEmail: 'thymos.machine@gmail.com',
            appName: `Moira v${(window.softwareVersion ?? 'dev')}`,
            autoOpenOnError: true,
            includeCookiesByDefault: false,
            maxConsoleEntries: 1000,
            maxResourcesListed: 300,
            screenshotTargetMaxBytes: 450 * 1024,            // ~450 kB
            screenshotPrefer: 'jpeg',
            screenshotQualitySteps: [0.45, 0.38, 0.32, 0.26, 0.22, 0.18, 0.15],
            screenshotScaleSteps: [1.0, 0.85, 0.7, 0.6, 0.5]
        };

        // ---- utils ----
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const nowISO = () => new Date().toISOString();
        const tsForName = () => nowISO().replace(/[:.]/g, '-');
        const tryJSON = (v) => {
            try {
                return JSON.stringify(v, null, 2);
            } catch {
                return String(v)
            }
        };
        const kebab = (s) => (s || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').slice(0, 80) || 'bug';
        const getRootEl = () => document.querySelector('#app[data-bugreporter-root]') || document.getElementById('app') || document.body;

        async function ensureScript(url, ok) {
            if (ok && ok()) return;
            await new Promise((res, rej) => {
                const s = document.createElement('script');
                s.src = url;
                s.async = true;
                s.onload = res;
                s.onerror = () => rej(new Error('Failed to load ' + url));
                document.head.appendChild(s);
            });
        }

        function downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 8000);
        }

        // ---- console & network capture ----
        const consoleBuffer = [];
        const originalConsole = {};
        const MAX_ENTRIES = () => (BugReporter._options?.maxConsoleEntries ?? DEFAULTS.maxConsoleEntries);

        ['log', 'info', 'warn', 'error', 'debug'].forEach(level => {
            originalConsole[level] = console[level].bind(console);
            console[level] = function (...args) {
                try {
                    consoleBuffer.push({
                        ts: nowISO(),
                        level,
                        msg: args.map(a => (typeof a === 'string' ? a : tryJSON(a))).join(' ')
                    });
                    if (consoleBuffer.length > MAX_ENTRIES()) consoleBuffer.shift();
                } catch {
                }
                return originalConsole[level](...args);
            };
        });

        const origFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
            const start = performance.now();
            const [input, init] = args;
            const url = typeof input === 'string' ? input : (input?.url ?? '');
            const method = (init?.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();
            try {
                const res = await origFetch(...args);
                const dur = Math.round(performance.now() - start);
                consoleBuffer.push({
                    ts: nowISO(),
                    level: 'info',
                    msg: `[fetch] ${method} ${url} -> ${res.status} (${dur}ms)`
                });
                if (consoleBuffer.length > MAX_ENTRIES()) consoleBuffer.shift();
                return res;
            } catch (e) {
                const dur = Math.round(performance.now() - start);
                consoleBuffer.push({
                    ts: nowISO(),
                    level: 'error',
                    msg: `[fetch] ${method} ${url} -> ERROR (${dur}ms): ${e && e.message}`
                });
                if (consoleBuffer.length > MAX_ENTRIES()) consoleBuffer.shift();
                throw e;
            }
        };

        (function () {
            const origOpen = XMLHttpRequest.prototype.open, origSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                this.__br = {method, url, start: 0};
                return origOpen.call(this, method, url, ...rest);
            };
            XMLHttpRequest.prototype.send = function (...args) {
                this.__br.start = performance.now();
                const onloadend = () => {
                    const d = this.__br;
                    const dur = Math.round(performance.now() - d.start);
                    const status = this.status;
                    consoleBuffer.push({
                        ts: nowISO(),
                        level: (status >= 400 ? 'error' : 'info'),
                        msg: `[xhr] ${d.method} ${d.url} -> ${status} (${dur}ms)`
                    });
                    if (consoleBuffer.length > MAX_ENTRIES()) consoleBuffer.shift();
                    this.removeEventListener('loadend', onloadend);
                };
                this.addEventListener('loadend', onloadend);
                return origSend.apply(this, args);
            };
        })();

        // ---- collectors ----
        const collectConsoleText = () => consoleBuffer.map(e => `[${e.ts}] ${e.level.toUpperCase()} ${e.msg}`).join('\n');
        const collectRegularLog = () => {
            const el = document.getElementById('regularLog');
            return el ? (el.innerText || el.textContent || '') : '';
        };

        function collectStorage(storage) {
            const o = {};
            try {
                for (let i = 0; i < storage.length; i++) {
                    const k = storage.key(i);
                    try {
                        o[k] = storage.getItem(k);
                    } catch {
                        o[k] = '[unreadable]';
                    }
                }
            } catch {
            }
            return o;
        }

        function collectCookies() {
            const out = {};
            (document.cookie || '').split(';').map(s => s.trim()).filter(Boolean).forEach(p => {
                const i = p.indexOf('=');
                const n = i >= 0 ? p.slice(0, i) : p;
                const v = i >= 0 ? decodeURIComponent(p.slice(i + 1)) : '';
                out[n] = v;
            });
            return out;
        }

        async function collectCaches() {
            try {
                if (!('caches' in window)) return {available: false};
                const keys = await caches.keys();
                return {available: true, keys};
            } catch (e) {
                return {available: false, error: e.message};
            }
        }

        async function collectIDBMeta() {
            try {
                if (!('indexedDB' in window) || !indexedDB.databases) return {available: false};
                const dbs = await indexedDB.databases();
                return {available: true, databases: dbs};
            } catch (e) {
                return {available: false, error: e.message};
            }
        }

        function collectEnv() {
            const n = navigator, dpr = window.devicePixelRatio || 1;
            const conn = n.connection || n.mozConnection || n.webkitConnection || {};
            const nav = performance.getEntriesByType?.('navigation')?.[0];
            const resources = (performance.getEntriesByType?.('resource') || []).slice(0, BugReporter._options?.maxResourcesListed ?? DEFAULTS.maxResourcesListed).map(r => ({
                name: r.name,
                type: r.initiatorType,
                dur: Math.round(r.duration)
            }));
            return {
                collectedAt: nowISO(),
                url: location.href,
                referrer: document.referrer,
                userAgent: n.userAgent,
                platform: n.platform,
                languages: n.languages,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                online: n.onLine,
                hardwareConcurrency: n.hardwareConcurrency,
                deviceMemory: n.deviceMemory,
                screen: {
                    w: screen.width,
                    h: screen.height,
                    availW: screen.availWidth,
                    availH: screen.availHeight,
                    colorDepth: screen.colorDepth,
                    pixelRatio: dpr
                },
                viewport: {
                    w: document.documentElement.clientWidth,
                    h: document.documentElement.clientHeight,
                    scrollX: scrollX,
                    scrollY: scrollY
                },
                performance: {
                    navigationType: nav?.type,
                    domComplete: Math.round(nav?.domComplete ?? 0),
                    loadEventEnd: Math.round(nav?.loadEventEnd ?? 0),
                    resources
                },
                connection: {
                    effectiveType: conn.effectiveType,
                    downlink: conn.downlink,
                    rtt: conn.rtt,
                    saveData: conn.saveData
                },
                serviceWorker: {controller: !!navigator.serviceWorker?.controller}
            };
        }

        // ---- screenshot (root only) + agresivní komprese ----
        async function renderWithHtml2Canvas(el, scale, onclone) {
            await ensureScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', () => window.html2canvas);
            return await window.html2canvas(el, {
                useCORS: true, allowTaint: true, logging: false, foreignObjectRendering: true,
                width: el.scrollWidth, height: el.scrollHeight, scale, onclone
            });
        }

        async function canvasToBlob(canvas, mime, quality) {
            return new Promise(res => canvas.toBlob(b => res(b), mime, quality));
        }

        async function htmlToImageBlob(el, prefer, scale, quality) {
            await ensureScript('https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js', () => window.htmlToImage);
            if (prefer === 'jpeg') {
                const dataUrl = await window.htmlToImage.toJpeg(el, {pixelRatio: scale, quality});
                const r = await fetch(dataUrl);
                return await r.blob();
            }
            return await window.htmlToImage.toBlob(el, {pixelRatio: scale, backgroundColor: null, cacheBust: true});
        }

        function getMaxCanvasDim() {
            // Konzervativně: Chrome/Safari/WebKit ~16384, Firefox zvládne víc.
            const ua = navigator.userAgent;
            return /firefox/i.test(ua) ? 32767 : 16384;
        }

        async function renderWithHtml2Canvas(el, scale, onclone) {
            await ensureScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', () => window.html2canvas);
            return await window.html2canvas(el, {
                useCORS: true,
                allowTaint: true,
                logging: false,
                foreignObjectRendering: true,
                width: el.scrollWidth,
                height: el.scrollHeight,
                scale,
                onclone
            });
        }

        async function canvasToBlob(canvas, mime, quality) {
            return new Promise(res => canvas.toBlob(b => res(b), mime, quality));
        }

        async function htmlToImageBlob(el, prefer, scale, quality) {
            await ensureScript('https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js', () => window.htmlToImage);
            if (prefer === 'jpeg') {
                const dataUrl = await window.htmlToImage.toJpeg(el, {pixelRatio: scale, quality});
                const r = await fetch(dataUrl);
                return await r.blob();
            }
            return await window.htmlToImage.toBlob(el, {pixelRatio: scale, backgroundColor: null, cacheBust: true});
        }

        async function takeCompressedScreenshot() {
            const el = (typeof getRootEl === 'function' ? getRootEl() : document.querySelector('#app[data-bugreporter-root]')) || document.getElementById('app') || document.body;
            if (!el) return null;

            const prefer = (BugReporter._options?.screenshotPrefer || 'jpeg').toLowerCase();
            const mime = prefer === 'jpeg' ? 'image/jpeg' : 'image/png';
            const target = BugReporter._options?.screenshotTargetMaxBytes ?? (450 * 1024); // zůstáváme „co nejmenší“
            const qSteps = BugReporter._options?.screenshotQualitySteps ?? [0.45, 0.38, 0.32, 0.26, 0.22, 0.18, 0.15];
            const sSteps = BugReporter._options?.screenshotScaleSteps ?? [1.0, 0.85, 0.7, 0.6, 0.5];

            // → klíč: bezpečné měřítko, aby se NIC neořízlo (max canvas dim)
            const MAX = Math.min(getMaxCanvasDim(), BugReporter._options?.maxCanvasDim || getMaxCanvasDim());
            const margin = 256; // drobná rezerva
            const w = Math.max(el.scrollWidth || el.clientWidth || 1, 1);
            const h = Math.max(el.scrollHeight || el.clientHeight || 1, 1);
            const clampScale = (s) => {
                const sx = (MAX - margin) / w;
                const sy = (MAX - margin) / h;
                // nikdy neupsamplovat; bereme nejnižší z limitů
                return Math.max(0.1, Math.min(s, sx, sy, 1.0));
            };

            const badColor = /(color|oklch|lch|lab|hwb|color-mix)\(/i;
            const onclone = (doc) => {
                // najdi klonovaný root a vynucuj plnou viditelnost obsahu
                const root = doc.querySelector('#app[data-bugreporter-root]') || doc.getElementById('app') || doc.body;
                if (root) {
                    root.style.overflow = 'visible';
                    root.style.maxHeight = 'none';
                    root.style.height = 'auto';
                    root.style.transform = 'none';
                }
                // základní „sanitizace“ moderních barev → uloží computed (většinou rgb/rgba)
                const props = ['color', 'backgroundColor', 'borderColor', 'outlineColor'];
                doc.querySelectorAll('*').forEach(node => {
                    try {
                        const cs = doc.defaultView.getComputedStyle(node);
                        props.forEach(p => {
                            const v = cs[p];
                            if (v && badColor.test(v)) node.style[p] = v;
                        });
                    } catch {
                    }
                });
            };

            let best = null;
            for (const s of sSteps) {
                const safeScale = clampScale(s); // <<< TADY se zabrání ořezu
                // html2canvas cesta
                try {
                    const canvas = await renderWithHtml2Canvas(el, safeScale, onclone);
                    for (const q of qSteps) {
                        const blob = await canvasToBlob(canvas, mime, prefer === 'jpeg' ? q : undefined);
                        if (!best || blob.size < best.size) best = blob;
                        if (blob.size <= target) return blob;
                    }
                } catch {
                }

                // fallback engine
                for (const q of qSteps) {
                    try {
                        const blob = await htmlToImageBlob(el, prefer, safeScale, prefer === 'jpeg' ? q : undefined);
                        if (!best || blob.size < best.size) best = blob;
                        if (blob.size <= target) return blob;
                    } catch {
                    }
                }
            }
            // vrátíme nejmenší dostupný (bez ořezu), i když je nad cílovou velikostí
            return best;
        }

        // ---- ZIP (DEFLATE level 9) ----
        async function makeZip(files, zipName = 'bugreport.zip') {
            await ensureScript('./packages/zip/jszip.min.js', () => window.JSZip);
            const zip = new JSZip();
            files.forEach(f => zip.file(f.name, f.blob, {compression: 'DEFLATE', compressionOptions: {level: 9}}));
            const blob = await zip.generateAsync({type: 'blob'});
            blob.name = zipName;
            return blob;
        }

        // ---- overlay UI + body lock & inert ----
        function injectStyles() {
            if (document.getElementById('bugreporter-styles')) return;
            const s = document.createElement('style');
            s.id = 'bugreporter-styles';
            s.textContent = `
      .br-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:2147483647}
      .br-modal{background:#fff;border-radius:16px;width:min(1024px,90vw);max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);font:14px/1.4 system-ui,Segoe UI,Roboto,Arial;padding:20px}
      .br-row{display:flex;gap:12px}.br-col{flex:1}
      .br-title{font-weight:700;font-size:18px;margin:0 0 8px}.br-sub{font-size:12px;color:#666;margin:0 0 16px}
      .br-field{margin:10px 0}.br-field label{display:block;font-weight:600;margin-bottom:4px}
      .br-input,.br-textarea,.br-select{width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:10px;padding:10px;outline:none}
      .br-textarea{min-height:100px;resize:vertical}
      .br-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
      .br-btn{border:0;border-radius:999px;padding:10px 14px;cursor:pointer}.br-btn.primary{background:#111;color:#fff}.br-btn.secondary{background:#f1f1f1}
      .br-small{font-size:12px;color:#555}.br-check{display:flex;align-items:center;gap:8px;margin:6px 0}
      .br-badge{display:inline-block;background:#eee;border-radius:999px;padding:2px 8px;font-size:12px;margin-left:6px}
      .br-success{color:#0a7d40}.br-error{color:#b00020}
      .br-no-scroll{overflow:hidden!important}
      .br-backdrop-inert{pointer-events:none!important; user-select:none!important}
      .br-center{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
      @media (prefers-color-scheme: dark){ .br-modal{background:#1c1c1c;color:#eaeaea} .br-input,.br-textarea,.br-select{background:#111;border-color:#333;color:#eaeaea} }
    `;
            document.head.appendChild(s);
        }

        function lockBackground() {
            document.documentElement.classList.add('br-no-scroll');
            document.body.classList.add('br-no-scroll');
            const app = getRootEl();
            if (app) {
                app.setAttribute('aria-hidden', 'true');
                try {
                    app.inert = true;
                } catch {
                    app.classList.add('br-backdrop-inert');
                }
            }
        }

        function unlockBackground() {
            document.documentElement.classList.remove('br-no-scroll');
            document.body.classList.remove('br-no-scroll');
            const app = getRootEl();
            if (app) {
                app.removeAttribute('aria-hidden');
                try {
                    app.inert = false;
                } catch {
                    app.classList.remove('br-backdrop-inert');
                }
            }
        }

        function showSuccess(overlay, {zipBlob, zipName, subject, bodyShort}) {
            const modal = overlay.querySelector('.br-modal');
            modal.innerHTML = `
      <div class="br-center">
        <div style="font-size:40px">✅</div>
        <h3 class="br-title">Thank you! The report was successfully sent.</h3>
        <p class="br-small">You can also download the ZIP <b>report</b> file.</p>
        <div class="br-actions" style="justify-content:center">
          <button class="br-btn primary" id="br-download">Download ZIP (${(zipBlob.size / 1024 / 1024).toFixed(2)} MB)</button>
          <button class="br-btn secondary" id="br-close">Close</button>
        </div>
        <details class="br-small"><summary>Send from client (optional)</summary>
          <div style="margin-top:8px">
            <a id="br-gmail" class="br-btn secondary">Open Gmail</a>
            <a id="br-mailto" class="br-btn secondary">Open e-mail client</a>
          </div>
        </details>
      </div>
    `;
            modal.querySelector('#br-download').onclick = () => downloadBlob(zipBlob, zipName);
            modal.querySelector('#br-close').onclick = () => {
                unlockBackground();
                overlay.remove();
            };
            // pomocné odkazy
            const encSub = encodeURIComponent(subject),
                encBody = encodeURIComponent(bodyShort + `\n\nAttached: ${zipName}`);
            modal.querySelector('#br-gmail').href = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(BugReporter._options.toEmail)}&su=${encSub}&body=${encBody}`;
            modal.querySelector('#br-gmail').target = '_blank';
            modal.querySelector('#br-mailto').href = `mailto:${encodeURIComponent(BugReporter._options.toEmail)}?subject=${encSub}&body=${encBody}`;
        }

        function buildOverlay(prefill = {}) {
            const existing = document.querySelector('.br-overlay');
            if (existing) return {close: () => existing.remove(), overlay: existing};

            injectStyles();
            const overlay = document.createElement('div');
            overlay.className = 'br-overlay';
            overlay.innerHTML = `
      <div class="br-modal" role="dialog" aria-modal="true" aria-label="Report a bug">
        <h3 class="br-title">🐞 Report a bug <span class="br-badge">${BugReporter._options.appName}</span></h3>
        <p class="br-sub">Logs, environment information, and optionally a screenshot will be attached.</p>

        <div class="br-field"><label>Summary</label><input class="br-input" id="br-summary" placeholder="Short, specific title" value="${prefill.summary ?? ''}"/></div>
        <div class="br-row">
          <div class="br-col br-field"><label>Severity</label>
            <select class="br-select" id="br-severity"><option>Low</option><option>Medium</option><option selected>High</option><option>Critical</option></select>
          </div>
          <div class="br-col br-field"><label>Your email (optional)</label>
            <input class="br-input" id="br-useremail" placeholder="you@example.com" value="${prefill.userEmail ?? ''}"/>
          </div>
        </div>

        <div class="br-field"><label>Steps to reproduce</label><textarea class="br-textarea" id="br-steps">${prefill.steps ?? ''}</textarea></div>
        <div class="br-field"><label>Expected result</label><textarea class="br-textarea" id="br-expected">${prefill.expected ?? ''}</textarea></div>
        <div class="br-field"><label>Actual result / error</label><textarea class="br-textarea" id="br-actual">${prefill.actual ?? (prefill.errorMessage ?? '')}</textarea></div>

        <div class="br-check"><input type="checkbox" id="br-include-screenshot" ${prefill.includeScreenshot === false ? '' : 'checked'} />
          <label for="br-include-screenshot" class="br-small">Attach screenshot of the App</label></div>
        <div class="br-check"><input type="checkbox" id="br-include-storage" checked />
          <label for="br-include-storage" class="br-small">Attach localStorage + sessionStorage</label></div>
        <div class="br-check"><input type="checkbox" id="br-include-cookies" ${BugReporter._options.includeCookiesByDefault ? 'checked' : ''} />
          <label for="br-include-cookies" class="br-small">Attach cookies (they may contain personal data)</label></div>

        <div id="br-status" class="br-small"></div>

        <div class="br-actions">
          <button class="br-btn secondary" id="br-cancel">Cancel</button>
          <button class="br-btn primary" id="br-submit">Send report</button>
        </div>
      </div>`;
            document.body.appendChild(overlay);
            lockBackground();

            function close() {
                unlockBackground();
                overlay.remove();
            }

            overlay.querySelector('#br-cancel').onclick = close;
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close();
            });
            overlay.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') close();
            });

            overlay.querySelector('#br-submit').onclick = async () => {
                const status = overlay.querySelector('#br-status');
                status.textContent = 'Collecting data…';
                try {
                    const summary = overlay.querySelector('#br-summary').value.trim() || 'Bug report';
                    const severity = overlay.querySelector('#br-severity').value;
                    const steps = overlay.querySelector('#br-steps').value;
                    const expected = overlay.querySelector('#br-expected').value;
                    const actual = overlay.querySelector('#br-actual').value;
                    const userEmail = overlay.querySelector('#br-useremail').value.trim() || undefined;

                    const includeScreenshot = overlay.querySelector('#br-include-screenshot').checked;
                    const includeStorage = overlay.querySelector('#br-include-storage').checked;
                    const includeCookies = overlay.querySelector('#br-include-cookies').checked;

                    // files
                    const files = [];
                    const meta = {
                        summary,
                        severity,
                        steps,
                        expected,
                        actual,
                        userEmail,
                        appName: BugReporter._options.appName,
                        collectedAt: nowISO(),
                        url: location.href
                    };
                    files.push({
                        name: 'meta.json',
                        blob: new Blob([JSON.stringify(meta, null, 2)], {type: 'application/json'})
                    });
                    files.push({name: 'console.log.txt', blob: new Blob([collectConsoleText()], {type: 'text/plain'})});
                    const regLog = collectRegularLog();
                    if (regLog) files.push({
                        name: 'regularLog.pre.txt',
                        blob: new Blob([regLog], {type: 'text/plain'})
                    });
                    files.push({
                        name: 'environment.json',
                        blob: new Blob([JSON.stringify(collectEnv(), null, 2)], {type: 'application/json'})
                    });
                    if (includeStorage) {
                        files.push({
                            name: 'localStorage.json',
                            blob: new Blob([JSON.stringify(collectStorage(localStorage), null, 2)], {type: 'application/json'})
                        });
                        files.push({
                            name: 'sessionStorage.json',
                            blob: new Blob([JSON.stringify(collectStorage(sessionStorage), null, 2)], {type: 'application/json'})
                        });
                    }
                    if (includeCookies) files.push({
                        name: 'cookies.json',
                        blob: new Blob([JSON.stringify(collectCookies(), null, 2)], {type: 'application/json'})
                    });
                    const [cachesMeta, idbMeta] = await Promise.all([collectCaches(), collectIDBMeta()]);
                    files.push({
                        name: 'caches.json',
                        blob: new Blob([JSON.stringify(cachesMeta, null, 2)], {type: 'application/json'})
                    });
                    files.push({
                        name: 'indexedDB.json',
                        blob: new Blob([JSON.stringify(idbMeta, null, 2)], {type: 'application/json'})
                    });

                    if (includeScreenshot) {
                        status.textContent = 'Rendering screenshot…';
                        const shot = await takeCompressedScreenshot();
                        if (shot) files.push({name: `screenshot-${kebab(summary)}.jpg`, blob: shot});
                    }

                    // zip
                    status.textContent = 'Packing ZIP…';
                    const zipName = `bugreport-${kebab(summary)}-${tsForName()}.zip`;
                    let zipBlob = await makeZip(files, zipName);

                    // limit FormSubmit ( ≤ 5MB součet souborů ) – když je moc velký, odstraníme screenshot
                    const MAX_BYTES = 4.8 * 1024 * 1024;
                    if (zipBlob.size > MAX_BYTES) {
                        const idx = files.findIndex(f => f.name.startsWith('screenshot-'));
                        if (idx >= 0) {
                            files.splice(idx, 1);
                            zipBlob = await makeZip(files, zipName);
                        }
                    }

                    // deliver
                    status.textContent = 'Sending / preparing email…';
                    const subject = `[${BugReporter._options.appName}] Bug: ${summary} (sev: ${severity})`;
                    const bodyShort = [
                        `App: ${BugReporter._options.appName}`, `URL: ${location.href}`, `When: ${nowISO()}`,
                        userEmail ? `Reporter: ${userEmail}` : '', '', 'Steps:', steps || '(not provided)', '',
                        'Expected:', expected || '(not provided)', '', 'Actual:', (actual || '(not provided)').slice(0, 1000)
                    ].join('\n');

                    await deliver(zipBlob, zipName, subject, bodyShort);

                    // success UI + „thanks“ + dowloand ZIP
                    showSuccess(overlay, {zipBlob, zipName, subject, bodyShort});
                } catch (e) {
                    status.innerHTML = `<span class="br-error">❌ Failed: ${e.message}</span>`;
                }
            };

            return {close, overlay};
        }

        // ---- delivery (FormSubmit → fallback) ----
        async function deliver(zipBlob, zipName, subject, bodyShort) {
            const o = BugReporter._options;

            if (o.delivery === 'formsubmit') {
                const fd = new FormData();
                fd.append('_subject', subject);
                fd.append('_captcha', 'false');                 // volitelné vypnutí captcha
                fd.append('message', bodyShort + `\n\nAttached: ${zipName}`);
                // DŮLEŽITÉ: pošli jako File (s typem application/zip), FormSubmit to zpracuje jako přílohu
                const file = new File([zipBlob], zipName, {type: 'application/zip'});
                fd.append('attachment', file);                  // název pole „attachment“ dle jejich dokumentace

                const url = `https://formsubmit.co/${encodeURIComponent(o.toEmail)}`;
                const res = await fetch(url, {method: 'POST', body: fd}); // NEnastavuj Content-Type – prohlížeč doplní boundary
                if (res.ok) return;

                console.warn('FormSubmit failed with status', res.status);
            }

            // fallback – stáhneme ZIP a otevřeme klienta pro ruční přiložení
            downloadBlob(zipBlob, zipName);
            const encSub = encodeURIComponent(subject),
                encBody = encodeURIComponent(bodyShort + `\n\nAttached: ${zipName}`);
            if (o.delivery === 'gmail') window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(o.toEmail)}&su=${encSub}&body=${encBody}`, '_blank');
            else window.location.href = `mailto:${encodeURIComponent(o.toEmail)}?subject=${encSub}&body=${encBody}`;
        }

        // ---- public API ----
        const BugReporter = {
            _options: {...DEFAULTS},
            init(options = {}) {
                this._options = {...DEFAULTS, ...options};

                // přímé napojení + delegace (overlay se vždy otevře)
                const wireBtn = () => {
                    const btn = document.getElementById('reportButton');
                    if (btn && !btn.dataset.brWired) {
                        if (typeof btn.onclick !== 'function') btn.addEventListener('click', (e) => {
                            e.preventDefault();
                            this.open();
                        });
                        btn.dataset.brWired = '1';
                    }
                };
                wireBtn();
                document.addEventListener('DOMContentLoaded', wireBtn);
                document.addEventListener('click', (e) => {
                    const t = e.target && (e.target.id === 'reportButton' ? e.target : e.target.closest && e.target.closest('#reportButton'));
                    if (t) {
                        e.preventDefault();
                        this.open();
                    }
                }, true);

                if (this._options.autoOpenOnError) {
                    window.addEventListener('error', (ev) => {
                        const msg = ev?.error?.stack || ev?.message || 'Unknown error';
                        this.open({errorMessage: msg});
                    });
                    window.addEventListener('unhandledrejection', (ev) => {
                        const msg = (ev?.reason && (ev.reason.stack || ev.reason.message)) || tryJSON(ev?.reason) || 'Unhandled rejection';
                        this.open({errorMessage: msg});
                    });
                }
                return this;
            },
            open(prefill = {}) {
                return buildOverlay(prefill);
            },
            async reportNow({
                                summary = 'Auto bug',
                                severity = 'High',
                                steps = '',
                                expected = '',
                                actual = '',
                                includeScreenshot = true,
                                includeStorage = true,
                                includeCookies = false,
                                userEmail
                            } = {}) {
                const {overlay} = buildOverlay({summary, severity, steps, expected, actual, includeScreenshot});
                overlay.querySelector('#br-include-storage').checked = !!includeStorage;
                overlay.querySelector('#br-include-cookies').checked = !!includeCookies;
                overlay.querySelector('#br-useremail').value = userEmail || '';
                overlay.querySelector('#br-submit').click();
            }
        };

        // mount – tvoje defaultní nastavení
        window.BugReporter = BugReporter;
        BugReporter.init({
            delivery: 'formsubmit',
            toEmail: 'thymos.machine@gmail.com',
            appName: `Moira v${(window.softwareVersion ?? 'dev')}`,
            screenshotTargetMaxBytes: 450 * 1024,
            screenshotQualitySteps: [0.45, 0.38, 0.32, 0.26, 0.22, 0.18, 0.15],
            screenshotScaleSteps: [1.0, 0.85, 0.7, 0.6, 0.5]
        });
    })();