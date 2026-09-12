// ======================================================
// Guardian Recovery Engine (GRE)
// Recovery G-code Builder
// Version 1.0
// ======================================================

class RecoveryBuilder {

    constructor() {

        this.reset();

    }

    reset() {

        this.recovery = {
            filename: "",
            recoveryLayer: 0,
            recoveryFilePosition: 0,
            recoveryZ: 0.0,
            recoveryX: 0.0,
            recoveryY: 0.0,
            gcodeX: 0.0,
            gcodeY: 0.0,
            gcodeZ: 0.0,
            activeTool: "",
            nozzleTarget: 0,
            bedTarget: 0,
            fanSpeed: 0,
            gcodeSpeed: 0,
            speedFactor: 1.0,
            extrudeFactor: 1.0,
            absoluteCoordinates: true,
            absoluteExtrude: false,
            originalGcodeBytes: new Uint8Array(),
            originalGcode: "",
            recoveryGcode: ""
        };

    }

    loadRecoveryData(data) {

        this.recovery.filename =
            data.filename || "";

        this.recovery.recoveryLayer =
            data.recoveryLayer || 0;

        this.recovery.recoveryFilePosition =
            data.file_position ?? data.recoveryFilePosition ?? 0;

        this.recovery.recoveryZ =
            data.z ?? data.recoveryZ ?? 0.0;

        this.recovery.recoveryX =
            data.x ?? data.recoveryX ?? 0.0;

        this.recovery.recoveryY =
            data.y ?? data.recoveryY ?? 0.0;

        this.recovery.gcodeX =
            data.gcode_x ?? data.gcodeX ?? 0.0;

        this.recovery.gcodeY =
            data.gcode_y ?? data.gcodeY ?? 0.0;

        this.recovery.gcodeZ =
                    data.gcode_z ?? data.gcodeZ ?? 0.0;
            
        this.recovery.activeTool =
            data.activeTool || "";

        this.recovery.nozzleTarget =
            data.nozzle_target ?? data.nozzleTarget ?? 0;

        this.recovery.bedTarget =
            data.bed_target ?? data.bedTarget ?? 0;

        this.recovery.fanSpeed =
            data.fanSpeed || 0;

        this.recovery.gcodeSpeed =
            data.gcode_speed ?? data.gcodeSpeed ?? 0;

        this.recovery.speedFactor =
            data.speedFactor || 1.0;

        this.recovery.extrudeFactor =
            data.extrudeFactor || 1.0;

        this.recovery.absoluteCoordinates =
            data.absoluteCoordinates ?? true;

        this.recovery.absoluteExtrude =
            data.absoluteExtrude ?? false;

         this.recovery.originalGcodeBytes =
            data.originalGcodeBytes || new Uint8Array();   

        this.recovery.originalGcode =
            data.originalGcode || "";

    }
    
findSafeResumePosition() {

    const position =
        this.recovery.recoveryFilePosition;

    const gcodeBytes =
        this.recovery.originalGcodeBytes;

    if (position <= 0) {
        return 0;
    }

    if (position >= gcodeBytes.length) {
        return gcodeBytes.length;
    }

    if (gcodeBytes[position - 1] === 10) {
        return position;
    }

    for (
        let index = position;
        index < gcodeBytes.length;
        index++
    ) {

        if (gcodeBytes[index] === 10) {
            return index + 1;
        }

    }

    return gcodeBytes.length;

}

    buildRecoveryHeader() {

        const header = [
            "; ======================================================",
            "; GUARDIAN RECOVERY G-CODE",
            "; ======================================================",
            `; Original File: ${this.recovery.filename}`,
            `; Recovery Layer: ${this.recovery.recoveryLayer}`,
            `; Recovery Z: ${this.recovery.recoveryZ}`,
            `; Active Tool: ${this.recovery.activeTool}`,
            `; Saved G-code Feedrate: ${this.recovery.gcodeSpeed} mm/min`,
            "; ======================================================",
            "",
            `M140 S${this.recovery.bedTarget}`,
            `M104 S${this.recovery.nozzleTarget}`,
            `M190 S${this.recovery.bedTarget}`,
            `M109 S${this.recovery.nozzleTarget}`,
            `SET_KINEMATIC_POSITION Z=${this.recovery.recoveryZ} SET_HOMED=Z`,
            "G91",
            "G1 Z10 F300",
            "G90",
            "G28 Y",
            "G28 X",
            "BED_MESH_PROFILE LOAD=default",
            `G1 X${this.recovery.gcodeX} Y${this.recovery.gcodeY} F6000`,
            `G1 Z${this.recovery.gcodeZ} F300`,
            `${this.recovery.activeTool}`,
            `M106 S${Math.round(this.recovery.fanSpeed * 255)}`,
            `M220 S${Math.max(1, Math.round(this.recovery.speedFactor * 50))}`,
            `M221 S${Math.round(this.recovery.extrudeFactor * 100)}`,
            this.recovery.absoluteCoordinates ? "G90" : "G91",
            this.recovery.absoluteExtrude ? "M82" : "M83",
            `G1 F${this.recovery.gcodeSpeed}`,
            ""
        ];

        this.recovery.recoveryGcode =
            header.join("\n");

        const safeResumePosition =
             this.findSafeResumePosition();

        const remainingBytes =
            this.recovery.originalGcodeBytes.slice(
                safeResumePosition
            );

        let remainingGcode =
            new TextDecoder("utf-8").decode(
                remainingBytes
            );

        const savedSpeedPercent =
            Math.round(this.recovery.speedFactor * 100);

        const nextLayerMarker = ";LAYER_CHANGE";
        const nextLayerIndex =
            remainingGcode.indexOf(nextLayerMarker);

        if (nextLayerIndex !== -1) {

        const layerChangeLineEnd =
            remainingGcode.indexOf("\n", nextLayerIndex);

        if (layerChangeLineEnd !== -1) {

            const zLineEnd =
                remainingGcode.indexOf("\n", layerChangeLineEnd + 1);

            if (zLineEnd !== -1) {

                remainingGcode =
                    remainingGcode.slice(0, zLineEnd + 1) +
                    `M220 S${savedSpeedPercent}\n` +
                    remainingGcode.slice(zLineEnd + 1);

            }

        }

        }

        this.recovery.recoveryGcode +=
            "\n" + remainingGcode;

        return this.recovery.recoveryGcode;

    }

}

const recoveryBuilder = new RecoveryBuilder();