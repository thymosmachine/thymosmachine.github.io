export const fileFilters = {
    bootloaderFile: '.ino.bootloader.bin', partitionsFile: '.ino.partitions.bin', firmwareFile: '.ino.bin'
};

export const fileNames = ['bootloaderFile', 'partitionsFile', 'firmwareFile'];


export const inputFilesLabels = {
    bootloaderFile: 'Bootloader', partitionsFile: 'Partitions', firmwareFile: 'Firmware'
}


export const fileAddresses = {
    bootloaderFile: 0x0000, partitionsFile: 0x8000, firmwareFile: 0x10000
};

export const inputFiles = {
    bootloaderFile: null, partitionsFile: null, firmwareFile: null
}


export const scriptVariables = {
    baudRate: 921600,
    serialPort: null,
    logMessages: true,
    consoleMode: false,
    logFunction: () => null,
    alertFunction: () => null,
    stateFunction: () => null,
};

scriptVariables.logFunction = scriptVariables.logMessages ? logConsole : () => null; // No-op if logging is disabled
scriptVariables.alertFunction = scriptVariables.consoleMode ? console.log : logAlert; // No-op if console mode is disabled


export const scriptOptions = {
    useESPSignals: false,
    useFilteredPort: true,
    thymosFingerprints: [
        "12346:4097", //  ≈ "0x303a:0x1001"
    ],
};


function logAlert(message) {
    alert(message);
}

function logConsole(message, color = colorMeanings.regular, mode = 'info') {
    if (!message) return;
    switch (mode) {
        case 'warn':
            console.warn(`%c${message}`, `color: ${color}`);
            return;
        case 'error':
            console.error(`%c${message}`, `color: ${color}`);
            return;
        case 'log':
            console.log(`%c${message}`, `color: ${color}`);
            return;
        case 'info':
        default:
            console.info(`%c${message}`, `color: ${color}`);
            return;
    }
}

export const colorMap = {
    black: '#000000',
    gray: '#A9A9A9',
    darkgray: '#808080',
    lightgray: '#D3D3D3',
    white: '#FFFFFF',
    lightpink: '#FFB6C1',
    pink: '#FF69B4',
    darkpink: '#FF1493',
    lightred: '#FFC0CB',
    red: '#FF0000',
    darkred: '#8B0000',
    lightcoral: '#F08080',
    lightyellow: '#FFFFE0',
    yellow: '#FFD700',
    orange: '#FFA500',
    lightblue: '#87CEFA',
    blue: '#2196F3',
    darkblue: '#2150F3',
    lightcyan: '#00FFFF',
    cyan: '#00CED1',
    darkcyan: '#008B8B',
    lightgreen: '#90EE90',
    green: '#4CAF50',
    darkgreen: '#006400',
    lightpurple: '#BA55D3',
    purple: '#9370DB',
    darkpurple: '#8A2BE2',
};


export const colorMeanings = {
    regular: colorMap.black,
    info: colorMap.blue,
    stateInfo: colorMap.darkblue,
    stateInfo2: colorMap.darkcyan,
    stateInfo3: colorMap.purple,
    success: colorMap.green,
    warning: colorMap.orange,
    danger: colorMap.darkpink,
    error: colorMap.red,
    muted: colorMap.gray,
    failed: colorMap.darkgray,
    progress: colorMap.gray,
    completeProgress: colorMap.darkgray
}


const firmwareFileBaseFolder = './firmwareFiles/latest/';
const firmwareFileBasename = '09_ESP32_LM_mainboard';


export async function inputDefaultFirmwareFiles() {
    await console.log('Default firmware files loading from:', firmwareFileBaseFolder);
    for (const fileName of fileNames) {
        let content = null;
        try {
            const response = await fetch(`${firmwareFileBaseFolder}${firmwareFileBasename}${fileFilters[fileName]}`, {method: 'GET'});
            if (response.ok) {
                content = await response.blob();
            } else {
                console.warn(`Failed to fetch ${fileName}, status: ${response.status}`);
                continue;
            }
        } catch (e) {
            console.error(`Error setting default file for ${fileName}: ${e.message}`);
            continue; // Pokud je chyba, přeskočí iteraci
        }

        const file = new File([content], `${firmwareFileBasename}${fileFilters[fileName]}`);
        await assignFileToMemory(fileName, file);
    }
}


// Validate file input and log details
export async function validateInputFile(input, showAlerts = false) {
    const file = inputFiles[input];

    if (!file) {
        if (showAlerts) scriptVariables.alertFunction(`❌ No file selected for ${inputFilesLabels[input]}`);
        return null;
    }

    const expectedExtension = fileFilters[input];
    if (!file.name.endsWith(expectedExtension)) {
        if (showAlerts) scriptVariables.alertFunction(`❌ Wrong file format for ${inputFilesLabels[input]}.\n\tExpected: ${expectedExtension}`);
        return false;
    }

    await logFileDetails(input.replace('File', ''), file);
    return true;
}


// Select folder and load files
export async function selectFolder() {
    let handle;
    try {
        handle = await window.showDirectoryPicker();
    } catch (error) {
        if (error.name === 'AbortError') {
            scriptVariables.logFunction('\t⚠️ No folder selected.', colorMeanings.warning);
        } else {
            scriptVariables.logFunction(`❌ Error: ${error.message}`, colorMeanings.error);
        }
        return false;
    }

    const files = await getFilesFromDirectory(handle);

    if (!files) {
        scriptVariables.logFunction('\t⚠️ No files found in selected folder.', colorMeanings.warning);
        return false
    } else {
        scriptVariables.logFunction(`🗄️ Folder selected: ${handle.name}`, colorMeanings.regular);
    }

    const errors = [];
    for (const fileName of fileNames) {
        const fileHandle = files.find(file => file.name.endsWith(fileFilters[fileName]));
        if (fileHandle) {
            await assignFileToMemory(fileName, fileHandle);
        } else {
            scriptVariables.logFunction(`\t⚠️ File for ${fileName} not found in selected folder.`, colorMeanings.warning);
            errors.push(`❌ ${inputFilesLabels[fileName]} file not found.`);
        }
    }

    if (errors.length > 0) {
        scriptVariables.alertFunction(`⚠️ Some files are missing:\n${errors.join('\n')}`);
        return false;
    }

    return true;
}

// Load files from directory
async function getFilesFromDirectory(directoryHandle) {
    const files = [];
    for await (const entry of directoryHandle.values()) if (entry.kind === 'file') files.push(entry);
    return files;
}


// Assign a file to memory (inputFiles) from a file handle (filePicker)
export async function assignFileToMemory(inputId, fileHandle) {
    if (!fileHandle) {
        resetInputFile(inputId);
        return;
    }

    if (fileHandle.kind === 'file') {
        inputFiles[inputId] = await fileHandle.getFile();
    } else {
        inputFiles[inputId] = fileHandle;
    }
}


export function resetInputFile(input) {
    inputFiles[input] = null;
}


async function logFileDetails(label, file) {
    const hash = await calculateFileHash(file);
    scriptVariables.logFunction(`📁 File loaded for ${label}: ${file.name}`, colorMeanings.regular);
    scriptVariables.logFunction(`\t📐 Size: ${file.size} bytes`, colorMeanings.regular);
    scriptVariables.logFunction(`\t🗂️ Last Modified: ${new Date(file.lastModified).toLocaleString()}`, colorMeanings.regular);
    scriptVariables.logFunction(`\t📍  Flash Address: 0x${fileAddresses[label + 'File'].toString(16).padStart(8, '0')}`, colorMeanings.regular);
    scriptVariables.logFunction(`✅ ${label} file accepted.`, colorMeanings.success);
    scriptVariables.logFunction(`\t\t⚙️ SHA-256: ${hash}\n`, colorMeanings.completeProgress);
}

async function calculateFileHash(file) {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}


async function getFileContent(inputId) {
    const file = inputFiles[inputId];

    if (!file) {
        return {error: `❌ No file selected for ${inputFilesLabels[inputId]}`};
    }

    const expectedExtension = fileFilters[inputId];
    if (!file.name.endsWith(expectedExtension)) {
        return {error: `❌ Wrong file type for ${inputFilesLabels[inputId]}. Expected: ${expectedExtension}`};
    }

    try {
        const fileData = new Uint8Array(await file.arrayBuffer());
        let compressedData;

        if (typeof CompressionStream !== "undefined") {
            console.log('\n\tUsing CompressionStream for compression', file?.name);

            // without zlib header use: 'deflate-raw'
            const stream = new Blob([fileData])  // fileData: ArrayBuffer/Uint8Array
                .stream()
                .pipeThrough(new CompressionStream('deflate'));   // Compress using CompressionStream (zlib)

            compressedData = new Uint8Array(await new Response(stream).arrayBuffer());

            console.log('\n\t\tCompressionStream compressed size:', compressedData.length);


        } else if (self.pako.gzip) {
            console.log('\n\tUsing pako for compression', file?.name);

            // without zlib header use: 'pako.deflateRaw(...)'
            compressedData = self.pako?.deflate(fileData); // Compress using pako (zlib)  // optional: { level: 6 }

            console.log('\n\t\tPako compressed size:', compressedData.length);


        } else {
            console.log('\n\tNo compression method available', file?.name);

            compressedData = fileData; // No compression available

            console.log('\n\t\tCompressionStream compressed size:', compressedData.length);
        }

        if (!compressedData || compressedData.length === 0 || compressedData.length >= fileData.length) {
            scriptVariables.logFunction(`⚠️ Compression failed or resulted in empty data for file: ${file.name}. Using original data.`, colorMeanings.warning, 'warn');
            compressedData = fileData;
        }

        return {data: compressedData, originalSize: fileData.length, compressedSize: compressedData.length, file: file};

    } catch (e) {
        return {error: `❌ Failed to read file: ${file.name}, reason: ${e.message}`};
    }
}


// Flash
export async function initializeFlash() {
    if (!scriptVariables.serialPort || !scriptVariables.serialPort.readable) {
        scriptVariables.logFunction('✖️ Cannot flash - port is not connected.', colorMeanings.failed);
        scriptVariables.alertFunction('❌ Port is not connected!');
        return;
    }


    const bootloaderResult = await getFileContent('bootloaderFile');
    const partitionsResult = await getFileContent('partitionsFile');
    const firmwareResult = await getFileContent('firmwareFile');

    const errors = [];

    if (bootloaderResult.error) errors.push(bootloaderResult.error);
    if (partitionsResult.error) errors.push(partitionsResult.error);
    if (firmwareResult.error) errors.push(firmwareResult.error);

    if (errors.length > 0) {
        scriptVariables.logFunction(`❌ Cannot proceed with flashing. Issues detected:\n${errors.join('\n')}`, colorMeanings.error);
        scriptVariables.alertFunction(`❌ Cannot proceed with flashing. Issues detected:\n${errors.join('\n')}`);
        return;
    }

    await flashESP32S3(scriptVariables.serialPort, bootloaderResult.data, partitionsResult.data, firmwareResult.data, bootloaderResult.originalSize, partitionsResult.originalSize, firmwareResult.originalSize, bootloaderResult.file, partitionsResult.file, firmwareResult.file);
}


async function flashESP32S3(port, bootloader, partitions, firmware, bootloaderOriginalSize, partitionsOriginalSize, firmwareOriginalSize, bootloaderFile, partitionsFile, firmwareFile) {

    let writer = port.writable.getWriter();
    let reader = port.readable.getReader();
    scriptVariables.logFunction('🚀 Starting flashing process...\n', colorMeanings.info);

    // TODO: 1) get values before flashing (name, id, ...)
    // TODO:                                                'MISC get NAME' + 'MISC GET MACHINE_ID'

    await eraseFlash(writer);

    await writeFlashSection(writer, 'Bootloader', bootloader, fileAddresses.bootloaderFile, bootloaderOriginalSize, bootloaderFile);
    await writeFlashSection(writer, 'Partitions', partitions, fileAddresses.partitionsFile, partitionsOriginalSize, partitionsFile);
    await writeFlashSection(writer, 'Firmware', firmware, fileAddresses.firmwareFile, firmwareOriginalSize, firmwareFile);
    writer.releaseLock();
    reader.releaseLock();
    scriptVariables.logFunction('✔️ Flashing completed.\n', colorMeanings.success);


    scriptOptions.useESPSignals ? await resetSerialPortSignals() : await resetSerialPortBasic();


    // TODO: 2) refresh of memory after flashing by COMMAND
    // TODO:                                                'MEMORY RESET'

    // TODO: 3) restore them after flashing
}


async function writeFlashSection(writer, label, data, address, originalSize, file) {
    const endAddress = address + data.length;

    scriptVariables.logFunction(`🔖 Writing ${label} [${file.name}]:`, colorMeanings.regular);
    scriptVariables.logFunction(`\t🚩 Start Address: 0x${Number(address).toString(16).padStart(8, '0')}`, colorMeanings.regular);
    scriptVariables.logFunction(`\t🏁 End Address: 0x${Number(endAddress).toString(16).padStart(8, '0')}`, colorMeanings.regular);
    scriptVariables.logFunction(`\t💾 Original Size: ${originalSize} bytes`, colorMeanings.regular);
    scriptVariables.logFunction(`\t📦 Compressed Size: ${data.length} bytes, (reduced to ${((data.length / originalSize) * 100).toFixed(2)}%)`, colorMeanings.regular);

    const chunkSize = 0x400;
    let offset = 0;
    let chunk;

    const startTime = performance.now();  // Start performance measurement
    let lastReportedPercent = 0;

    while (offset < data.length) {
        chunk = data.slice(offset, offset + chunkSize);
        await writer.write(chunk);

        lastReportedPercent = logProgress(offset, data.length, address, 10, lastReportedPercent, chunkSize, '💿 Writing', colorMeanings.progress);

        offset += chunk.length;
    }
    const endTime = performance.now();  // End performance measurement
    const duration = (endTime - startTime) / 1000;  // Transfer duration to seconds
    const sizeInBits = data.length * 8;
    const speed = (sizeInBits / duration / 1000).toFixed(3);  // kBit/s

    scriptVariables.logFunction(`\t📀 Firmware written upto 0x${Number(endAddress).toString(16).padStart(8, '0')} (100%)\n`, colorMeanings.completeProgress);

    scriptVariables.logFunction(`\t⏱️️ Write speed: ${speed} kBit/s`, colorMeanings.info);
    scriptVariables.logFunction(`✒️ ${label} written.\n`, colorMeanings.success);
}


async function eraseFlash(writer) {
    scriptVariables.logFunction('💣 Erasing flash...', colorMeanings.regular);


    if (scriptOptions.useESPSignals) {
        // Reset ESP32-S3 after erasing flash memory            TODO ////////////////////////      check it if works correctly
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait
        await setSerialSignals(scriptVariables.serialPort, true, true);

        new Promise(resolve => setTimeout(resolve, 500)); // Wait (500 ms)
        await setSerialSignals(scriptVariables.serialPort, false, true); // Hold reset ESP

        new Promise(resolve => setTimeout(resolve, 200)); // Wait (200 ms)
        await setSerialSignals(scriptVariables.serialPort, true, false); // Start ESP

        new Promise(resolve => setTimeout(resolve, 100)); // Wait (100 ms)

    } else {

        const emptyBlock = new Uint8Array(0x1000).fill(0xFF);

        const totalSize = 4 * 1024 * 1024;  // Total flash size (4 MB)
        const blockSize = emptyBlock.length;  // Block size (4 KB)

        let lastReportedPercent = 0;

        for (let address = 0; address < totalSize; address += blockSize) {
            await writeFlashBlock(writer, address, emptyBlock);

            // During erasing, address is the offset of the block
            lastReportedPercent = await logProgress(address, totalSize, 0x00000000, 10, lastReportedPercent, blockSize, '🚮 Erasing', colorMeanings.progress);
        }
        scriptVariables.logFunction(`\t🗑️ Flash erased up to 0x${(totalSize).toString(16).padStart(8, '0')} (100%)\n`, colorMeanings.completeProgress);
    }
    scriptVariables.logFunction('💥 Flash erased.\n', colorMeanings.success);


}

async function writeFlashBlock(writer, address, data) {
    const commandHeader = new Uint8Array([0x02,                       // Command - Write Flash
        data.length & 0xFF,         // Length LSB
        (data.length >> 8) & 0xFF,  // Length MSB
        address & 0xFF,             // Address LSB
        (address >> 8) & 0xFF,      // Address MSB
        (address >> 16) & 0xFF,     // Address MSB
        (address >> 24) & 0xFF      // Address MSB
    ]);

    // Send command + data
    await writer.write(commandHeader);
    await writer.write(data);
}

function logProgress(currentOffset, totalSize, baseAddress, stepPercent, lastReportedPercent, chunkSize = 1024, action = 'Processing', textColor = colorMeanings.regular) {
    const percent = Math.floor((currentOffset / totalSize) * 100);
    if (typeof chunkSize === 'string') chunkSize = parseInt(String(chunkSize), 16);

    if (percent >= lastReportedPercent + stepPercent) {
        const startAddress = baseAddress + currentOffset;
        const endAddress = startAddress + chunkSize - 1;

        scriptVariables.logFunction(`\t${action} from 0x${Number(startAddress).toString(16).padStart(8, '0')} to 0x${endAddress.toString(16).padStart(8, '0')} (${percent}%)`, textColor);
        return percent;  // Return "lastReportedPercent"
    }
    return lastReportedPercent;  // No new log => return last reported percent
}

// Set signals
async function setSerialSignals(port, dtrState, rtsState, brkState) {
    // https://wicg.github.io/serial/#dom-serialinputsignals
    if (!port) return;

    try {
        // Output signals
        await port?.setSignals({
            dataTerminalReady: dtrState, requestToSend: rtsState, break: brkState
        });

        console.log(`✅ DTR: ${dtrState}, RTS: ${rtsState}, BRK: ${brkState}`);
    } catch (error) {
        console.error("❌ Error setting serial signals:", error);
    }

    // Input signals
    const signals = await port?.getSignals();
    console.log("🚦 Signals:", signals);
    // dictionary SerialInputSignals {
    //           required boolean dataCarrierDetect; // Data Carrier Detect (DCD)
    //           required boolean clearToSend; // Clear To Send (CTS)
    //           required boolean ringIndicator; // Ring Indicator (RI)
    //           required boolean dataSetReady; // Data Set Ready (DSR)
    //         };
}


// Close port
export async function closeSerial(hardClose = true) {
    try {
        if (scriptVariables.serialPort) {
            await scriptVariables.serialPort.close();
            if (hardClose) {
                scriptVariables.serialPort = null;
                scriptVariables.logFunction('\t🚪 Port disconnected.\n', colorMeanings.success);
            } else {
                scriptVariables.logFunction('\t↪️ Port closed.', colorMeanings.stateInfo);
            }
            await new Promise(resolve => setTimeout(resolve, 100)); // Stop for 100 ms

            scriptVariables.logFunction('🆗 Port disconnected.\n', colorMeanings.stateInfo3);
            await scriptVariables.stateFunction('disconnected');
            return true;
        } else {
            scriptVariables.logFunction('\t⚠️ No port to close.', colorMeanings.warning);
            await scriptVariables.stateFunction('disconnected');
            return null;
        }
    } catch (error) {
        scriptVariables.logFunction(`❌ Error: ${error.message}\n`, colorMeanings.error);
        scriptVariables.serialPort = null;
        scriptVariables.logFunction('✖️ Port disconnection failed.\n', colorMeanings.failed);
        await scriptVariables.stateFunction('disconnected');
        return false;
    }
}

// Connect/Disconnect port
export async function openSerial(selectedPort = false, toggleRequest = false) {
    try {
        scriptVariables.logFunction('🔏 Requesting access to serial port...', colorMeanings.regular);

        if (!(!selectedPort && scriptVariables.serialPort)) {
            if (!toggleRequest) await closeSerial(true);

            scriptVariables.serialPort = await navigator.serial?.requestPort({
                filters: scriptOptions.useFilteredPort ? [...scriptOptions.thymosFingerprints.map(fp => {
                    const [vendorId, productId] = fp.split(":").map(id => parseInt(id, 10));
                    return {usbVendorId: vendorId, usbProductId: productId};
                })] : []
            });
            await new Promise(resolve => setTimeout(resolve, 100)); // Stop for 100 ms
            const {usbVendorId, usbProductId} = scriptVariables.serialPort?.getInfo();
            scriptVariables.logFunction(`📋 Port selected - VID: ${Number(usbVendorId)?.toString(16) ?? 'N/A'}, PID: ${Number(usbProductId)?.toString(16) ?? 'N/A'}`, colorMeanings.regular);

            scriptVariables.logFunction(`⚡ Opening port at ${scriptVariables.baudRate} baud`, colorMeanings.regular);
            await scriptVariables.serialPort.open({baudRate: scriptVariables.baudRate});
            scriptVariables.logFunction('☑️ Port opened.\n', colorMeanings.info);
        } else {
            await scriptVariables.serialPort.open({baudRate: scriptVariables.baudRate});
            await new Promise(resolve => setTimeout(resolve, 1000)); // Stop for 1000 ms
            scriptVariables.logFunction('\t🔄 Port reconnected.', colorMeanings.stateInfo);

        }


        scriptOptions.useESPSignals ? await setSerialSignals(scriptVariables.serialPort, true, false) : await setSerialSignals(scriptVariables.serialPort, true, true);


        scriptVariables.logFunction('☑️ Serial port connected.\n', colorMeanings.stateInfo2);
        await scriptVariables.stateFunction('connected');
        return true;

    } catch (error) {
        if (error.name === "NotFoundError") {
            scriptVariables.logFunction('\t⚠️ No port selected.', colorMeanings.warning);
        } else {
            scriptVariables.logFunction(`❌ Error: ${error.message}\n`, colorMeanings.error);
        }
        scriptVariables.serialPort = null;
        scriptVariables.logFunction('✖️ Serial port connection failed.\n', colorMeanings.failed);
        await scriptVariables.stateFunction('disconnected');
        return false;
    }
}


async function resetSerialPortSignals(timeOut = 200) {
    try {
        await scriptVariables.logFunction('🛡️ Restarting ESP32-S3', colorMeanings.info);


        await scriptVariables.stateFunction('reconnecting');

        await setSerialSignals(scriptVariables.serialPort, true, true);
        await new Promise(resolve => setTimeout(resolve, timeOut));


        await setSerialSignals(scriptVariables.serialPort, false, false);
        await new Promise(resolve => setTimeout(resolve, timeOut));
        await setSerialSignals(scriptVariables.serialPort, true, false);


        await scriptVariables.stateFunction('connected');
        await scriptVariables.logFunction('✅ Serial port reset completed.\n', colorMeanings.success);
        return true;


    } catch (error) {
        await scriptVariables.stateFunction('disconnected');
        await scriptVariables.logFunction('✖️ Serial port reset failed.', colorMeanings.failed);
        await scriptVariables.logFunction(`❌ Error: ${error.message}\n`, colorMeanings.error);
    }
}


async function resetSerialPortBasic() {
    try {
        await scriptVariables.logFunction('🛡️ Restarting ESP32-S3', colorMeanings.info);

        await setSerialSignals(scriptVariables.serialPort, true, true);
        await new Promise(resolve => setTimeout(resolve, 300));

        await scriptVariables.stateFunction('reconnecting');

        // Disconnect
        await scriptVariables.logFunction('🔁 Starting a reboot #1\n', colorMeanings.completeProgress);
        await closeSerial(false);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1.0 second

        // Reconnect
        await openSerial(false).then(resolve => {
            if (!resolve) {
                scriptVariables.logFunction('✖️ Serial port reset failed.\n', colorMeanings.failed);
                scriptVariables.stateFunction('disconnected');
                return false;
            }
        });

        // Disconnect
        await scriptVariables.logFunction('🔁 Starting a reboot #2\n', colorMeanings.completeProgress);
        await closeSerial(false);
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 0.5 seconds

        // Reconnect
        await openSerial(false).then(r => {
            if (r) {
                scriptVariables.logFunction('✅ Serial port reset completed.\n', colorMeanings.success);
                scriptVariables.stateFunction('connected');
            } else {
                scriptVariables.logFunction('✖️ Serial port reset failed.\n', colorMeanings.failed);
                scriptVariables.stateFunction('disconnected');
                return false;
            }
        });

        await setSerialSignals(scriptVariables.serialPort, true, false); // Set DTR to true and RTS to false

    } catch (error) {
        await scriptVariables.logFunction(`❌ Error: ${error.message}\n`, colorMeanings.error);
        scriptVariables.stateFunction('disconnected');
    }
}








