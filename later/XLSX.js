// ==========================================================
// POMOCNÉ: čtení hodnot z preambule
// (počítá s tvými globálními helpery: isObj, isVal, hasValue, catchVal, isNum,
//  isNonEmptyStr, convertUnits, atd.)
// ==========================================================
function getMetaValue(metaData, key, unit = null) {
    if (!isDict(metaData)) return "";
    if (metaData.hasOwnProperty(key)) {
        const value = catchVal(metaData[key]?.value, "", isVal);
        if (!hasValue(value)) return "";
        const valUnit = metaData[key].unit || null;
        if (isNonEmptyStr(unit) && isNonEmptyStr(valUnit)) {
            return catchVal(convertUnits(value, valUnit, unit), "", isNumSafe);
        }
        return catchVal(value, "", isNumSafe);
    }
    return "";
}

// ==========================================================
// 1) getDataFromCsv — vrací čistá data dle spec + preambleData
// ==========================================================
async function getDataFromCsv(fileOrText, spec, opts = {}) {
    const out = { preambleData: null };
    const specKeys = Object.keys(spec || {});
    for (const k of specKeys) out[k] = { ...spec[k], data: (spec[k]?.multipleColumbs ? [] : []) };

    const raw = (typeof fileOrText === "string") ? fileOrText : (await fileOrText.text());
    let text = String(raw).replace(/\r\n?/g, "\n");

    const lines0 = text.split("\n").map(r => r.trim());
    let fileType = "unknown";
    const firstLine = (lines0[0] || "").toLowerCase();
    if (firstLine.startsWith("##moira")) fileType = "moira";
    else if (firstLine.startsWith("date:")) fileType = "moira-legacy";
    else if (firstLine.startsWith("timestamp_us")) fileType = "matlab";

    const delimiters = [";", ",", "\t", " "];
    const fileOpts = { delimiter: null, skipRows: 0, columns: 4, dataTypes: {} };

    if (fileType === "moira") {
        const preamble = await parseSettingsFromCsv(text) || {};
        out.preambleData = preamble; // <<< posíláme ven
        fileOpts.delimiter = preamble?.delimiter || ";";
        if (preamble?.headerVersion === 1) fileOpts.skipRows = preamble?.skipRows|0;
        fileOpts.columns = preamble?.columns || 4;

        const precisions = preamble?.precisions || {};
        if (isDict(spec) && isNotEmpty(precisions)) {
            Object.keys(spec).forEach(k => {
                const n = toRounds?.(precisions[k]);
                if (isNumSafe(n)) out[k].precision = clamp(Math.abs(n), 0, 12);
            });
        }
    } else if (fileType === "moira-legacy") {
        fileOpts.delimiter = ";";
        fileOpts.skipRows = 3;
        fileOpts.columns = 6;
    } else if (fileType === "matlab") {
        fileOpts.delimiter = ";";
        fileOpts.skipRows = 1;
        fileOpts.columns = 5;
        if (!fileOpts.dataTypes.time) fileOpts.dataTypes.time = {};
        fileOpts.dataTypes.time.conversion = 1e-6; // µs → s
    } else {
        const headerRowIndex = lines0.findIndex(row => row.toLowerCase().startsWith("time"));
        fileOpts.skipRows = headerRowIndex !== -1 ? headerRowIndex : 0;
        fileOpts.columns = 4;
    }

    if (lines0.length <= fileOpts.skipRows) return out;

    const headBlock = lines0.slice(0, fileOpts.skipRows);
    let rowsText = lines0.slice(fileOpts.skipRows).filter(r => r.length > 0);

    function detectDelimiter(rows, minParts = 3) {
        if (!rows.length) return null;
        const testLine = rows[Math.min(Math.ceil(2 * rows.length / 3), rows.length - 1)];
        for (const d of delimiters) {
            const parts = String(testLine).split(d);
            if (parts.length >= minParts) return d;
        }
        return null;
    }
    const foundDelimiter = detectDelimiter(rowsText, fileOpts.columns);
    if (!fileOpts.delimiter) fileOpts.delimiter = foundDelimiter;
    if (!fileOpts.delimiter) {
        logMessage?.(`❌ Delimiter not found.`);
        return out;
    }

    function getUnitFromHeader(header) {
        if (!header) return null;
        const m = String(header).match(/[\(\[]\s*([a-zA-Z%μμmNnkgkPaasS]+)\s*[\)\]]/);
        return m ? m[1] : null;
    }

    const headerRowIdx = Math.max(0, ((fileOpts.skipRows|0) - 1));
    const headerLine = headBlock[headerRowIdx] || "";
    const headerParts = String(headerLine).split(fileOpts.delimiter).map(s => String(s).trim());
    const headerUnits = headerParts.map(getUnitFromHeader);

    const keysByType = Object.fromEntries(
        specKeys.map(t => [
            t,
            String(out[t]?.key || t)
                .toLowerCase()
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
        ])
    );

    const headerTypes = headerParts.map(part => {
        const p = String(part).toLowerCase();
        for (const t of specKeys) {
            if (keysByType[t].some(k => k && p.includes(k))) return t;
        }
        return null;
    });

    const dataTypes = {};
    for (const t of specKeys) {
        const prev = fileOpts.dataTypes?.[t] || {};
        const targetUnit = out[t]?.unit || prev.unit || "";
        let indexes = isArr(prev.indexes) && prev.indexes.length
            ? prev.indexes.slice()
            : headerTypes.map((tt, i) => (tt === t ? i : -1)).filter(i => i >= 0);
        if (!out[t]?.multipleColumbs && indexes.length > 1) indexes = [indexes[0]];

        let fromUnit = "";
        if (indexes.length) fromUnit = headerUnits[indexes[0]] || "";

        let conversion = prev.conversion;
        if (!isNumSafe(conversion)) {
            if (targetUnit && fromUnit) {
                try { conversion = catchVal(convertUnits(1, fromUnit, targetUnit), 1, isNumSafe); }
                catch (_) { conversion = 1; }
            } else conversion = 1;
        }
        dataTypes[t] = { indexes, unit: targetUnit, conversion };
    }

    const rows = rowsText.map(r => r.split(fileOpts.delimiter));
    let tries = 12;
    while (tries-- > 0 && rows.length > 0) {
        const first = rows[0];
        const testVals = first.slice(0, Math.min(6, first.length)).map(v => toNumber(v, true));
        const ok = testVals.every(v => Number.isFinite(v));
        if (ok) break;
        rows.shift();
    }
    if (!rows.length) return out;

    for (const t of specKeys) {
        const conf = dataTypes[t];
        const prec = out[t]?.precision ?? 12;
        if (!conf || !isArr(conf.indexes) || !conf.indexes.length) {
            out[t].data = out[t].multipleColumbs ? [] : [];
            continue;
        }
        const conv = Number.isFinite(toNumber(conf.conversion, true)) ? conf.conversion : 1;

        if (out[t].multipleColumbs) {
            const series = [];
            for (const idx of conf.indexes) {
                const arr = [];
                for (let r = 0; r < rows.length; r++) {
                    const v = toNumber(rows[r][idx], true);
                    if (Number.isFinite(v)) arr.push(roundDecimalFast(v * conv, prec));
                }
                series.push(arr);
            }
            out[t].data = series;
        } else {
            const arr = [];
            const idx = conf.indexes[0];
            for (let r = 0; r < rows.length; r++) {
                const v = toNumber(rows[r][idx], true);
                if (Number.isFinite(v)) arr.push(roundDecimalFast(v * conv, prec));
            }
            out[t].data = arr;
        }
    }

    return out;
}

// ==========================================================
// 2) convertCSVtoXLSX_MATTES — přidány styly, šířky sloupců, log preambule
// ==========================================================
async function convertCSVtoXLSX_MATTES() {
    try {
        await waitForXLSX();
    } catch (e) {
        alert("❌ Failed to load XLSX library. Please check the logs and your internet connection and try again.");
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.multiple = true;

    const mattesMaxLines = 20_000;

    // ---------- styling utility ----------
    const PAD = 2;
    const MIN = 6;

    function fitToCols(rows, {pad = 2, min = 6} = {}) {
        const cols = rows[0]?.length ?? 0;
        const out = Array.from({length: cols}, () => ({wch: min}));
        for (let c = 0; c < cols; c++) {
            let maxLen = 0;
            for (let r = 0; r < rows.length; r++) {
                const v = rows[r][c];
                const s = v == null ? "" : String(v);
                if (s.length > maxLen) maxLen = s.length;
            }
            out[c].wch = Math.max(min, maxLen + pad);
        }
        return out;
    }
    function fitToColsFromRow(rows, startRow = 0, {pad = 2, min = 6} = {}) {
        const cols = rows[0]?.length ?? 0;
        const out = Array.from({length: cols}, () => ({wch: min}));
        for (let c = 0; c < cols; c++) {
            let maxLen = 0;
            for (let r = startRow; r < rows.length; r++) {
                const v = rows[r][c];
                const s = v == null ? "" : String(v);
                if (s.length > maxLen) maxLen = s.length;
            }
            out[c].wch = Math.max(min, maxLen + pad);
        }
        return out;
    }

    function setNumFmt(colIndex, fmt, data, ws) {
        for (let r = 1; r < data.length; r++) {
            const addr = XLSX.utils.encode_cell({r, c: colIndex});
            const cell = ws[addr];
            if (cell && typeof cell.v === 'number') cell.z = fmt;
        }
    }

    function applyHeaderRowStyle(ws, rowIdx) {
        if (!ws['!ref']) return;
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const addr = XLSX.utils.encode_cell({r: rowIdx, c: C});
            const cell = ws[addr] || (ws[addr] = {t: "s", v: ""});
            cell.s = cell.s || {};
            cell.s.font = { bold: true };
            cell.s.alignment = { horizontal: "center", vertical: "center" }; // <<< centrování hlaviček
            cell.s.border = {
                top: {style: "thin", color: {auto: 1}},
                bottom: {style: "thin", color: {auto: 1}},
                left: {style: "thin", color: {auto: 1}},
                right: {style: "thin", color: {auto: 1}},
            };
            cell.s.fill = { patternType: "solid", fgColor: { rgb: "FFEFEFEF" } };
        }
    }

    function applyBanding(ws, startRowIdx) {
        if (!ws['!ref']) return;
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = startRowIdx; R <= range.e.r; ++R) {
            if ((R - startRowIdx) % 2 === 1) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const addr = XLSX.utils.encode_cell({r: R, c: C});
                    const cell = ws[addr];
                    if (!cell) continue;
                    cell.s = cell.s || {};
                    cell.s.fill = { patternType: "solid", fgColor: { rgb: "FFF9F9F9" } };
                }
            }
        }
    }

    function ensureRefFromAoa(ws, aoa) {
        if (!ws['!ref']) {
            const rows = aoa.length;
            const cols = (aoa[0] || []).length;
            if (rows && cols) {
                ws['!ref'] = XLSX.utils.encode_range({
                    s: { r: 0, c: 0 },
                    e: { r: rows - 1, c: cols - 1 }
                });
            }
        }
    }

    // nastav šířky sloupců na prvním listu: data=20, mezisloupce=10
    function setMattesColumnWidths(ws) {
        if (!ws['!ref']) return;
        const rng = XLSX.utils.decode_range(ws['!ref']);
        const cols = [];
        for (let c = rng.s.c; c <= rng.e.c; c++) {
            // každá sekce má 5 sloupců: 0..3 data, 4 mezera
            const inSection = c % 5;
            cols[c] = { wch: (inSection === 4 ? 7 : 15) };
        }
        ws['!cols'] = cols;
    }

    input.onchange = async function (event) {
        let files = Array.from(event.target.files);
        if (!files.length) {
            console.warn("\n❌ No files selected.");
            alert("❌ No files were selected. Please select one or more CSV files and try again.");
            return;
        }

        files.sort((a, b) => {
            let nameA = a.name.toLowerCase();
            let nameB = b.name.toLowerCase();
            let regex = /(.*?)(?:\s\((\d+)\))?\.csv$/;
            let matchA = nameA.match(regex);
            let matchB = nameB.match(regex);
            if (!matchA || !matchB) return 0;
            let baseA = matchA[1];
            let indexA = matchA[2] ? parseInt(matchA[2]) : -1;
            let baseB = matchB[1];
            let indexB = matchB[2] ? parseInt(matchB[2]) : -1;
            if (baseA !== baseB) return baseA.localeCompare(baseB);
            if (indexA === -1) return -1;
            if (indexB === -1) return 1;
            return indexA - indexB;
        });
        console.info("📂 Sorted files:", files.map(f => f.name));

        const measurementName = files[0].name
            .replace(/\.csv$/,"")
            .replace(/\s*\(\d+\)\s*$/,"")
            .replace(/^(.*)_(\d{1,})$/,"$1")
            .trim();

        let wb = XLSX.utils.book_new();
        let sheetName = ("P-" + measurementName).slice(0, 31 - 8);

        // --------- “File Order” list ----------
        const HEAD = ["File Order","File name","Experiment type","Material",
            "b (mm)","h (mm)","L (mm)","E (MPa)",
            "F_max (N)","w_Fmax (mm)","σ_max (MPa)",
            "F_T (N)","h_D (mm)","H_BW (-)"];
        const resultsData = [HEAD];

        // --------- “Samples” table ----------
        const samplesTable = [
            ["Code","Method","W","Number","Dimensions, weight, before drying","","","",
             "Dimensions, weight, after drying","","","", "lo (mm)"],
            ["","","","", "hw","lw","ww","mw", "h0","l0","w0","m0", ""],
            ["","","","", "height (mm)","length (mm)","width (mm)","(g)",
                         "height (mm)","length (mm)","width (mm)","(g)", ""]
        ];

        // --------- specifikace výstupů ----------
        const outputsSpec = {
            time:     { key: 'time',                 unit: 's',  precision: 12, multipleColumbs: false },
            position: { key: 'dist, disp, position', unit: 'mm', precision: 12, multipleColumbs: false },
            force:    { key: 'force, load',          unit: 'N',  precision: 12, multipleColumbs: true  },
        };

        const formattedData = [];
        let columnOffset = 0;

        let fileCount = 0;
        for (let file of files) {
            fileCount++;

            // načti data + preambuli
            const csvOut = await getDataFromCsv(file, outputsSpec);
            console.info("preambleData:", file.name, csvOut.preambleData); // <<< výpis do konzole

            const tArr = csvOut?.time?.data || [];
            const pArr = csvOut?.position?.data || [];
            const choosePrimary = (series) => {
                if (!isArr(series)) return [];
                for (const s of series) if (isArr(s) && s.length) return s;
                return [];
            };
            const fPrimary = choosePrimary(csvOut?.force?.data || []);

            if (!tArr.length || !pArr.length || !fPrimary.length) {
                logMessage?.(`❌ Cannot parse required columns in file: ${file.name}`);
                console.warn(`\n❌ Cannot parse required columns in file: ${file.name}`);
                fileCount--;
                continue;
            }

            let n = Math.min(tArr.length, pArr.length, fPrimary.length);
            if (n > mattesMaxLines) {
                const step = Math.ceil(n / mattesMaxLines);
                const down = (arr) => arr.filter((_, i) => i % step === 0);
                logMessage?.(`❗ Too many lines in ${file.name}: ${n} → ${Math.ceil(n/step)} (step ${step})`);
                n = Math.ceil(n / step);
                csvOut.time.data     = down(csvOut.time.data);
                csvOut.position.data = down(csvOut.position.data);
                csvOut.force.data    = csvOut.force.data.map(d => down(d));
            }

            const time0  = csvOut.time.data[0]     || 0;
            const pos0   = csvOut.position.data[0] || 0;
            const force0 = fPrimary[0]             || 0;

            // hlavičky sekce (centrované se řeší ve style funkci)
            const sectionHeader1 = [];  sectionHeader1[columnOffset]     = fileCount;
            const sectionHeader2 = [];  sectionHeader2[columnOffset]     = "Measured values from testing machine";
            const sectionHeader3 = [];  // popisky sloupců
            const sectionHeader4 = [];  // jednotky
            sectionHeader3[columnOffset]     = "Time";
            sectionHeader3[columnOffset + 1] = "Total distance covered by loading pin";
            sectionHeader3[columnOffset + 2] = "Force";
            sectionHeader3[columnOffset + 3] = "Deformation from F > 1N";
            sectionHeader4[columnOffset]     = csvOut.time.unit || 's';
            sectionHeader4[columnOffset + 1] = csvOut.position.unit || 'mm';
            sectionHeader4[columnOffset + 2] = 'N';
            sectionHeader4[columnOffset + 3] = csvOut.position.unit || 'mm';

            if (formattedData.length === 0) {
                formattedData.push(sectionHeader1, sectionHeader2, sectionHeader3, sectionHeader4);
            } else {
                formattedData[0][columnOffset] = sectionHeader1[columnOffset];
                formattedData[1][columnOffset] = sectionHeader2[columnOffset];
                formattedData[2][columnOffset] = sectionHeader3[columnOffset];
                formattedData[3][columnOffset] = sectionHeader4[columnOffset];
                for (let i = 0; i < 4; i++) {
                    for (let j = 1; j <= 3; j++) {
                        formattedData[i][columnOffset + j] =
                            [sectionHeader1, sectionHeader2, sectionHeader3, sectionHeader4][i][columnOffset + j];
                    }
                }
            }

            // data sekce
            for (let r = 0; r < n; r++) {
                const row = formattedData[r + 3] || [];
                const time = (csvOut.time.data[r]     ?? time0)  - time0;
                const pos  = (csvOut.position.data[r] ?? pos0)   - pos0;
                const force= (fPrimary[r]             ?? force0) - force0;
                const deformation = pos;

                row[columnOffset]     = time;
                row[columnOffset + 1] = pos;
                row[columnOffset + 2] = force;
                row[columnOffset + 3] = deformation;
                formattedData[r + 3] = row;
            }

            // ====== METADATA z preambule → resultsData & samplesTable ======
            let expResults = {
                experimentType: "", material: "",
                b: "", h: "", L: "", E: "",
                F_max: "", w_Fmax: "", sigma_max: "",
                F_T: "", h_D: "", H_BW: ""
            };
            let samplesInfo = {
                method: 3, W: 0, hw:"", lw:"", ww:"", mx:"",
                h0:"", l0:"", w0:"", m0:"", lo:""
            };

            const pre = csvOut?.preambleData || null;
            if (pre && isDict(pre)) {
                const calcInputs = pre?.calcSettings?.inputs || {};
                const expInfoV   = pre?.expSettings?.version || 0;
                const calcInfoV  = pre?.calcSettings?.version || 0;

                if (expInfoV >= 1) {
                    expResults.experimentType = pre?.experimentLabel || "";
                    expResults.material = getMetaValue(calcInputs, "inputMaterialName");
                    expResults.b = getMetaValue(calcInputs, "inputWidth", "mm");
                    expResults.h = getMetaValue(calcInputs, "inputHeight", "mm");
                    expResults.L = getMetaValue(calcInputs, "inputLength", "mm");
                    expResults.E = getMetaValue(calcInputs, "outputModulus", "MPa");
                    expResults.F_max = getMetaValue(calcInputs, "outputForceMax", "N");
                    expResults.w_Fmax = getMetaValue(calcInputs, "outputDisp", "mm");
                    expResults.sigma_max = getMetaValue(calcInputs, "outputMaxStress", "MPa");
                    expResults.F_T = getMetaValue(calcInputs, "inputTargetForce", "N");
                    expResults.h_D = getMetaValue(calcInputs, "inputIndDepth", "mm");
                    expResults.H_BW = getMetaValue(calcInputs, "outputHardness");
                }
                if (calcInfoV >= 1) {
                    samplesInfo.hw = getMetaValue(calcInputs, "inputHeight_BeforeDrying", "mm");
                    samplesInfo.lw = getMetaValue(calcInputs, "inputLength_BeforeDrying", "mm");
                    samplesInfo.ww = getMetaValue(calcInputs, "inputWidth_BeforeDrying", "mm");
                    samplesInfo.mx = getMetaValue(calcInputs, "inputWeight_BeforeDrying", "g");
                    samplesInfo.h0 = getMetaValue(calcInputs, "inputHeight_AfterDrying", "mm");
                    samplesInfo.l0 = getMetaValue(calcInputs, "inputLength_AfterDrying", "mm");
                    samplesInfo.w0 = getMetaValue(calcInputs, "inputWidth_AfterDrying", "mm");
                    samplesInfo.m0 = getMetaValue(calcInputs, "inputWeight_AfterDrying", "g");
                }
            }

            resultsData.push([
                fileCount,
                file.name.replace(/\.csv$/i, ""),
                expResults.experimentType,
                expResults.material,
                expResults.b,
                expResults.h,
                expResults.L,
                expResults.E,
                expResults.F_max,
                expResults.w_Fmax,
                expResults.sigma_max,
                expResults.F_T,
                expResults.h_D,
                expResults.H_BW,
            ]);

            samplesTable.push([
                file.name.replace(/\.csv$/i, ""),   // Code
                samplesInfo.method,                 // Method
                samplesInfo.W,                      // W
                fileCount,                          // Number
                samplesInfo.hw, samplesInfo.lw,     // hw, lw
                samplesInfo.ww, samplesInfo.mx,     // ww, mw/mx
                samplesInfo.h0, samplesInfo.l0,     // h0, l0
                samplesInfo.w0, samplesInfo.m0,     // w0, m0
                samplesInfo.lo                      // lo
            ]);

            columnOffset += 5; // 4 data sloupce + 1 mezera
        }

        if (fileCount === 0 || !isNotEmpty(formattedData)) {
            console.error("\n❌ No valid files were processed.");
            alert("❌ No valid files were processed. Please check the file formats and try again.");
            return;
        }

        // --------- vytvoření listů ----------
        const wsMattes  = XLSX.utils.aoa_to_sheet(formattedData);
        const wsSamples = XLSX.utils.aoa_to_sheet(samplesTable, {raw:true});
        const wsResults = XLSX.utils.aoa_to_sheet(resultsData);

        // Pojistky !ref:
        ensureRefFromAoa(wsMattes,  formattedData);
        ensureRefFromAoa(wsSamples, samplesTable);
        ensureRefFromAoa(wsResults, resultsData);

        // --------- merges ----------
        wsMattes["!merges"] = (wsMattes['!merges'] || []);
        let cOff = 0;
        for (let f = 0; f < fileCount; f++) {
            wsMattes["!merges"].push({ s:{r:0,c:cOff}, e:{r:0,c:cOff+3} });
            wsMattes["!merges"].push({ s:{r:1,c:cOff}, e:{r:1,c:cOff+3} });
            cOff += 5;
        }

        wsSamples["!merges"] = (wsSamples['!merges'] || []);
        wsSamples['!merges'].push(
            {s:{r:0,c:0}, e:{r:2,c:0}}, // Code
            {s:{r:0,c:1}, e:{r:2,c:1}}, // Method
            {s:{r:0,c:2}, e:{r:2,c:2}}, // W
            {s:{r:0,c:3}, e:{r:2,c:3}}, // Number
            {s:{r:0,c:4}, e:{r:0,c:7}}, // Dimensions before drying
            {s:{r:0,c:8}, e:{r:0,c:11}},// Dimensions after drying
            {s:{r:0,c:12}, e:{r:2,c:12}}// lo (mm)
        );

        // --------- styly & zarovnání hlaviček ----------
        // Samples: všechny tři hlavičkové řádky vystředíme a orámujeme
        (function styleSamples() {
            const range = XLSX.utils.decode_range(wsSamples['!ref']);
            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const addr = XLSX.utils.encode_cell({r:R, c:C});
                    const cell = wsSamples[addr];
                    if (!cell) continue;
                    cell.s = cell.s || {};
                    cell.s.alignment = { horizontal:"center", vertical:"center" }; // <<< zarovnáno na střed
                    cell.s.border = {
                        top: {style:"thin", color:{auto:1}},
                        bottom: {style:"thin", color:{auto:1}},
                        left: {style:"thin", color:{auto:1}},
                        right: {style:"thin", color:{auto:1}},
                    };
                    if (R <= 2) {
                        cell.s.font = { bold:true };
                        cell.s.fill = { patternType:"solid", fgColor:{ rgb:"FFEFEFEF" } };
                    }
                }
            }
        })();

        // Results: šířky, autofilter, hlavička na střed + banding + number formats
        wsResults['!ref'] = XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: resultsData.length - 1, c: HEAD.length - 1 }
        });
        applyHeaderRowStyle(wsResults, 0);
        applyBanding(wsResults, 1);
        setNumFmt(4,  "0.00",  resultsData, wsResults);
        setNumFmt(5,  "0.00",  resultsData, wsResults);
        setNumFmt(6,  "0.00",  resultsData, wsResults);
        setNumFmt(7,  "0.000", resultsData, wsResults);
        setNumFmt(8,  "0.00",  resultsData, wsResults);
        setNumFmt(9,  "0.00",  resultsData, wsResults);
        setNumFmt(10, "0.000", resultsData, wsResults);
        setNumFmt(11, "0.00",  resultsData, wsResults);
        setNumFmt(12, "0.00",  resultsData, wsResults);
        setNumFmt(13, "0.000", resultsData, wsResults);

        wsResults['!autofilter'] = {
            ref: XLSX.utils.encode_range({
                s: { r: 0, c: 0 },
                e: { r: resultsData.length - 1, c: HEAD.length - 1 }
            })
        };

        // --------- šířky sloupců ----------
        // 1) První list: pevně (data 20, mezera 10)
        setMattesColumnWidths(wsMattes);

        // 2) Druhý list (Samples): fit podle obsahu, ale IGNORUJ řádek 0 (kde jsou velké sloučené hlavičky)
        wsSamples['!cols'] = fitToColsFromRow(samplesTable, 1, {pad: PAD, min: MIN});

        // 3) Třetí list (Results): fit podle obsahu
        wsResults['!cols'] = fitToCols(resultsData, {pad: PAD, min: MIN});

        // --------- Mattes: zvýraznění "hlaviček" v prvních řádcích + centrování ----------
        (function styleMattes() {
            // řádek 2 je "názvy sloupců" → centrální
            applyHeaderRowStyle(wsMattes, 2);
            const range = XLSX.utils.decode_range(wsMattes['!ref']);
            for (let R of [0,1,3]) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const addr = XLSX.utils.encode_cell({r:R,c:C});
                    const cell = wsMattes[addr];
                    if (!cell) continue;
                    cell.s = cell.s || {};
                    cell.s.font = { bold: true };
                    cell.s.alignment = { horizontal:"center", vertical:"center" }; // <<< na střed
                }
            }
            applyBanding(wsMattes, 4);
        })();

        // --------- append sheets ----------
        XLSX.utils.book_append_sheet(wb, wsMattes,   sheetName);
        XLSX.utils.book_append_sheet(wb, wsSamples,  (sheetName + "-objects").slice(0,31));
        XLSX.utils.book_append_sheet(wb, wsResults,  "File Order");

        // --------- zápis souboru ----------
        XLSX.writeFile(wb, `${measurementName.slice(0, 31)}.xlsx`);
        console.info("✅ Excel file created.");
    };

    input.click();
}

// ----------------------------------------------------------
// Příklad použití getDataFromCsv jinde:
// ----------------------------------------------------------
// const spec = {
//   time:     { key: 'time', unit: 's',  precision: 12, multipleColumbs: false },
//   position: { key: 'pos, dist, disp, position', unit: 'mm', precision: 12, multipleColumbs: false },
//   force:    { key: 'force, load', unit: 'N', precision: 12, multipleColumbs: true },
// };
// const csvData = await getDataFromCsv(file, spec);
// csvData.time.data     → number[]
// csvData.position.data → number[]
// csvData.force.data    → number[][]
// csvData.preambleData  → kompletní MOIRA preambule