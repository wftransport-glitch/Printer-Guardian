# Printer Guardian

Printer Guardian is a power-loss recovery, monitoring, and recovery assessment system for Klipper/Moonraker 3D printers.

It continuously tracks an active print and preserves recovery information so that, after an unexpected power loss or shutdown, the user can assess the saved state and prepare a recovery G-code file to resume the unfinished print.

## Version 1.0

Printer Guardian v1.0 has been real-world tested on an Ender 5 Max running Klipper, Moonraker, and Mainsail.

A complete power-loss recovery test was successfully performed: the printer was interrupted during an active print, the saved recovery state survived the interruption, Printer Guardian detected the unfinished print after restart, generated the recovery G-code, and the printer resumed and successfully completed the part.

## Features

- Live printer and Guardian status
- Current filename and print progress
- Layer tracking
- X, Y, and Z position monitoring
- Nozzle and bed temperature monitoring
- Persistent recovery-state recording
- Recovery detection after interruption or power loss
- Saved filename, progress, layer, and Z-height information
- Recovery G-code generation
- Prepare Recovery and Discard Recovery controls
- Recovery assessment and reporting
- Klipper/Moonraker integration

## Included Files

- `index.html` — Printer Guardian dashboard
- `guardian.css` — Dashboard styling
- `guardian.js` — Main Guardian monitoring and user-interface logic
- `analyzer.js` — G-code analysis and recovery-position processing
- `recovery_builder.js` — Builds the recovery G-code
- `recovery_state.py` — Records and preserves the printer recovery state

Runtime files such as `recovery_state.json` and `recovery_state.tmp` are generated automatically and are not included in the repository.

## Requirements

Printer Guardian is intended for a Klipper-based printer using:

- Klipper
- Moonraker
- Mainsail or a similar web interface
- Python 3
- A computer or Linux host running alongside the printer

The current version assumes Moonraker is available on port `7125`. The Python recovery-state recorder is designed to run on the same host as Moonraker.

## Installation

1. Place the Printer Guardian web files together in a directory accessible by the computer running the Guardian dashboard.
2. Keep `recovery_state.py` in the Guardian directory. It stores its generated recovery-state files in the same directory as the script.
3. Run `recovery_state.py` continuously while the printer is operating so that current recovery information is preserved.
4. Open `index.html` through the web server used for Printer Guardian.
5. Verify that Guardian connects to Moonraker and displays live printer information before relying on recovery.

Automatic startup of `recovery_state.py` can be configured using the service/startup method appropriate for the Linux host.

## Recovery Workflow

When Printer Guardian detects a saved unfinished print after a restart, it displays a **RECOVERY AVAILABLE** section containing the saved print information.

The user can review that information before choosing **PREPARE RECOVERY**.

Printer Guardian then uses the saved state and original G-code to build a recovery G-code file containing the remaining portion of the interrupted print.

The generated recovery file can then be loaded and started through Mainsail.

## Important Safety Warning

**Recovery motion is printer-specific. Review and test the recovery procedure carefully before using Printer Guardian on a printer other than the configuration on which it was developed.**

Version 1.0 was developed and tested on an Ender 5 Max. The recovery builder contains motion and setup behavior including X/Y homing, Z positioning, saved-position restoration, and loading a bed-mesh profile named `default`.

Those commands may require modification for another printer, homing arrangement, probe configuration, bed mesh, or machine geometry.

An incorrect recovery move can cause the printhead, nozzle, bed, or printed part to collide.

Always supervise a recovery attempt and be prepared to stop the printer.

No power-loss recovery system can guarantee that every interrupted print can be safely or successfully resumed.

## Project Status

Version 1.0 is the first public release of Printer Guardian.

The current source represents the version that successfully completed a real-world recovery test. Future versions may expand hardware compatibility, configuration options, reporting, and recovery safeguards.

## License

Printer Guardian is released under the MIT License.

You may use, modify, distribute, and build upon the software under the terms of that license.

This software is provided without warranty. Use of Printer Guardian and any recovery procedure is at the user's own risk.
