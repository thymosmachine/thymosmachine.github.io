(() => {
    const MAX_LIVE = 3;
    const MIN_VISIBLE_MS_FOR_FORCED_CLOSE = 2500;
    const HOVER_MAX_EXTRA_MS = 2000;

    const ANIM_MS = 300;
    const BETWEEN_OP_MS = 200;

    // pevná šířka toastu
    const TOAST_WIDTH_PX = 420;

    // ========== DOM + STYL ==========
    const id = "toast-container";
    if (!document.getElementById(id)) {
        const c = document.createElement("div");
        c.id = id;
        document.body.appendChild(c);

        const css = document.createElement("style");
        css.textContent = `
#toast-container{
  position:fixed; inset:auto auto 16px 16px; /* vlevo dole */
  display:flex; flex-direction:column; gap:14px; /* mezera mezi toasty */
  z-index:99999; pointer-events:none; align-items:flex-start;
  max-width:min(92vw, ${TOAST_WIDTH_PX}px);
}

.toast{
  pointer-events:auto;
  width:${TOAST_WIDTH_PX}px; max-width:92vw; min-width:${TOAST_WIDTH_PX}px;
  box-sizing:border-box;
  padding:14px 14px 14px 12px; border-radius:12px;
  background:#fff; color:#0b0b0b;
  display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:start;

  /* zalamování textu */
  white-space:normal;
  overflow-wrap:anywhere;
  word-break:break-word;

  opacity:0; transform:translateY(22px); filter:none;
  transition:transform .3s ease, opacity .3s ease, filter .3s ease;
  box-shadow:-8px 12px 28px rgba(0,0,0,.18);
  will-change: transform, opacity, filter;
}

.toast.show{ opacity:1; transform:translateY(0); }
.toast.hide-left{ opacity:0; transform:translateX(-28px); filter:blur(1px); }

.toast--info    { border-left:6px solid #3b82f6; }
.toast--success { border-left:6px solid #10b981; }
.toast--warn    { border-left:6px solid #f59e0b; }
.toast--error   { border-left:6px solid #ef4444; }

.toast__icon{ font-size:18px; line-height:1; margin-top:2px; }
.toast__title{ font-weight:600; margin:2px 0 2px; }
.toast__msg{ opacity:.92; }

.toast__close{
  border:0; background:transparent; cursor:pointer; font-size:16px; line-height:1;
  padding:6px; margin:-6px; color:inherit; opacity:.78; border-radius:8px;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.10)) drop-shadow(0 2px 3px rgba(0,0,0,.08)) !important;
}
.toast__close:hover{ opacity:1; }

/* placeholder udržující místo po dobu odjezdové animace */
.toast-spacer{
  width:${TOAST_WIDTH_PX}px; max-width:92vw; min-width:${TOAST_WIDTH_PX}px;
  height:0; /* nastavíme dynamicky inline JSem */
  pointer-events:none;
}

@media (prefers-reduced-motion: reduce){
  .toast{ transition:none; }
}
    `;
        document.head.appendChild(css);
    }

    const container = document.getElementById(id);
    const icons = {info: "ℹ️", success: "✅", warn: "⚠️", error: "⛔"};

    // ========== STAV ==========
    // rec: { el, duration, elapsed, hoverElapsed, hovering, isAnimating }
    const live = [];
    let listAnimChain = Promise.resolve();

    // ========== HEARTBEAT ==========
    let hbRunning = false;
    let lastStamp = 0;
    const SUSPEND_THRESHOLD = 400; // skok >400ms: nepočítej (alert/confirm)

    function heartbeat(ts) {
        if (!hbRunning) return;
        if (!lastStamp) lastStamp = ts;
        let dt = ts - lastStamp;
        lastStamp = ts;
        if (dt < 0 || dt > SUSPEND_THRESHOLD) dt = 0;

        for (const rec of live.slice()) {
            if (rec.hovering) {
                rec.hoverElapsed = Math.min(rec.hoverElapsed + dt, HOVER_MAX_EXTRA_MS);
            } else if (rec.duration > 0 && !rec.isAnimating) {
                rec.elapsed += dt;
                if (rec.elapsed >= rec.duration) {
                    immediateRemove(rec); // autouzavření
                }
            }
        }

        if (live.length === 0) {
            hbRunning = false;
            lastStamp = 0;
            return;
        }
        requestAnimationFrame(heartbeat);
    }

    const ensureHeartbeat = () => {
        if (!hbRunning) {
            hbRunning = true;
            lastStamp = 0;
            requestAnimationFrame(heartbeat);
        }
    };

    // ========== FLIP ==========
    function flipSnapshot(container) {
        const arr = Array.from(container.children);
        const map = new Map();
        for (const el of arr) map.set(el, el.getBoundingClientRect().top);
        return map;
    }

    function flipAnimate(container, beforeMap, exclude = new Set(), durMs = ANIM_MS) {
        const afterMap = new Map();
        const children = Array.from(container.children);
        for (const el of children) {
            if (exclude.has(el)) continue;
            afterMap.set(el, el.getBoundingClientRect().top);
        }
        for (const el of children) {
            if (exclude.has(el)) continue;
            if (!beforeMap.has(el) || !afterMap.has(el)) continue;
            const dy = beforeMap.get(el) - afterMap.get(el);
            if (!dy) continue;

            const prevTransition = el.style.transition;
            el.style.transition = 'none';
            el.style.transform = `translate3d(0, ${dy}px, 0)`;
            el.getBoundingClientRect(); // reflow
            el.style.transition = `transform ${durMs}ms ease`;
            el.style.transform = '';
            setTimeout(() => {
                if (el.style.transition === `transform ${durMs}ms ease`) el.style.transition = prevTransition || '';
            }, durMs + 30);
        }
    }

    // ========== FORCED CLOSE ==========
    function maybeForceCloseOldest() {
        const oldest = live[0];
        if (!oldest || oldest.isAnimating) return;
        const visibleWithHoverCap = oldest.elapsed + Math.min(oldest.hoverElapsed, HOVER_MAX_EXTRA_MS);
        if (visibleWithHoverCap >= MIN_VISIBLE_MS_FOR_FORCED_CLOSE) {
            immediateRemove(oldest);
        }
    }

    // helper: bezpečně nastartuje CSS animaci (vyhne se “přeskočení”)
    function forceAnimate(el, addClass) {
        el.getBoundingClientRect(); // reflow
        requestAnimationFrame(() => el.classList.add(addClass));
    }

    // ========== ODEBRÁNÍ (se spacerem, aby okolí neposkakovalo) ==========
    function immediateRemove(rec) {
        if (!rec || rec.isAnimating) return;
        rec.isAnimating = true;
        rec.hovering = false;

        listAnimChain = listAnimChain.then(() => new Promise((resolve) => {
            // 1) snapshot před změnou
            const before = flipSnapshot(container);

            // 2) vytvoř spacer stejných rozměrů a vlož ho před toast
            const h = rec.el.offsetHeight;
            const spacer = document.createElement('div');
            spacer.className = 'toast-spacer';
            spacer.style.height = `${h}px`;
            rec.el.parentNode.insertBefore(spacer, rec.el);

            // 3) toast vyjmeme z layoutu: absolutně ho umístíme na původní pozici vůči kontejneru
            // container je position: fixed → absolutní potomek je k němu relativní
            const topInContainer = rec.el.offsetTop; // offset v rámci kontejneru
            rec.el.style.position = 'absolute';
            rec.el.style.left = '0px';
            rec.el.style.top = `${topInContainer}px`;
            rec.el.style.width = `${TOAST_WIDTH_PX}px`; // udrž šířku při absolutním pozicování

            // 4) spustíme jeho odjezd doleva (bez vlivu na flow díky spaceru)
            rec.el.classList.remove('show');
            forceAnimate(rec.el, 'hide-left');

            // 5) po doběhu: odstraníme toast + spacer, pak FLIP posun ostatních (plynulý)
            setTimeout(() => {
                const idx = live.indexOf(rec);
                if (idx >= 0) live.splice(idx, 1);
                rec.el.remove();
                spacer.remove();

                flipAnimate(container, before, new Set(), ANIM_MS);
                setTimeout(resolve, BETWEEN_OP_MS);
            }, ANIM_MS + 30);
        })).catch(() => {
        });
    }

    // ========== PŘIDÁNÍ ==========
    function makeToast(message, opts = {}) {
        const {title, type = "info", duration = 3000} = opts;

        listAnimChain = listAnimChain.then(async () => {
            if (live.length >= MAX_LIVE) {
                maybeForceCloseOldest();
                await new Promise(res => setTimeout(res, ANIM_MS + BETWEEN_OP_MS + 10));
            }

            const before = flipSnapshot(container);

            const el = document.createElement('div');
            el.className = `toast toast--${type}`;
            el.setAttribute('role', type === 'error' ? 'alert' : 'status');
            el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
            el.innerHTML = `
        <div class="toast__icon">${icons[type] || "🔔"}</div>
        <div>
          ${title ? `<div class="toast__title">${title}</div>` : ""}
          <div class="toast__msg">${message}</div>
        </div>
        <button class="toast__close" aria-label="Zavřít">✖</button>
      `;
            container.appendChild(el);

            const rec = {
                el,
                duration: Math.max(0, +duration || 0),
                elapsed: 0,
                hoverElapsed: 0,
                hovering: false,
                isAnimating: false
            };
            live.push(rec);
            ensureHeartbeat();

            // příjezd nového – garantovaně s animací
            forceAnimate(el, 'show');

            // posuň ostatní (nový z FLIP vynecháme)
            flipAnimate(container, before, new Set([el]), ANIM_MS);

        }).catch(() => {
        });

        // delegace: křížek vždy funguje
        container.addEventListener('click', onCloseClick, {capture: true});

        function onCloseClick(e) {
            const btn = e.target.closest?.('.toast__close');
            if (!btn) return;
            const el = btn.closest('.toast');
            const rec = live.find(r => r.el === el);
            if (rec) {
                e.stopPropagation();
                immediateRemove(rec);
            }
        }

        // delegace: hover
        container.addEventListener('mouseenter', onHover, true);
        container.addEventListener('mouseleave', onHover, true);

        function onHover(e) {
            const el = e.target.closest?.('.toast');
            if (!el) return;
            const rec = live.find(r => r.el === el);
            if (!rec) return;
            rec.hovering = (e.type === 'mouseenter');
        }

        return listAnimChain.then(() => {
            const last = live[live.length - 1];
            return () => last && immediateRemove(last);
        });
    }

    // ========== PUBLIC API ==========
    window.toast = Object.assign((m, o) => makeToast(m, o), {
        info: (m, o = {}) => makeToast(m, {...o, type: "info"}),
        success: (m, o = {}) => makeToast(m, {...o, type: "success"}),
        warn: (m, o = {}) => makeToast(m, {...o, type: "warn"}),
        error: (m, o = {}) => makeToast(m, {...o, type: "error"})
    });
})();


// ========== PŘÍKLADY ==========
document.addEventListener("DOMContentLoaded", function () {
    // místo alert("Uloženo")
    // toast.success("Uloženo", { title: "Hotovo", duration: 2500 });

    // chyba
    // toast.error("Nepodařilo se uložit.", { title: "Chyba", duration: 4000 });
    //
    // // info bez autouzavření
    // const close = toast.info("Běží zpracování…", { title: "Prosím čekejte", duration: 0 });
    // // až doběhne úloha:
    // close(); // zavře toast


    toast.info("První");                      // 1
    setTimeout(() => toast.success("Druhý", {duration: 1000}), 1000);   // 2
    setTimeout(() => toast.warn("Třetí", {duration: 1000}), 2000);      // 3
// Čtvrtý by měl odstranit nejstarší až po 2.5s „viditelnosti“ (s hover pauzou max +2s)
    setTimeout(() => toast.error("Čtvrtý (nahradí nejstarší po 2.5s)", {duration: 1000}), 3000);
});

