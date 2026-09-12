// ======================================================
// Printer Guardian v2.1
// Part 1 - Foundation
// ======================================================

let socket = null;

let reconnectTimer = null;

const RECONNECT_DELAY = 2000;


// Cached printer state.
// Moonraker sends partial updates, so we remember the
// previous values here.
const printer = {

    print_stats: {},
    toolhead: {},
    extruder: {},
    heater_bed: {},
    virtual_sdcard: {},
    webhooks: {},

};

let previousPrintState = "";
let recoveryStateLoaded = false;

let savedRecoveryProgress = 0;
let savedRecoveryLayer = 0;
let savedRecoveryTotalLayers = 0;
let savedRecoveryPrintDuration = 0;
let gcodeStartByte = 0;
let gcodeEndByte = 0;

function subscribePrinterObjects() {

    socket.send(JSON.stringify({

        jsonrpc: "2.0",

        method: "printer.objects.subscribe",

        params: {

            objects: {

                print_stats: null,

                toolhead: null,

                extruder: null,

                heater_bed: null,

                virtual_sdcard: null,

                webhooks: null

            }

        },

        id: 1

    }));

}

function connectGuardian() {

    console.log("Connecting to Guardian...");

    socket = new WebSocket(
        "ws://" + location.hostname + ":7125/websocket"
    );

    function onSocketOpen() {

        console.log("Printer Guardian connected.");

        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        subscribePrinterObjects();

        const guardianBox = document.getElementById("guardian");

        if (guardianBox) {

            guardianBox.innerHTML =
                '<div class="value">🟢 PRINTER CONNECTED</div>';

        }

        socket.send(JSON.stringify({

            jsonrpc: "2.0",

            method: "printer.info",

            id: 99

        }));

        // Force the dashboard to refresh immediately
        updateDashboard();

    }

function onSocketMessage(event) {

    const msg = JSON.parse(event.data);

    console.log(msg);

    // Klipper/printer disappeared, but Moonraker is still alive.
    if (msg.method === "notify_klippy_disconnected") {

        console.log("Printer disconnected. Guardian is waiting...");

        printer.webhooks.state = "disconnected";

        const guardianBox =
            document.getElementById("guardian");

        if (guardianBox) {

            guardianBox.innerHTML =
                '<div class="value">🟡 WAITING FOR PRINTER</div>';

        }

        return;

    }

    // Klipper/printer came back.
    // Re-subscribe so Guardian receives fresh printer data again.
    if (msg.method === "notify_klippy_ready") {

        console.log("Printer returned. Re-subscribing...");

        subscribePrinterObjects();

        socket.send(JSON.stringify({

            jsonrpc: "2.0",

            method: "printer.info",

            id: 99

        }));

        return;

    }

    // Response from printer.info
    if (msg.id === 99 && msg.result && msg.result.state) {

        console.log(
            "printer.info returned:",
            msg.result.state
        );

        printer.webhooks.state = msg.result.state;

        updateDashboard();

        return;

    }

    let update = null;

    // Initial subscription response
    if (msg.result && msg.result.status) {

        update = msg.result.status;

    }

    // Live printer updates
    else if (
        msg.method === "notify_status_update" &&
        msg.params &&
        msg.params.length > 0
    ) {

        update = msg.params[0];

    }

    if (!update)
        return;

    for (const key in update) {

        if (!printer[key])
            printer[key] = {};

        Object.assign(printer[key], update[key]);

    }

    updateDashboard();

}

    function onSocketError(event) {

        console.error("WebSocket error:", event);

    }

    function onSocketClose() {

        console.log("Guardian waiting for printer...");

        const guardianBox =
            document.getElementById("guardian");

        if (guardianBox) {

            guardianBox.innerHTML =
                '<div class="value">🟡 RECONNECTING...</div>';

        }

        clearTimeout(reconnectTimer);

        reconnectTimer = setTimeout(() => {

            connectGuardian();

        }, RECONNECT_DELAY);

    }

    socket.onopen = onSocketOpen;
    socket.onmessage = onSocketMessage;
    socket.onerror = onSocketError;
    socket.onclose = onSocketClose;

}

connectGuardian();


// ======================================================
// Part 3 - Dashboard Update Functions
// ======================================================

async function uploadRecoveryGcode() {

    const recoveryGcode =
        recoveryBuilder.buildRecoveryHeader();

    const originalName =
        recoveryBuilder.recovery.filename || "recovery.gcode";

    const recoveryName =
        "GUARDIAN_RECOVERY_" + originalName;

    const formData = new FormData();

    formData.append(
        "file",
        new Blob(
            [recoveryGcode],
            { type: "application/octet-stream" }
        ),
        recoveryName
    );

    formData.append("root", "gcodes");
    formData.append("print", "false");

    const response = await fetch(
        "/server/files/upload",
        {
            method: "POST",
            body: formData
        }
    );

    if (!response.ok) {

        throw new Error(
            "Recovery G-code upload failed."
        );

    }

    const result = await response.json();

    console.log(
        "Guardian recovery file uploaded:",
        result
    );

    return result;
}

const prepareRecoveryButton =
    document.getElementById("prepareRecoveryButton");

if (prepareRecoveryButton) {

    prepareRecoveryButton.addEventListener(
        "click",
        async () => {

        if (
            !recoveryStateLoaded ||
            !recoveryBuilder.recovery.filename ||
            recoveryBuilder.recovery.recoveryLayer <= 0 ||
            recoveryBuilder.recovery.recoveryZ <= 0 ||
            recoveryBuilder.recovery.gcodeSpeed <= 0
        ) {
            alert(
                "No valid Guardian recovery is available."
            );
            return;
        }
            
            try {

                await uploadRecoveryGcode();

                alert(
                    "Guardian recovery file prepared and uploaded."
                );

            }
            catch (error) {

                console.error(
                    "Guardian recovery preparation failed:",
                    error
                );

                alert(
                    "Guardian recovery preparation failed."
                );

            }

        }
    );

}

const discardRecoveryButton =
    document.getElementById("discardRecoveryButton");

if (discardRecoveryButton) {

    discardRecoveryButton.addEventListener(
        "click",
        async () => {

            const confirmed = confirm(
                "Discard the saved Guardian recovery?\n\n" +
                "This cannot be undone."
            );

            if (!confirmed) {
                return;
            }

            try {

                const response = await fetch(
                    "/server/database/item",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            namespace: "guardian",
                            key: "discard_recovery",
                            value: true
                        })
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        "Discard request failed."
                    );
                }

                recoveryStateLoaded = true;

                savedRecoveryProgress = 0;
                savedRecoveryLayer = 0;
                savedRecoveryTotalLayers = 0;

                recoveryBuilder.reset();

                const recoveryStatus =
                    document.getElementById("recoveryStatus");

                if (recoveryStatus) {
                    recoveryStatus.innerHTML =
                        "No saved recovery";
                }

                const recoveryButtons =
                    document.getElementById("recoveryButtons");

                if (recoveryButtons) {
                    recoveryButtons.style.display = "none";
                }

                alert(
                    "Guardian recovery discarded."
                );

            }
            catch (error) {

                console.error(
                    "Guardian recovery discard failed:",
                    error
                );

                alert(
                    "Guardian recovery discard failed."
                );

            }

        }
    );

}

function updateDashboard() {

    analyzer.updatePrinterState(printer);

    const currentPrintState =
        (printer.print_stats.state || "").toLowerCase();

    if (
        currentPrintState === "printing" &&
        previousPrintState !== "printing" &&
        previousPrintState !== "paused"
    ) {

        const filename =
            printer.print_stats.filename;

        if (filename && !filename.startsWith("GUARDIAN_RECOVERY_")) {
            
            recoveryStateLoaded = false;
            recoveryBuilder.reset();
            
            const recoveryStatus =
                document.getElementById("recoveryStatus");

            if (recoveryStatus) {
                recoveryStatus.innerHTML = "No saved recovery";
            }

            const recoveryButtons =
                document.getElementById("recoveryButtons");

            if (recoveryButtons) {
                recoveryButtons.style.display = "none";
            }

            }
            
            if (filename) {

                const recoveryStartProgress =
                    savedRecoveryProgress;

                const recoveryStartLayer =
                    savedRecoveryLayer;

                const recoveryOriginalTotalLayers =
                    savedRecoveryTotalLayers;

                analyzer.loadPrint(filename)
                    .then(() => {

                        if (filename.startsWith("GUARDIAN_RECOVERY_")) {
                            analyzer.job.recovery.startProgress =
                                recoveryStartProgress;

                            analyzer.job.recovery.startLayer =
                                recoveryStartLayer;

                            analyzer.job.recovery.originalTotalLayers =
                                recoveryOriginalTotalLayers;

                            analyzer.job.totalLayers =
                                recoveryOriginalTotalLayers;

                        }

    recoveryBuilder.loadRecoveryData({
        filename: analyzer.job.filename,
        recoveryLayer:
            analyzer.job.recovery.recommendedLayer,
        recoveryFilePosition:
            analyzer.job.recovery.recoveryFilePosition,
        recoveryZ:
            analyzer.job.recovery.recoveryZ,
        activeTool:
            analyzer.job.recovery.activeTool,
        originalGcodeBytes:
            analyzer.job.gcodeBytes,
        originalGcode:
            analyzer.job.gcodeText
    });

    console.log(
        "GRE Recovery Builder loaded:",
        recoveryBuilder.recovery
    );

    console.log(
    "GRE Recovery Start Byte:",
    recoveryBuilder.recovery.recoveryFilePosition

);

})
.catch((error) => {

        console.error(
            "GRE could not load print:",
            error
            );

        });

    }

    fetch(
        "/server/files/metadata?filename=" +
        encodeURIComponent(filename)
    )
    .then((response) => response.json())
    .then((data) => {

        if (data.result) {

            gcodeStartByte =
                data.result.gcode_start_byte || 0;

            gcodeEndByte =
                data.result.gcode_end_byte || 0;

            console.log(
                "G-code print range:",
                gcodeStartByte,
                gcodeEndByte
            );

        }

    })
    .catch((error) => {

        console.error(
            "Unable to load G-code metadata:",
            error
        );

    });



}

    previousPrintState = currentPrintState;

// ---------- Printer Connection ----------

const guardianBox = document.getElementById("guardian");

if (guardianBox) {

    console.log(
        "Current webhook state:",
        printer.webhooks.state
    );

    switch (printer.webhooks.state) {

        case "ready":

            guardianBox.innerHTML =
                '<div class="value">🟢 MONITORING PRINTER</div>';
            break;

        case "startup":

            guardianBox.innerHTML =
                '<div class="value">🟡 PRINTER STARTING</div>';
            break;

        case "shutdown":

            guardianBox.innerHTML =
                '<div class="value">🔴 PRINTER OFFLINE</div>';
            
            if (!recoveryStateLoaded) {

               recoveryStateLoaded = true;

               analyzer.loadRecoveryState()
                   .then((recoveryState) => {

            console.log(
                "Guardian loaded saved recovery state:",
                recoveryState
            );

            if (recoveryState.filename) {

                analyzer.loadPrint(recoveryState.filename)
                    .then(() => {

                        analyzer.applyRecoveryState(recoveryState);
                        analyzer.analyzeRecovery();
                        
                        savedRecoveryProgress =
                            analyzer.job.recovery.startProgress;

                        savedRecoveryPrintDuration =
                            Number(recoveryState.print_duration || 0);

                        savedRecoveryLayer =
                            analyzer.job.recovery.startLayer;

                        savedRecoveryTotalLayers =
                            analyzer.job.recovery.originalTotalLayers;

                        recoveryBuilder.loadRecoveryData({
                            filename: recoveryState.filename,
                            recoveryLayer:
                                analyzer.job.recovery.recommendedLayer,
                            activeTool:
                                analyzer.job.recovery.activeTool,                                    
   
                            file_position: recoveryState.file_position,
                            z: recoveryState.z,
                            x: recoveryState.x,
                            y: recoveryState.y,
                            gcode_x: recoveryState.gcode_x,
                            gcode_y: recoveryState.gcode_y,
                            gcode_z: recoveryState.gcode_z,
                            nozzle_target: recoveryState.nozzle_target,
                            bed_target: recoveryState.bed_target,                            
                            fanSpeed:
                                recoveryState.fan_speed,
                            gcodeSpeed:
                                recoveryState.gcode_speed,
                            speedFactor:
                                recoveryState.speed_factor,
                            extrudeFactor:
                                recoveryState.extrude_factor,
                            absoluteCoordinates:
                                recoveryState.absolute_coordinates,
                            absoluteExtrude:
                                recoveryState.absolute_extrude,                                
                           
                            originalGcodeBytes:
                                analyzer.job.gcodeBytes,
                            originalGcode:
                                analyzer.job.gcodeText
                        });
                        
                        console.log(
                            "GRE loaded saved shutdown recovery:",
                            recoveryBuilder.recovery
                        );

                        const recoveryStatus =
                            document.getElementById("recoveryStatus");

                        if (recoveryStatus && recoveryState.recoverable) {

                            const recoveryPercent =
                                Math.round((recoveryState.progress || 0) * 100);

                            recoveryStatus.innerHTML =
                                "<strong>POWER-LOSS RECOVERY</strong><br>" +
                                "Status: Recovery available<br><br>" +
                                "File: " + recoveryState.filename + "<br>" +
                                "Stopped at: " +
                                recoveryPercent + "% — Layer " +
                                analyzer.job.recovery.recommendedLayer +
                                " of " + analyzer.job.recovery.originalTotalLayers + "<br>" +
                                "Z Height: " + recoveryState.gcode_z + " mm";

                            const recoveryButtons =
                                document.getElementById("recoveryButtons");

                            if (recoveryButtons) {
                                recoveryButtons.style.display = "flex";
                            }
                        }

                    })

                    .catch((error) => {
                        
                        console.error(
                            "GRE could not load saved recovery G-code:",
                            error
                        );

                    });

                }

            })
            .catch((error) => {

                console.error(
                    "Guardian could not load recovery state:",
                    error
                );

                recoveryStateLoaded = false;

            });

            }

            break;

            case "error":

            guardianBox.innerHTML =
                '<div class="value">🔴 PRINTER ERROR</div>';
            break;

        default:

            guardianBox.innerHTML =
                '<div class="value">🟡 WAITING FOR PRINTER</div>';

    }

}

// ---------- Status ----------

const statusBox = document.getElementById("status");

if (statusBox && printer.print_stats.state) {

    const state =
        printer.print_stats.state.toLowerCase();

    statusBox.className = "box status-box";

    switch (state) {

        case "standby":
        case "ready":

            statusBox.classList.add("standby");
            statusBox.innerHTML = "🔵 STANDBY";
            break;

        case "printing": 
            
            statusBox.classList.add("printing");
            statusBox.innerHTML = "🟢 PRINTING";
            break;

        case "complete":

            statusBox.classList.add("complete");
            statusBox.innerHTML = "🟢 COMPLETE";
            break;

        case "paused":

            statusBox.classList.add("paused");
            statusBox.innerHTML = "🟡 PAUSED";
            break;

        case "cancelled":

            statusBox.classList.add("error");
            statusBox.innerHTML = "🔴 CANCELLED";
            break;

        case "error":

            statusBox.classList.add("error");
            statusBox.innerHTML = "🔴 ERROR";
            break;

        default:

            statusBox.innerHTML =
                state.toUpperCase();

    }

}

// ---------- File Name ----------

const filenameBox =
    document.getElementById("filename");

const currentState =
    (printer.print_stats.state || "").toLowerCase();

if (filenameBox) {

    if (currentState !== "standby") {

        filenameBox.innerText =
            printer.print_stats.filename || "";

    }
    else {

        filenameBox.innerText =
            "No active print";

    }

}

// ---------- Progress ----------

let progress = null;

if (
    gcodeEndByte > gcodeStartByte &&
    printer.virtual_sdcard.file_position !== undefined
) {

    const printableBytes =
        gcodeEndByte - gcodeStartByte;

    const printedBytes =
        printer.virtual_sdcard.file_position -
        gcodeStartByte;

    progress =
        printedBytes / printableBytes;

    // Keep progress between 0% and 100%
    progress = Math.max(
        0,
        Math.min(1, progress)
    );

}
else if (
    printer.virtual_sdcard.progress !== undefined
) {

    // Temporary fallback until metadata is loaded
    progress =
        printer.virtual_sdcard.progress;

}

if (progress !== null) {

    const percent =
        Math.round(progress * 100);

    const progressBox =
        document.getElementById("progress");

    if (progressBox) {

        progressBox.innerText =
            percent + "%";

    }

    const bar =
        document.querySelector(".progress-fill");

    if (bar) {

        bar.style.width =
            percent + "%";

    }

}


// ---------- Layer ----------

const layerBox = document.getElementById("layer");

if (layerBox) {

    if (
        (
            currentState === "printing" ||
            currentState === "paused"
        ) &&
        analyzer.job.totalLayers > 0
    ) {

        layerBox.innerText =
            analyzer.job.currentLayer +
            " / " +
            analyzer.job.totalLayers;

    }
    else {

        layerBox.innerText = "-- / --";

    }

}

// ---------- Position ----------

if (printer.toolhead.position) {

    const xBox = document.getElementById("xpos");
    const yBox = document.getElementById("ypos");
    const zBox = document.getElementById("zpos");

    if (xBox)
        xBox.innerText =
            printer.toolhead.position[0].toFixed(2);

    if (yBox)
        yBox.innerText =
            printer.toolhead.position[1].toFixed(2);

    if (zBox)
        zBox.innerText =
            printer.toolhead.position[2].toFixed(2);

}

// ---------- Nozzle ----------

const nozzleBox = document.getElementById("nozzle");

if (
    nozzleBox &&
    printer.extruder.temperature !== undefined
) {

    let nozzleText =
        printer.extruder.temperature.toFixed(1) + "°";

    if (
        printer.extruder.target !== undefined &&
        printer.extruder.target > 0
    ) {

        nozzleText +=
            " / " +
            printer.extruder.target.toFixed(1) + "°";

    }

    nozzleBox.innerText = nozzleText;

}

// ---------- Bed ----------

const bedBox = document.getElementById("bed");

if (
    bedBox &&
    printer.heater_bed.temperature !== undefined
) {

    let bedText =
        printer.heater_bed.temperature.toFixed(1) + "°";

    if (
        printer.heater_bed.target !== undefined &&
        printer.heater_bed.target > 0
    ) {

        bedText +=
            " / " +
            printer.heater_bed.target.toFixed(1) + "°";

    }

    bedBox.innerText = bedText;

}

}

// --------------------------------------------------
// Guardian Report - Expand / Collapse
// --------------------------------------------------

const guardianReportToggle =
    document.getElementById("guardianReportToggle");

const guardianReportContent =
    document.getElementById("guardianReportContent");

if (guardianReportToggle && guardianReportContent) {

    guardianReportToggle.addEventListener("click", function () {

        const isOpen =
            guardianReportContent.classList.toggle("open");

        guardianReportToggle.textContent =
            isOpen ? "▾" : "▸";

    });

}

// ----------------------------------------------------
// Guardian Report - Generate Report
// ----------------------------------------------------

const generateReportButton =
    document.getElementById("generateReportButton");

if (generateReportButton && guardianReportContent) {

    generateReportButton.addEventListener(
        "click",
        function () {

            const job = analyzer.job;
            const recovery = job.recovery || {};

            const filename =
                job.filename || "Unknown";

            const filamentTypes =
                job.filamentTypes || [];

            const uniqueMaterials =
                [...new Set(filamentTypes)];

            const material =
                uniqueMaterials.length > 0
                ? uniqueMaterials.join(", ")
                : "Unknown";

                const estimatedPrintTime =
                    job.estimatedPrintTime || "Unknown";

            const totalFilamentGrams =
                Number(job.totalFilamentGrams || 0);

            const totalFilamentCost =
                Number(job.totalFilamentCost || 0);

            const estimatedTimeText =
                String(estimatedPrintTime);

            const daysMatch =
                estimatedTimeText.match(/(\d+)\s*d/i);

            const hoursMatch =
                estimatedTimeText.match(/(\d+)\s*h/i);

            const minutesMatch =
                estimatedTimeText.match(/(\d+)\s*m/i);

            const secondsMatch =
                estimatedTimeText.match(/(\d+)\s*s/i);

            const estimatedPrintSeconds =
                (daysMatch ? Number(daysMatch[1]) * 86400 : 0) +
                (hoursMatch ? Number(hoursMatch[1]) * 3600 : 0) +
                (minutesMatch ? Number(minutesMatch[1]) * 60 : 0) +
                (secondsMatch ? Number(secondsMatch[1]) : 0);

            const elapsedPrintSeconds =
                Number(savedRecoveryPrintDuration || 0);

            const elapsedHours =
                Math.floor(elapsedPrintSeconds / 3600);

            const elapsedMinutes =
                Math.floor((elapsedPrintSeconds % 3600) / 60);

            const elapsedSeconds =
                Math.floor(elapsedPrintSeconds % 60);

            const elapsedPrintTime =
                elapsedHours > 0
                    ? elapsedHours + "h " +
                      elapsedMinutes + "m " +
                      elapsedSeconds + "s"
                    : elapsedMinutes > 0
                        ? elapsedMinutes + "m " +
                        elapsedSeconds + "s"
                      : elapsedSeconds + "s";

            const progressPercent =
                Math.round((job.progress || 0) * 100);

            const currentLayer =
                recovery.recommendedLayer ||
                job.currentLayer ||
                0;

            const totalLayers =
                recovery.originalTotalLayers ||
                job.totalLayers ||
                0;

            const savedModelZ =
                Number(
                    recovery.recoveryZ ||
                    job.currentZ ||
                    0
                );

            const physicalZ =
                Number(
                    recoveryBuilder.recovery?.recoveryZ ||
                    savedModelZ
                );

            let recommendation = "";
            let reason = "";

            const normalizedMaterial =
                material.toUpperCase();

            const flexibleMaterial =
                normalizedMaterial.includes("TPU") ||
                normalizedMaterial.includes("TPE");

            const directRecoveryPossible =
                recovery.assessment === "POSSIBLE" &&
                currentLayer > 0 &&
                savedModelZ > 0;

            const progressFraction =
                Math.max(
                    0,
                    Math.min(progressPercent / 100, 1)
                );

            const approximateUsedGrams =
                totalFilamentGrams * progressFraction;

            const approximateUsedCost =
                totalFilamentCost * progressFraction;

            let investmentScore = 0;

            // Actual printing time already invested
            if (elapsedPrintSeconds >= 7200) {

                investmentScore += 4;

            } else if (elapsedPrintSeconds >= 1800) {

                investmentScore += 3;

            } else if (elapsedPrintSeconds >= 600) {

                investmentScore += 2;

            } else if (elapsedPrintSeconds >= 300) {

                investmentScore += 1;

            }

            // How much of the job is already completed
            if (progressPercent >= 75) {

                investmentScore += 3;

            } else if (progressPercent >= 40) {

                investmentScore += 2;

            } else if (progressPercent >= 20) {

                investmentScore += 1;

            }

            // Approximate filament already committed to the part
            if (approximateUsedGrams >= 100) {

                investmentScore += 3;

            } else if (approximateUsedGrams >= 25) {

                investmentScore += 2;

            } else if (approximateUsedGrams >= 10) {

                investmentScore += 1;

            }

            // Approximate material cost already committed
            if (approximateUsedCost >= 5) {

                investmentScore += 2;

            } else if (approximateUsedCost >= 1) {

                investmentScore += 1;

            }

            // Long jobs get additional consideration,
            // but only after a meaningful portion is completed.
            if (
                estimatedPrintSeconds >= 7200 &&
                progressPercent >= 20
            ) {

                investmentScore += 1;

            }

            const worthSaving =
                investmentScore >= 4;

            const sectionRepairPossible =
                worthSaving &&
                progressPercent >= 10 &&
                savedModelZ >= 1;

            if (flexibleMaterial) {

                if (sectionRepairPossible) {

                    recommendation =
                        "SECTION REPAIR RECOMMENDED";

                    reason =
                        "Guardian detected flexible material (" +
                        material +
                        "). Direct Guardian recovery is not recommended " +
                        "for flexible material. Enough printing time or " +
                        "material has already been invested to consider " +
                        "saving the existing part. A section repair near " +
                        savedModelZ.toFixed(2) +
                        " mm should be evaluated, but the operator must " +
                        "confirm that the joint can be bonded successfully " +
                        "and will tolerate the required flexibility.";

            } else {

                recommendation =
                    "RESTART RECOMMENDED";

                reason =
                    "Guardian detected flexible material (" +
                    material +
                    "). Direct Guardian recovery is not recommended, " +
                    "and the amount of completed work does not make " +
                    "section repair worthwhile. Restarting the print " +
                    "is the more practical choice.";

            }

        } else if (
            directRecoveryPossible &&
            worthSaving
        ) {

            recommendation =
                "DIRECT RECOVERY RECOMMENDED";

            reason =
                "Guardian has valid recovery position information, " +
                "and enough printing time, progress, or material has " +
                "already been invested to make saving the existing " +
                "print worthwhile. Direct Guardian recovery should " +
                "be considered first.";

        } else if (
            !directRecoveryPossible &&
            sectionRepairPossible
        ) {

            recommendation =
                "SECTION REPAIR RECOMMENDED";

            reason =
                "A meaningful amount of work has already been invested, " +
                "but Guardian does not consider direct recovery reliable. " +
                "The stopped model height is known, so slicing the " +
                "remaining model near " +
                savedModelZ.toFixed(2) +
                " mm and joining the new section to the existing part " +
                "should be considered.";

        } else {

            recommendation =
                "RESTART RECOMMENDED";

            reason =
                "Although recovery information may be available, the " +
                "amount of printing time, progress, and material already " +
                "invested does not justify the added risk and effort of " +
                "recovery. Restarting the complete print is the more " +
                "practical choice.";

        }

    const reportLines = [
        "",
        "PRINTER GUARDIAN REPORT",
        "==============================================",
        "",

        "GUARDIAN ASSESSMENT",
        recommendation,
        "",

        "WHY",
        reason,
        "",

        "AVAILABLE OPTIONS",
        "1. Direct Guardian recovery",
        "2. Slice the remaining model at approximately " +
            savedModelZ.toFixed(2) +
            " mm and join the new section",
        "3. Restart the complete print",
        "",

        "FINAL DECISION",
        "Guardian provides a recommendation based on the " +
            "saved data. Inspect the actual printed part " +
            "before choosing the recovery method.",
        "",

        "FILE",
        "Original File: " + filename,
        "Material: " + material,
        "Estimated Print Time: " + estimatedPrintTime,
        "Elapsed Print Time: " + elapsedPrintTime,
        "Total Filament: " + totalFilamentGrams.toFixed(2) + " g",
        "Total Filament Cost: $" + totalFilamentCost.toFixed(2),
        "",

        "PRINT POSITION",
        "Progress: " + progressPercent + "%",
        "Layer: " +
            (currentLayer || "--") +
            " of " +
            (totalLayers || "--"),
        "Saved Model / G-code Z: " +
            savedModelZ.toFixed(2) +
            " mm",
        "Saved Physical Z: " +
            physicalZ.toFixed(2) +
            " mm",
        "",

        "=============================================="
    ];

            let reportOutput =
                document.getElementById(
                    "guardianReportOutput"
                );

            if (!reportOutput) {

                reportOutput =
                    document.createElement("div");

                reportOutput.id =
                    "guardianReportOutput";

                reportOutput.style.whiteSpace =
                    "pre-wrap";

                reportOutput.style.marginTop =
                    "12px";

                reportOutput.style.padding =
                    "12px";

                reportOutput.style.textAlign =
                    "left";

                guardianReportContent.appendChild(
                    reportOutput
                );

            }

            reportOutput.textContent =
                reportLines.join("\n");

        }
    );
}

// ----------------------------------------------------
// Guardian Report - Print Report
// ----------------------------------------------------

const printReportButton =
    document.getElementById("printReportButton");

if (printReportButton) {

    printReportButton.addEventListener(
        "click",
        function () {

            const reportOutput =
                document.getElementById(
                    "guardianReportOutput"
                );

            if (!reportOutput) {
                alert(
                    "Generate the Guardian Report before printing."
                );
                return;
            }

            const printWindow =
                window.open("", "_blank", "width=900,height=700");

            printWindow.document.write(`
                <html>
                <head>
                    <title>Printer Guardian Report</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            margin: 0.5in;
                            color: black;
                            background: white;
                        }

                        pre {
                            white-space: pre-wrap;
                            font-family: Arial, sans-serif;
                            font-size: 14px;
                            line-height: 1.4;
                            margin: 0;
                        }

                        @page {
                            size: letter;
                            margin: 0.5in;
                        }
                    </style>
                </head>

                <body>
                    <pre>${reportOutput.textContent}</pre>
                </body>
                </html>
            `);

            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
            printWindow.close();
        }
    );
}