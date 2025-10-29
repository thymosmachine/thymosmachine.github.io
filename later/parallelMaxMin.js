// ====== 1) Kooperativně asynchronní (neblokující) ======
    /**
     * Pro velmi dlouhá pole: zpracuje po blocích a mezi bloky "yieldne" (neblokuje UI).
     * Vrací Promise<number>.
     */
    async function minimumAsyncCooperative(arr, {
      acceptInf = false,
      chunkSize = 50_000,      // velikost bloku
      yieldMs   = 0            // 0 = microtask (setTimeout 0), >0 = skutečné čekání
    } = {}) {
      if (!isArray(arr) || arr.length === 0) return NaN;
      let min = Infinity;

      for (let i = 0; i < arr.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, arr.length);
        // lokální minimum pro blok (s použitím stejné logiky)
        let blockMin = Infinity;
        for (let j = i; j < end; j++) {
          const n = toNumber(arr[j]);
          if (!Number.isNaN(n) && n < blockMin) blockMin = n;
        }
        if (blockMin < min) min = blockMin;

        // uvolni thread (nebo jen microtask), aby UI nezamrzalo
        await new Promise(r => setTimeout(r, yieldMs));
      }

      return acceptInf ? min : (Number.isFinite(min) ? min : NaN);
    }

    // ====== 2) Skutečně paralelní – Worker pool ======
    /**
     * Rozdělí pole na "concurrency" částí, každou spočítá ve Web Workeru a výsledky sloučí.
     * Pozn.: pro opravdu velká pole je přenos dat mezi vláknem a hlavním vláknem nákladný.
     * Pokud předáváš TypedArray (např. Float64Array), můžeš použít transfer (viz níž).
     */
    async function minimumParallel(arr, {
      acceptInf  = false,
      concurrency = Math.max(1, Math.min(navigator?.hardwareConcurrency || 4, 8)),
      // pro extrémně velká čísla: pokud arr je TypedArray, můžeš buffer transferovat (vůbec nekopíruje)
      transferBuffer = false
    } = {}) {
      if (!_isArray(arr) || arr.length === 0) return NaN;
      if (concurrency <= 1 || typeof Worker === 'undefined') {
        // fallback: kooperativní verze (nebo synchronní)
        return minimumAsyncCooperative(arr, { acceptInf });
      }

      // inline kód Workera
      const workerCode = `
        const toNum = (v) => {
          // jednoduchý fallback; pokud máš přísnější parsování, uprav
          const n = Number(v);
          return Number.isNaN(n) ? NaN : n;
        };
        self.onmessage = (e) => {
          const { data, start, end } = e.data;
          let min = Infinity;
          for (let i = start; i < end; i++) {
            const n = toNum(data[i]);
            if (!Number.isNaN(n) && n < min) min = n;
          }
          self.postMessage(min);
        };
      `;
      const blob = new Blob([workerCode], { type: 'text/javascript' });
      const url  = URL.createObjectURL(blob);

      // Rozdělení indexů přibližně rovnoměrně
      const ranges = [];
      const size = Math.ceil(arr.length / concurrency);
      for (let i = 0; i < arr.length; i += size) {
        ranges.push([i, Math.min(i + size, arr.length)]);
      }

      // Vytvořit workery a spustit úlohy
      const workers = [];
      const promises = ranges.map(([start, end]) => new Promise((resolve, reject) => {
        const w = new Worker(url);
        workers.push(w);
        w.onmessage = (ev) => resolve(ev.data);
        w.onerror   = (err) => reject(err);

        // Pozn.: předání dat – pro běžné Array dojde ke strukturovanému klonování (kopie).
        // Pokud bys měl TypedArray a chtěl transfer:
        // w.postMessage({ data: typedArray.buffer, start, end }, [typedArray.buffer]);
        // a ve workeru bys musel vytvořit nový pohled: new Float64Array(e.data)
        try {
          w.postMessage({ data: arr, start, end });
        } catch (e) {
          // některá prostředí neumí poslat komplexní struktury → fallback:
          w.postMessage({ data: arr.slice(start, end), start: 0, end: end - start });
        }
      }));

      let globalMin = Infinity;
      try {
        const results = await Promise.all(promises);
        for (const m of results) {
          if (m < globalMin) globalMin = m;
        }
      } finally {
        workers.forEach(w => w.terminate());
        URL.revokeObjectURL(url);
      }

      return acceptInf ? globalMin : (Number.isFinite(globalMin) ? globalMin : NaN);
    }

    // ====== 3) Auto wrapper – zvolí strategii podle délky pole / podpory Workerů ======
    async function minimumAutoAsync(arr, {
      acceptInf      = false,
      threshold      = 200_000,    // od jaké délky zkusit Workery
      concurrency    = Math.max(1, Math.min(navigator?.hardwareConcurrency || 4, 8)),
      coopChunkSize  = 50_000,
      coopYieldMs    = 0
    } = {}) {
      if (!isArray(arr) || arr.length === 0) return NaN;

      const canWorkers = (typeof Worker !== 'undefined');
      if (canWorkers && arr.length >= threshold) {
        // paralelní cesta
        return minimumParallel(arr, { acceptInf, concurrency });
      }
      // kooperativní (neblokující) cesta
      return minimumAsyncCooperative(arr, { acceptInf, chunkSize: coopChunkSize, yieldMs: coopYieldMs });
    }



    // // 1) Nech to vybrat automaticky:
    // const min1 = await minimumAutoAsync(data, { acceptInf: false });
    //
    // // 2) Vynutit kooperativní (bez workerů):
    // const min2 = await minimumAsyncCooperative(data, { chunkSize: 100_000, yieldMs: 0 });
    //
    // // 3) Vynutit paralelní (workery) a řídit stupeň paralelismu:
    // const min3 = await minimumParallel(data, { concurrency: 6, acceptInf: true });