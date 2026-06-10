# EduResource-Agent Modifications

This directory contains a modified copy of OpenMAIC, imported into EduResource-Agent as the interactive classroom and rich media resource subsystem.

Original upstream:
- Project: THU-MAIC/OpenMAIC
- Source: https://github.com/THU-MAIC/OpenMAIC
- Imported commit: 2586cb5e05671ebe06f18a06cdc80dc2c74f707f
- License: AGPL-3.0, preserved in `LICENSE`

EduResource-Agent modification notice:
- Date: 2026-06-04
- Modified by: EduResource-Agent integration work
- Scope: Added EduResource context handling, classroom prompt adaptation, Stage/Scene mapping, FastAPI writeback client, and generation job writeback wiring.

The OpenMAIC-derived subsystem in this directory remains under AGPL-3.0. EduResource-Agent keeps it isolated under `apps/interactive-classroom/` so the interactive classroom subsystem can be maintained, audited, and updated separately from the core FastAPI backend and the existing student/teacher frontend.
