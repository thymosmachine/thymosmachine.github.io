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
        targets: [
            [1, 2, 3, 7, 5], // ⡗
            [2, 4, 5, 6, 8], // ⢺
            ' ',
            [2, 3, 4, 8], // ⢎
            [1, 7, 5, 6], // ⡱
            ' ',
            [2, 3, 7, 4], // ⡎
            ' ',
            [1, 2, 3, 7, 4, 6], // ⡯
            [1, 3, 7, 5], // ⡕
            ' ',
            [2, 3, 7, 4, 6], // ⡮
            [1, 3, 5, 6, 8], // ⢵
            '  ',
            'Controller',
            ' ',
            '-',
            ' ',
            'Thymos',
        ],
        full: '⡗⢺ ⢎⡱ ⡎ ⡯⡕ ⡮⢵  Controller - Thymos',
        empty: '𝅼'
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