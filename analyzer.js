// ======================================================
// Guardian Recovery Engine (GRE)
// Print Analysis Engine
// Version 1.0
// ======================================================

class PrintAnalyzer {

    constructor() {

        this.reset();

    }

    reset() {

        this.job = {

            filename: "",

            gcodeText: "",

            gcodeBytes: new Uint8Array(),

            gcodeHash: "",

            filamentTypes: [],

            estimatedPrintTime: "",

            totalFilamentGrams: 0,

            totalFilamentCost: 0,

            layerMap: [],

            toolMap: [],

            totalLayers: 0,

            currentLayer: 0,

            currentZ: 0.0,

            filePosition: 0,

            fileSize: 0,

            progress: 0,

            state: "",

            statistics: {},

            recovery: {
                assessment: "",
                reason: "",
                interruptedLayer: 0,
                recommendedLayer: 0,
                recoveryZ: 0.0,
                activeTool: "",
                startProgress: 0,
                startLayer: 0,
                originalTotalLayers: 0,
                gcodeVerified: false
}

        };

    }

    async loadPrint(filename) {

        this.reset();

        this.job.filename = filename;

        const response = await fetch(
            "/server/files/gcodes/" +
            encodeURIComponent(filename)
        );

        if (!response.ok)
            throw new Error("Unable to load G-code.");

        const gcodeBuffer =
            await response.arrayBuffer();

        const gcodeBytes =
            new Uint8Array(gcodeBuffer);

        const gcode =
            new TextDecoder("utf-8").decode(gcodeBytes);

        this.job.gcodeBytes = gcodeBytes;
        this.job.gcodeText = gcode;

        this.job.gcodeHash = gcode.length.toString();

        this.parseLayerMap(gcode);

    }
    async loadRecoveryState() {

        const response = await fetch(
            "recovery_state.json?ts=" + Date.now(),
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                "Unable to load saved recovery state."
            );
        }

        const recoveryState =
            await response.json();

        console.log(
            "GRE Saved Recovery State:",
            recoveryState
        );

        return recoveryState;

    }

parseLayerMap(gcode) {

    const lines = gcode.split("\n");

    this.job.layerMap = [];
    this.job.toolMap = [];

    let layer = 0;
    let lastZ = null;
    let filePosition = 0;

    for (let i = 0; i < lines.length; i++) {

        const rawLine = lines[i];
        const line = rawLine.trim();

        const filamentMatch =
            line.match(/^;\s*filament_type\s*=\s*(.+)$/i);

        if (filamentMatch) {

            this.job.filamentTypes =
                filamentMatch[1]
                    .split(";")
                    .map(type => type.trim())
                    .filter(type => type.length > 0);

        }

        const printTimeMatch =
            line.match(
                /^;\s*estimated printing time \(normal mode\)\s*=\s*(.+)$/i
            );

        if (printTimeMatch) {
            this.job.estimatedPrintTime =
                printTimeMatch[1].trim();
        }

        const filamentGramsMatch =
            line.match(
                /^;\s*total filament used \[g\]\s*=\s*([0-9.]+)$/i
            );

        if (filamentGramsMatch) {
            this.job.totalFilamentGrams =
                parseFloat(filamentGramsMatch[1]);
        }

        const filamentCostMatch =
            line.match(
                /^;\s*total filament cost\s*=\s*([0-9.]+)$/i
            );

        if (filamentCostMatch) {
            this.job.totalFilamentCost =
                parseFloat(filamentCostMatch[1]);
        }

        const toolMatch = line.match(/^T([0-7])$/);

        if (toolMatch) {

            this.job.toolMap.push({
                tool: "T" + toolMatch[1],
                line: i,
                filePosition: filePosition
            });

        }

        if (line === ";LAYER_CHANGE") {

            let z = null;

            if (
                i + 1 < lines.length &&
                lines[i + 1].trim().startsWith(";Z:")
            ) {

                z = parseFloat(
                    lines[i + 1].trim().substring(3)
                );

            }

            // Ignore duplicate layer markers
            // that point to the same physical Z height.
            if (
                z !== null &&
                !Number.isNaN(z) &&
                z !== lastZ
            ) {

                layer++;

                this.job.layerMap.push({

                    layer: layer,
                    z: z,
                    line: i,
                    filePosition: filePosition

                });

                lastZ = z;

            }

        }

        // +1 accounts for the newline removed by split("\n")
        filePosition +=
            new TextEncoder().encode(rawLine + "\n").length;

    }

    this.job.totalLayers =
        this.job.layerMap.length;

    console.log("GRE Layer Map");
    console.log(this.job.layerMap);
    console.log(
        "Total Layers:",
        this.job.totalLayers

    );
    console.log(
        "G-code Fingerprint:",
        this.job.gcodeHash
    );
    console.log("----------------------");

}

updatePrinterState(printer) {

    this.job.state =
        printer.print_stats.state || "";

    const liveProgress =
    printer.virtual_sdcard.progress || 0;

    if (this.job.filename.startsWith("GUARDIAN_RECOVERY_")) {

        this.job.progress =
            this.job.recovery.startProgress +
            liveProgress *
            (1 - this.job.recovery.startProgress);

    } else {

        this.job.progress =
            liveProgress;

    }

    this.job.filePosition =
        printer.virtual_sdcard.file_position || 0;

    this.job.fileSize =
        printer.virtual_sdcard.file_size || 0;

    if (printer.toolhead.position) {

        this.job.currentZ =
            printer.toolhead.position[2];

    }

    // Determine current layer from Moonraker's
    // actual position in the G-code file.
    let liveLayer = 0;

    for (const layer of this.job.layerMap) {

        if (
            this.job.filePosition >=
            layer.filePosition
        ) {

            liveLayer =
                layer.layer;

        } else {

            break;

        }

    }

if (this.job.filename.startsWith("GUARDIAN_RECOVERY_")) {

    let recoveryLayerAdvance = 0;

    if (
        this.job.layerMap.length > 0 &&
        this.job.filePosition >=
            this.job.layerMap[0].filePosition
    ) {

        recoveryLayerAdvance =
            liveLayer + 1;

    }

    this.job.currentLayer =
        Math.min(
            this.job.recovery.startLayer +
                recoveryLayerAdvance,
            this.job.totalLayers
        );

}

else {

    this.job.currentLayer =
        liveLayer;

}

    this.analyzeRecovery();

}

applyRecoveryState(recoveryState) {

    this.job.state =
        recoveryState.state || "";

    this.job.filePosition =
        recoveryState.file_position || 0;

    this.job.fileSize =
        recoveryState.file_size || 0;

    this.job.progress =
        recoveryState.progress || 0;

    this.job.recovery.startProgress =
        recoveryState.progress || 0;

    this.job.recovery.originalTotalLayers =
        this.job.totalLayers;

    this.job.currentZ =
        recoveryState.z || 0;

    this.job.currentLayer = 0;

    for (const layer of this.job.layerMap) {

        if (
            this.job.filePosition >=
            layer.filePosition
        ) {

            this.job.currentLayer =
                layer.layer;

        } else {

            break;

        }

    }

    this.job.recovery.startLayer =
        this.job.currentLayer;

    this.analyzeRecovery();

}

async loadSavedRecoveryState() {

    const response = await fetch(
        "recovery_state.json?ts=" + Date.now(),
        { cache: "no-store" }
    );

    if (!response.ok) {
        throw new Error(
            "Unable to load saved recovery state."
        );
    }

    const savedState =
        await response.json();

    if (
        !savedState.recoverable ||
        !savedState.filename
    ) {
        return null;
    }

    await this.loadPrint(
        savedState.filename
    );

    this.updatePrinterState({

        print_stats: {
            state:
                savedState.state || ""
        },

        virtual_sdcard: {
            progress:
                savedState.progress || 0,

            file_position:
                savedState.file_position || 0,

            file_size:
                savedState.file_size || 0
        },

        toolhead: {
            position: [
                savedState.x || 0,
                savedState.y || 0,
                savedState.z || 0,
                0
            ]
        }

    });

    return savedState;

}

analyzeRecovery() {

    this.job.recovery.interruptedLayer =
        this.job.currentLayer;
    
    this.job.recovery.activeTool = "";

    for (const toolChange of this.job.toolMap) {

        if (
            this.job.filePosition >=
            toolChange.filePosition
        ) {

            this.job.recovery.activeTool =
                toolChange.tool;

        } else {

            break;

        }

    }

    if (this.job.currentLayer > 1) {

        this.job.recovery.recommendedLayer =
            this.job.currentLayer;

        const recoveryLayer =
            this.job.layerMap.find(
                layer =>
                    layer.layer ===
                    this.job.recovery.recommendedLayer
            );

        if (recoveryLayer) {

            this.job.recovery.recoveryZ =
                recoveryLayer.z;

            this.job.recovery.recoveryFilePosition =
               recoveryLayer.filePosition;

        }

        this.job.recovery.assessment =
            "POSSIBLE";

        this.job.recovery.reason =
            "Valid layer information is available.";

    } else {

        this.job.recovery.recommendedLayer = 0;

        this.job.recovery.assessment =
            "NOT RECOMMENDED";

        this.job.recovery.reason =
            "Not enough completed layer information is available.";

    }

}

}
const analyzer = new PrintAnalyzer();
