let connectButton;
let connectionStatus;

import {
    scriptOptions,
    colorMap,
    colorMeanings,
    fileNames,
    inputFilesLabels,
    inputFiles,
    FirmwareVersions,
    scriptsStates,
    openSerial,
    closeSerial,
    selectFolder,
    inputFirmwareFiles,
    assignFileToMemory,
    validateInputFile,
    resetInputFile,
    initializeFlash,
    readFirmwareVersions,
} from '../packages/internal/flasher.js';


// Set global variables
scriptOptions.logMessages = true; // Enable log messages
scriptOptions.consoleMode = false // Enable console mode
scriptOptions.logFunction = logMessage; // Set log function
scriptOptions.alertFunction = alertFunction; // Set alert function
scriptOptions.stateFunction = updateStateUI; // Set state function

document.addEventListener("DOMContentLoaded", () => {

    connectButton = document.getElementById('connectButton');
    connectionStatus = document.getElementById('connectionStatus');


    // Connect/Disconnect port
    connectButton.addEventListener('click', () => {
        if (scriptOptions.serialPort && scriptOptions.serialPort.readable) {
            closeSerial().then();
            updateConnectionUI('🔑️ Connect to ESP32-S3', '🔒 Disconnected', colorMap.red, colorMap.lightpink);
        } else {
            try {
                openSerial(false, true).then(r => {
                    if (r) {
                        updateConnectionUI('🔐 Disconnect from ESP32-S3', '🔓 Connected', colorMap.darkgreen, colorMap.lightgreen);
                    } else {
                        updateConnectionUI('🔑️ Connect to ESP32-S3', '🔒 Disconnected', colorMap.red, colorMap.lightpink);
                    }
                });
            } catch (error) {
                logMessage(`❌ Error: ${error.message}\n`, colorMeanings.error);
                updateConnectionUI('🔑️ Connect to ESP32-S3', '🔒 Disconnected', colorMap.red, colorMap.lightpink);
            }
        }
    });

    document.getElementById('selectFolderButton').addEventListener('click', folderPicker); // Select folder

    document.getElementById('clearFilesBtn').addEventListener('click', clearAllFileInputs); // Clear all file inputs


    document.getElementById('returnButton').addEventListener('click', async () => {
        // disconnect if connected
        if (scriptOptions.serialPort && scriptOptions.serialPort.readable) {
            await closeSerial();
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait for 100 ms
        }
        // Go back to index.html page (one folder up)
        window.location.href = './';
    });


    document.getElementById('flashButton').addEventListener('click', () => {
        disableAllButtons(true);
        try {
            initializeFlash().then(() => disableAllButtons(false));
        } catch (error) {
            logMessage(`❌ Error: ${error.message}\n`, colorMeanings.error);
            disableAllButtons(false);
        }
    }); // Flash


    // Event listener for file inputs
    fileNames.forEach(id => {
        const input = document.getElementById(id);

        // Reset style on click
        input.addEventListener('click', () => resetFileInputStyle(input));

        // Validate file on change
        input.addEventListener('change', async (event) => {
            if (event.target.files.length === 0) {
                // No file selected or selection canceled by user
                resetFileInputStyle(event.target);
                logMessage(`⚠️ File selection for ${id.replace('File', '')} cancelled.`, colorMeanings.warning);
            } else {
                await assignFileToMemory(event.target.id, event.target.files[0]);  // Before validation: save to inputFiles
                await validateInputFileWithLog(event.target, true);  // After that: Validate and log
            }
        });
    });


    // load Versions variants into the select element
    const firmwareSelect = document.getElementById('firmwareVersionSelect');


    // Event listener for firmware version selection
    firmwareSelect.addEventListener('change', (event) => {
        const selectedType = event.target.value;
        const selectedVersion = FirmwareVersions.versions[selectedType] || selectedType;
        const versionName = selectedType.charAt(0).toUpperCase() + selectedType.slice(1); // Capitalize first letter
        FirmwareVersions.selected = selectedVersion;
        logMessage(`ℹ️ Selected firmware: ${versionName} [version: ${selectedVersion}]`, colorMeanings.info);

        // Load default files for the selected version
        inputFirmwareFiles().then(() =>
            new Promise(resolve => setTimeout(resolve, 5)).then(() =>
                checkSelectedFiles().then(() => {
                    logMessage(`\t🆗 Files for version ${selectedVersion} checked and loaded.`, colorMeanings.info);
                })
            )); // Stop for 5 ms
    });


    FirmwareVersions.use_Default = false; // Do not use default files at the beginning
    readFirmwareVersions().then(_ => {

        Object.keys(FirmwareVersions.versions).forEach(versionKey => {
            const option = document.createElement('option');
            option.value = versionKey;
            let text = versionKey;
            const versionLabel = FirmwareVersions.info[versionKey]?.label || '';
            const versionNumber = FirmwareVersions.info[versionKey]?.version.replace(/v/g, '').replace(/_/g, '.').replace(/-/g, '.') || '';
            if (versionLabel) text += ` - ${versionLabel}`;
            if (versionNumber) text += ` (v${versionNumber})`;
            text = text.charAt(0).toUpperCase() + text.slice(1);             // make first letter uppercase
            option.text = text;
            firmwareSelect.appendChild(option);
        });

        // Set default selected version
        if (FirmwareVersions.selected) {
            firmwareSelect.value = FirmwareVersions.selected;
            scriptOptions.selectedFirmwareVersion = FirmwareVersions.selected;
        } else if (Object.keys(FirmwareVersions.versions).length > 0) {
            const firstVersion = Object.keys(FirmwareVersions.versions)[0];
            firmwareSelect.value = firstVersion;
            scriptOptions.selectedFirmwareVersion = firstVersion;
        }

        logMessage(`☑️ Available firmware versions loaded`, colorMeanings.info);

        firmwareSelect.dispatchEvent(new Event('change'));
    });
})


async function checkSelectedFiles() {
    console.log('Checking default files...', inputFiles);
    fileNames.forEach(id => {
        assignFileHandleToInput(id, inputFiles[id] || null);
        if (!validateInputFileWithLog(document.getElementById(id))) inputFiles[id] = null;
    });
}

function disableAllButtons(disabled = false) {
    document.querySelectorAll('.actionUI').forEach(element => {
        if (disabled) {
            element.classList.add('disabled');
        } else {
            element.classList.remove('disabled');
        }
    });
}


function clearAllFileInputs() {
    fileNames.forEach(id => {
        const input = document.getElementById(id);
        if (input.fileHandle) {
            logMessage(`\t↩️ Previous file selection for ${id.replace('File', '')} cleared.`, colorMeanings.info);
        }
        resetFileInputStyle(input);
    });

    logMessage('🔁 All file inputs have been reset.', colorMeanings.info);
}


async function folderPicker() {
    const errors = [];
    let result = false;

    await selectFolder().then(resolve => {
        fileNames.forEach(id => {
            assignFileHandleToInput(id, inputFiles[id] || null);
            if (!validateInputFileWithLog(document.getElementById(id))) errors.push(`❌ ${inputFilesLabels[id]} file is missing or invalid.`);
        });
        result = resolve;
    });

    if (result) {
        await new Promise(resolve => setTimeout(resolve, 5)).then(() => { // Stop for 5 ms
                if (errors.length > 0) {
                    alertFunction(`⚠️ Some files are invalid:\n${errors.join('\n')}`, colorMap.orange, 'warn');
                } else {
                    alertFunction('✅ All files successfully loaded from folder!', colorMap.green);
                }
            }
        );
    }
}


async function validateInputFileWithLog(input, showAlerts = false) {
    const result = await validateInputFile(input.id, showAlerts);

    await new Promise(resolve => setTimeout(resolve, 5)) // Stop for 5 ms

    if (result === null) {
        resetFileInputStyle(input);
        return false;
    } else if (result) {
        input.style.borderColor = colorMap.green;
        input.style.backgroundColor = colorMap.lightgreen;
        return true;
    } else {
        input.style.borderColor = colorMap.red;
        input.style.backgroundColor = colorMap.lightcoral;
        return false;
    }
}


function assignFileHandleToInput(inputId, fileHandle) {
    const input = document.getElementById(inputId);

    if (fileHandle) {
        input.fileHandle = fileHandle;
        const file = new File([fileHandle], fileHandle.name);
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
    } else {
        resetFileInputStyle(input);
    }
}


function resetFileInputStyle(input) {
    input.style.borderColor = colorMap.darkgray;
    input.style.backgroundColor = colorMap.white;
    input.value = null;    // Delete previous file selection
    input.fileHandle = null;  // Delete a previous file handle
    resetInputFile(input.id);
}


function updateConnectionUI(buttonText, statusText, statusColor, statusColorLight) {
    connectButton.innerText = buttonText;
    connectButton.style.color = statusColor;
    connectButton.style.backgroundColor = statusColorLight;
    connectionStatus.innerText = statusText;
    connectionStatus.style.color = statusColor;
}

function logMessage(msg, color = colorMeanings.regular) {
    if (!scriptOptions.logMessages) return;

    const log = document.getElementById('logOutput');
    const timestamp = new Date().toLocaleTimeString();

    const line = document.createElement('div');
    line.style.color = color;
    line.textContent = `[${timestamp}] ${msg}`;
    line.style.whiteSpace = 'pre-wrap';  // Preserve line breaks
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;  // Auto-scroll to bottom
}


function updateStateUI(state) {
    if (state === 'connected') {
        updateConnectionUI('🔐 Disconnect from ESP32-S3', '🔓 Connected', colorMap.darkgreen, colorMap.lightgreen);
    } else if (state === 'disconnected') {
        updateConnectionUI('🔑️ Connect to ESP32-S3', '🔒 Disconnected', colorMap.red, colorMap.lightpink);
    } else if (state === 'reconnecting') {
        updateConnectionUI('⌛ Waiting for ESP32-S3', '⏲️️ Reconnecting', colorMap.orange, colorMap.lightyellow);
    } else if (state === 'flashing') {
        updateConnectionUI('🔐 Disconnect from ESP32-S3', '🔥 Connected - Flashing', colorMap.darkgreen, colorMap.lightgreen);
    } else {
        logMessage(`💬 Invalid state: ${state}\n`, colorMeanings.danger);
    }
}


function alertFunction(msg) {
    alert(msg);
}