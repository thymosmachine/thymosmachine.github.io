// delete all properties of '.prohibited' and '.disabled'
function clearClassDeclarations(selector) {
    for (const sheet of Array.from(document.styleSheets)) {
        let rules;
        try {
            rules = sheet.cssRules;
        } catch {
            continue;
        }
        for (const r of rules) {
            if (r.type === CSSRule.STYLE_RULE && r.selectorText?.split(",").map(s => s.trim()).includes(selector)) {
                r.style.cssText = ""; // smaže VŠECHNY deklarace té třídy
            }
        }
    }
}


document.getElementById('degubDeleteDisabled')?.addEventListener('click', () => clearClassDeclarations(".disabled"));

document.getElementById('degubDeleteProhibited')?.addEventListener('click', () => clearClassDeclarations(".prohibited"));


const endDebugBtn = document.getElementById('degubEndTestingBtn');
const debugWrapper = document.getElementById('debuggingWrapper');


const testBtn = document.getElementById('degubRunTestSequenceBtn');

testBtn?.addEventListener('click', async () => testFce());


endDebugBtn?.addEventListener('click', () => {
    debugWrapper?.remove();
    debugging = false;
    document.querySelector('html').style.background = 'none';
})

async function testFce() {
    console.info("%cTest function running...", "color: orange; font-size: 16px; font-weight: bold;");

    // const ports = await navigator.serial.getPorts();
    // const devices = await navigator.usb.getDevices(); // requestDevice({ filters: [{ vendorId: 0x2341 }] })
    //
    // console.log("🔌 Serial ports:", ports);
    // console.log("🔌 USB devices:", devices);


    // const device = devices[0];
    // if (!device) {
    //     self.postMessage({error: 'No device'});
    //     return;
    // }
    //
    // await device.open();
    // (volitelně) await device.selectConfiguration(1);
    // (volitelně) await device.claimInterface(0);

    // příklad přenosu:
    // await device.transferOut(1, new Uint8Array([0x01, 0x02]));
    // const inRes = await device.transferIn(1, 64);


    // 1   4
    // 2   5
    // 3   6
    // 7   8
    //
    // ⡗ [1,2,3,7,5]
    // ⢺ [2,4,5,6,8]
    // ⢎ [2,3,4,8]
    // ⡱ [1,7,5,6]
    // ⡎ [2,3,7,4]
    // ⡯ [1,2,3,7,4,6]
    // ⡕ [1,3,7,5]
    // ⡮ [2,3,7,4,6]
    // ⢵ [1,3,5,6,8]


    const goal = {
        targets: [[1, 2, 3, 7, 5], // ⡗
            [2, 4, 5, 6, 8], // ⢺
            ' ', [2, 3, 4, 8], // ⢎
            [1, 7, 5, 6], // ⡱
            ' ', [2, 3, 7, 4], // ⡎
            ' ', [1, 2, 3, 7, 4, 6], // ⡯
            [1, 3, 7, 5], // ⡕
            ' ', [2, 3, 7, 4, 6], // ⡮
            [1, 3, 5, 6, 8], // ⢵
            '  ', 'Controller', ' ', '-', ' ', 'Thymos',], full: '⡗⢺ ⢎⡱ ⡎ ⡯⡕ ⡮⢵  Controller - Thymos', empty: '𝅼'
    };


    // spusť
    await startBraille(goal.targets);

    setTimeout(() => {
        document.title = goal.empty;
    }, 500);
    setTimeout(() => {
        document.title = goal.full;
    }, 1500);
    setTimeout(() => {
        document.title = goal.empty;
    }, 2000);
    setTimeout(() => {
        document.title = goal.full;
    }, 3000);

    console.info("%cTest function completed.", "color: green; font-size: 16px; font-weight: bold;");
}


function brailleFromDots(dots = []) {
    const maskByDot = [0, 1, 2, 4, 8, 16, 32, 64, 128]; // index = dot #
    const mask = dots.reduce((m, d) => m | maskByDot[d], 0);
    return String.fromCodePoint(0x2800 | mask);
}


// TODO : get data from ESP
//          async function handleFirmwareBlock(lines) {
//              console.log("📦 Firmware block received:");
//              for (const line of lines) {
//                  console.log("   ➤", line);
//                  await logMessage("🔧 " + line);
//              }
//          }


//TODO : random generator
//         if (Math.random() < 0.01) {
//             timeVal = timeVal * 100;
//             console.log("🎲 Random number:", timeVal);
//         } else {
//             console.log("🚫 No number.");
//         }


//TODO : Constantly log random numbers
//          async function tester() {
//              while (true) {
//                  await sleep(20); // Wait for 1 second
//                  logMessage(Math.random());
//              }
//          }


// // ===== 8-dot braille utils =====
// const DOT_MASK = [0, 1, 2, 4, 8, 16, 32, 64, 128]; // index = dot #
// const UNICODE_SPACE_RE = /^[\u0020\u00A0\u2000-\u200A\u202F\u205F\u3000]$/;
// const COLS8 = [
//     [1, 2, 3, 7], // levý sloupec shora dolů (top = 1)
//     [4, 5, 6, 8]  // pravý sloupec shora dolů (top = 4)
// ];
// const BLANK = String.fromCodePoint(0x2800);
// const toChar = (dotsSet) => {
//     let mask = 0;
//     for (const d of dotsSet) if (d >= 1 && d <= 8) mask |= DOT_MASK[d];
//     return String.fromCodePoint(0x2800 | mask);
// };
// const wait = (ms) => new Promise(r => setTimeout(r, ms));
//
// /**
//  * „Sypání písku“ pro jeden znak:
//  * - Každý sloupec: seřaď cíle odspodu (nejnižší první).
//  * - Každá tečka startuje nahoře (1 nebo 4) a padá po řádcích dolů, dokud nedosáhne svého cíle.
//  * - Settlené tečky zůstávají svítit.
//  */
// async function animateBrailleCharSand(targetDots, setChar, {
//     stepMs = 110,           // rychlost pádu (jeden řádek dolů)
//     pauseDropMs = 80,       // pauza po dosednutí jedné tečky
//     pauseColMs = 120,       // pauza po dokončení sloupce
//     cols = COLS8            // můžeš nahradit za [[1,2,3],[4,5,6]] pro 6-dot
// } = {}) {
//     const target = new Set(targetDots.filter(d => d >= 1 && d <= 8));
//     const locked = new Set(); // trvale usazené tečky (celého znaku)
//
//     // Pro každý sloupec zvlášť:
//     for (const col of cols) {
//         // cíle v tomto sloupci (shora dolů) a pak je obrátíme na „odspodu nahoru“
//         const targetsInColTopDown = col.filter(d => target.has(d));
//         if (targetsInColTopDown.length === 0) continue;
//         const targetsInColBottomUp = targetsInColTopDown.slice().reverse();
//
//         // pád každé tečky zvlášť (nejprve na nejnižší cíl)
//         for (const goal of targetsInColBottomUp) {
//             // start index (0 = horní řádek sloupce)
//             const goalIdx = col.indexOf(goal);
//
//             for (let i = 0; i <= goalIdx; i++) {
//                 const pos = col[i];             // aktuální řádek, kde je "padající" tečka
//                 const frame = new Set(locked);  // začni všemi už usazenými
//                 frame.add(pos);                 // přidej pohybující se tečku
//                 setChar(toChar(frame));
//                 await wait(stepMs);
//             }
//
//             // dosednutí: přidej goal do locked a ukaž čistý stav
//             locked.add(goal);
//             setChar(toChar(locked));
//             if (pauseDropMs) await wait(pauseDropMs);
//         }
//
//         if (pauseColMs) await wait(pauseColMs);
//     }
//
//     // jistota: konečný stav přesně podle targetu
//     setChar(toChar(target));
// }
//
// /**
//  * Vypíše text do slotu i po znacích.
//  * - charMs: prodleva mezi znaky
//  * - spaceMs: prodleva pro znaky, které splní UNICODE_SPACE_RE (default 0)
//  * - instantSet: volitelný Set znaků, které se mají psát bez čekání (kromě mezer)
//  */
// async function typeOutStringAt(i, text, setFrame, {
//     charMs = 40,
//     spaceMs = 0,
//     instantSet
// } = {}) {
//     const instant = instantSet instanceof Set ? instantSet : new Set();
//     let buf = '';
//     for (const ch of [...text]) {           // správně iteruje i surrogates
//         buf += ch;
//         setFrame(i, buf);
//         let delay = charMs;
//         if (UNICODE_SPACE_RE.test(ch) || instant.has(ch)) delay = spaceMs;
//         if (delay > 0) await sleep(delay);
//     }
// }
//
// /**
//  * Sekvence: pole položek, kde položka je:
//  *  - Array<number> ... animovaný braille (pískem) přes animateBrailleCharSand
//  *  - string .......... vypisuje se po znacích (charMs/spaceMs)
//  */
// async function animateBrailleSequenceSand(targetsList, setFrame, opts = {}) {
//     const {
//         // pro braille animaci (ponech stejné jako máš v animateBrailleCharSand):
//         stepMs = 110, pauseDropMs = 80, pauseColMs = 120, cols,
//         // pro psaní textu:
//         charMs = 40,
//         spaceMs = 0,
//         instantSet
//     } = opts;
//
//     for (let i = 0; i < targetsList.length; i++) {
//         const item = targetsList[i];
//
//         if (isArr(item)) {
//             // animovaný braille „pískem“
//             await animateBrailleCharSand(item, ch => setFrame(i, ch), {stepMs, pauseDropMs, pauseColMs, cols});
//
//         } else if (typeof item === 'string') {
//             // text po znacích
//             // Před začátkem vynuluj slot (pokud chceš mít „psaní od nuly“):
//             setFrame(i, '');
//             await typeOutStringAt(i, item, setFrame, {charMs, spaceMs, instantSet});
//
//         } else {
//             setFrame(i, BLANK);
//         }
//     }
// }
//
//
// async function startBraille(targets) {
//     // ===== Demo bez mezer mezi znaky =====
//     const out = document.getElementById('brailleOut');
//     // mix animovaných znaků a „rychlých“ symbolů
//     // const targets = [
//     //     [1, 2, 3, 7, 5], // ⡗
//     //     [2, 4, 5, 6, 8], // ⢺
//     //     ' ',
//     //     [2, 3, 4, 8], // ⢎
//     //     [1, 7, 5, 6], // ⡱
//     //     ' ',
//     //     [2, 3, 7, 4], // ⡎
//     //     ' ',
//     //     [1, 2, 3, 7, 4, 6], // ⡯
//     //     [1, 3, 7, 5], // ⡕
//     //     ' ',
//     //     [2, 3, 7, 4, 6], // ⡮
//     //     [1, 3, 5, 6, 8], // ⢵
//     //     '  ',
//     //     'Controller',
//     //     ' ',
//     //     '-',
//     //     ' ',
//     //     'Thymos',
//     // ];
//
//     // const targets = [
//     //     'Μ',
//     //     'ο',
//     //     'ῖ',
//     //     'ρ',
//     //     'α',
//     //     ' ',
//     //     'Controller',
//     //     ' ',
//     //     '-',
//     //     ' ',
//     //     'Thymos',
//     // ];
//
//     // předvyplň prázdnými braille U+2800 (stejná délka; žádné mezery navíc)
//     let frames = Array.from({length: targets.length}, () => BLANK);
//     document.title = frames.join('');
//
//     const setFrame = (i, ch) => {
//         frames[i] = ch;
//         document.title = frames.join('');
//     };
//
//     // spusť animaci
//     await animateBrailleSequenceSand(targets, setFrame, {
//         stepMs: 250,
//         pauseDropMs: 80,
//         pauseColMs: 110,
//         charMs: 250,
//         spaceMs: 80,
//         instantSet: new Set([' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '])
//         // cols: [[1,2,3],[4,5,6]] // odkomentuj pro 6-dot
//     });
// }
