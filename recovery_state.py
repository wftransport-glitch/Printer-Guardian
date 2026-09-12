#!/usr/bin/env python3

"""
Printer Guardian Precise Recovery State Recorder v1

Continuously saves the current printer state for
power-loss recovery without modifying Guardian v2.1.
"""

import json
import os
import time
from datetime import datetime
from urllib.request import urlopen, Request


MOONRAKER_URL = (
    "http://localhost:7125/printer/objects/query?"
    "toolhead&virtual_sdcard&heater_bed&extruder&print_stats"
    "&fan&gcode_move"
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE_DIR, "recovery_state.json")
TEMP_FILE = os.path.join(BASE_DIR, "recovery_state.tmp")

POLL_INTERVAL = 2


def fetch_status():
    with urlopen(MOONRAKER_URL, timeout=3) as response:
        data = json.load(response)

    return data["result"]["status"]


def save_state(state):
    with open(TEMP_FILE, "w") as file:
        json.dump(state, file, indent=2)
        file.flush()
        os.fsync(file.fileno())

    os.replace(TEMP_FILE, STATE_FILE)

def check_discard_request():
    try:
        with urlopen(
            "http://localhost:7125/server/database/item?"
            "namespace=guardian&key=discard_recovery",
            timeout=3
        ) as response:
            data = json.load(response)

        discard_requested = (
            data.get("result", {})
                .get("value", False)
        )

        if discard_requested:
            if os.path.exists(STATE_FILE):
                os.remove(STATE_FILE)

            clear_request = Request(
                "http://localhost:7125/server/database/item?"
                "namespace=guardian&key=discard_recovery",
                method="DELETE"
            )

            with urlopen(clear_request, timeout=3):
                pass

            print("Guardian recovery discarded.")

    except Exception:
        pass

last_gcode_speed = 0.0

while True:
    try:
        check_discard_request()

        data = fetch_status()

        print_stats = data.get("print_stats", {})
        virtual_sdcard = data.get("virtual_sdcard", {})
        toolhead = data.get("toolhead", {})
        extruder = data.get("extruder", {})
        fan = data.get("fan", {})
        gcode_move = data.get("gcode_move", {})
        current_gcode_speed = gcode_move.get("speed", 0)

        if current_gcode_speed > 0:
            last_gcode_speed = current_gcode_speed

        heater_bed = data.get("heater_bed", {})

        printer_state = print_stats.get("state", "")
        filename = print_stats.get("filename", "")

        is_guardian_recovery = filename.startswith("GUARDIAN_RECOVERY_")

        position = toolhead.get("position", [0, 0, 0, 0])
        gcode_position = gcode_move.get("gcode_position", [0, 0, 0, 0])

        recovery_state = {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "state": printer_state,
            "filename": filename,
            "file_position": virtual_sdcard.get("file_position", 0),
            "file_size": virtual_sdcard.get("file_size", 0),
            "progress": virtual_sdcard.get("progress", 0),
            "print_duration": print_stats.get("print_duration", 0),
            "x": position[0] if len(position) > 0 else 0,
            "y": position[1] if len(position) > 1 else 0,
            "z": position[2] if len(position) > 2 else 0,
            "gcode_x": gcode_position[0] if len(gcode_position) > 0 else 0,
            "gcode_y": gcode_position[1] if len(gcode_position) > 1 else 0,
            "gcode_z": gcode_position[2] if len(gcode_position) > 2 else 0,
            "nozzle_temperature": extruder.get("temperature", 0),
            "nozzle_target": extruder.get("target", 0),
            "bed_temperature": heater_bed.get("temperature", 0),
            "bed_target": heater_bed.get("target", 0),
            "fan_speed": fan.get("speed", 0),
            "gcode_speed": last_gcode_speed,
            "speed_factor": gcode_move.get("speed_factor", 1.0),
            "extrude_factor": gcode_move.get("extrude_factor", 1.0),
            "absolute_coordinates": gcode_move.get("absolute_coordinates", True),
            "absolute_extrude": gcode_move.get("absolute_extrude", False),
            "recoverable": printer_state in ("printing", "paused") and not is_guardian_recovery,
        }

        if recovery_state["recoverable"]:
            save_state(recovery_state)

    except Exception as error:
        print("Recovery state recorder error:", error)

    time.sleep(POLL_INTERVAL)