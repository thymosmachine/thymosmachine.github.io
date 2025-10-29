// 🆗✅☑️✔️❌✖️⚠️⭕🗺️🧭💬📎


let connectButton;
let connectionStatus;

import {
    scriptVariables,
    colorMap,
    colorMeanings,
    fileNames,
    inputFilesLabels,
    inputFiles,
    openSerial,
    closeSerial,
    selectFolder,
    inputDefaultFirmwareFiles,
    assignFileToMemory,
    validateInputFile,
    resetInputFile,
    initializeFlash
} from './flasher.js';


// Set global variables
scriptVariables.logMessages = true; // Enable log messages
scriptVariables.consoleMode = false // Enable console mode
scriptVariables.logFunction = logMessage; // Set log function
scriptVariables.alertFunction = alertFunction; // Set alert function
scriptVariables.stateFunction = updateStateUI; // Set state function

document.addEventListener("DOMContentLoaded", () => {
    connectButton = document.getElementById('connectButton');
    connectionStatus = document.getElementById('connectionStatus');


    // Connect/Disconnect port
    connectButton.addEventListener('click', () => {
        if (scriptVariables.serialPort && scriptVariables.serialPort.readable) {
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


    document.getElementById('returnButton').addEventListener('click', () => {
        // disconnect if connected
        if (scriptVariables.serialPort && scriptVariables.serialPort.readable) {
            closeSerial().then();
        }
        // Go back to index.html page (one folder up)
        window.location.href = '../index.html';
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

    inputDefaultFirmwareFiles().then(() => new Promise(resolve => setTimeout(resolve, 5)).then(() => checkDefaultFiles())); // Stop for 1 ms
})


async function checkDefaultFiles() {
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
    if (!scriptVariables.logMessages) return;

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