---
core_id: 44a889a1-6eb6-40fd-9fb5-468f2adf44e0
project_name: comments points
chat_context: Web app to annotate any image with an SVG overlay (ellipses), responsive and image-agnostic
created_at: 2025-10-22T07:00:37+02:00
updated_at: 2025-10-22T12:00:00+02:00
version: 1.1
status: active
tags: [core, project, summary]
---

# Core Summary
- **One-liner:** Minimal, responsive web app to draw, label, move, resize, persist, and restore multiple ellipses over any image (local/URL) using an SVG overlay.
- **Current phase:** Drawing + normalized persistence + responsive UI + **menu-driven interactions (Move/Resize/Remove/Options)**.
- **Latest changes (2025-10-22):**
  - **Tiny menu (left-click/tap on shape):** Move, Resize, Remove, Options — with inline SVG icons; clamped to viewport; very high z-index.
  - **Move only via menu:** No accidental drags; pointer cursors reflect mode (grab/grabbing).
  - **Resize via menu:** Drag on ellipse (relative to center) **or** via **4 handles (N/E/S/W)**; Shift ⇒ circle; live preview.
  - **Distinct cursors:** outside = crosshair, on shape = pointer, move = grab/grabbing, resize = nwse/ns/ew where applicable.
  - **Right‑click deletion removed** (no contextmenu handler).
  - **Safer drawing:** New shapes start **only** on empty space (clicks on shapes/handles are ignored for drawing).
  - **Unified Pointer Events:** mouse/touch/pen in one path; setPointerCapture; long‑press delete kept as optional mobile fallback.
  - **Image load robustness:** local/URL/drag‑drop; mixed‑content guard; optional `crossOrigin="anonymous"` fallback; display‑only (no canvas taint issues).
  - **Normalized data unchanged:** shapes stored as `nx, ny, nrx, nry`; responsive repaint on resize/image load.

## Objectives
- Keep overlay **pixel-accurate and responsive** with image/container scaling.
- Store shapes as **normalized coordinates** (0..1) so they’re **image‑agnostic**.
- Deliver a **tap/click-first UX** with explicit modes to avoid accidental edits.
- Remain **vanilla HTML/CSS/JS**; zero external deps.

## Scope & Constraints
- **In-scope:**
  - Image loading: local file, URL, drag & drop.
  - Responsive image + SVG overlay; repaint on window resize & after image load.
  - Draw multiple ellipses (Shift ⇒ circle), **menu on shape** (Move/Resize/Remove/Options).
  - Live JSON view; Copy JSON; Import JSON (legacy auto-conversion).
  - URL sanitation, mixed-content guard, CORS fallback (display-only).
- **Out-of-scope (now):**
  - Diagonal resize handles (NE/NW/SE/SW) — planned.
  - Keyboard shortcuts, multi-select, z-ordering, undo/redo.
  - Server storage/auth; pan/zoom; export rasterized composites.
- **Constraints:**
  - Pure client-side; certain image hosts may block hotlinking/CORS.
  - Aspect ratio changes preserve relative geometry, not semantic alignment.

## Key Decisions
- **Arm-only modes:** Move/Resize are **opt-in via menu**; prevents unintended drags/resizes.
- **Cursor semantics:** Contextual cursors communicate possible actions per mode/target.
- **Handles for Resize:** 4 directional handles (N/E/S/W) for precise control; ellipse-body drag also resizes.
- **Normalized coordinates** (`nx, ny, nrx, nry`) are the ground truth (legacy import converted).
- **Menu UX:** Created dynamically; view‑clamped; click-outside to close; icons for scannability.

## Architecture & Interfaces
- **Modules:**
  - `index.html` — Toolbar, stage (`<img>` + absolute `<svg id="overlay">`), menu placeholder (created in JS), note popover, JSON panels.
  - `styles.css` — Design tokens, light/dark support, high-contrast menu, mode cursors, ellipse/handle styling.
  - `main.js` — Image loaders; draw logic; menu; **Move/Resize arm-only flows**; resize handles; JSON I/O; responsive repaint; pointer event handlers.
- **Data Model (normalized):**
  ```json
  {"id":"...","type":"ellipse","nx":0.52,"ny":0.41,"nrx":0.08,"nry":0.05,"note":"optional"}
  ```
  **Legacy (import only):**
  ```json
  {"id":"...","type":"ellipse","cx":120,"cy":80,"rx":40,"ry":25,"canvasW":800,"canvasH":600}
  ```

## UX Behaviors
### Drawing
- Begins with **left mouse down** on empty overlay space only.
- Shift while drawing → lock to circle.
- Prevented when pointer is over an existing ellipse or any resize handle.

### Menu (Left Click/Tap on Shape)
- Items: **Move**, **Resize**, **Remove**, **Options** (stub).
- Appears at pointer; clamped to viewport; closes on outside click.

### Move (Arm-only)
- Activated via menu (stores `shapeId`).
- Dragging the same shape moves its center (`nx, ny`).
- Disarms automatically on pointer up to avoid accidental subsequent moves.

### Resize (Arm-only)
- Activated via menu (stores `shapeId`).
- Two input paths:
  1) **Ellipse drag:** pointer distance from center controls `nrx/nry`.
  2) **Handles (N/E/S/W):** per-axis resize; N/S → `nry`, E/W → `nrx`.
- **Shift** while resizing → keep ellipse circular (`nrx == nry`).
- Handles stay visible while Resize is armed; disarm manually or after action per product choice (current: stays armed after handle drag; ellipse-drag disarms on pointer up).

### Remove
- Via menu. (On touch, **optional** long‑press delete remains as fallback; can be disabled.)

### Cursors
- Outside shapes: `crosshair` (suggests draw).
- On shape: `pointer`.
- Move armed: `grab` / while dragging `grabbing`.
- Resize armed: `nwse-resize`; handles use `ns-resize` (N/S) and `ew-resize` (E/W).

## Rendering & Normalization
- `repaintShapes()` rebuilds SVG content (ellipse + optional handles) from `shapes[]` using `getBoundingClientRect()` for current pixel metrics.
- `repaintOne(el, s)` updates a single ellipse in place; `positionHandles(group, s)` keeps handles aligned.
- All geometry persisted in normalized units; viewport changes do not require data migration.

## Image Loading & Robustness
- Local files via `URL.createObjectURL`.
- URLs validated; on failure, retry once with `crossOrigin="anonymous"` (display-only); block mixed-content (http on https).
- No canvas readbacks; avoids CORS taint concerns for this phase.

## JSON I/O
- **Live JSON** preview of `shapes[]` always in sync.
- **Copy JSON** to clipboard.
- **Import JSON** accepts normalized or legacy format (auto-converted).

## Accessibility & Interaction
- SVG overlay has `aria-label` and keyboard focus root; menu close on outside click; pointer capture during drag/resize.
- Movement threshold differentiates click vs drag to prevent accidental menus during manipulation.

## Risks & Mitigations
- **Aspect ratio variance** may visually shift semantics → future pin/warp features.
- **No undo** yet → consider confirm on delete or add history stack.
- **Host CORS policies** may block hotlinks → recommend local files or CORS-enabled hosts.

## Milestones (updated)
- Phase 1.x — Drawing, multiple shapes, responsive, JSON I/O — **Done**
- Phase 2.4 — Notes & (old) right-click delete — **Replaced**
- **Phase 3.0 — Menu-driven Move/Resize with handles (this doc)** — **Done**
- Next:
  - [ ] Diagonal resize handles (NE/NW/SE/SW) + proportional lock.
  - [ ] Undo/Redo; keyboard shortcuts; multi-select; reorder.
  - [ ] Options dialog (style, label on-canvas, note editing).
  - [ ] Pan/Zoom with normalized persistence.
  - [ ] Export annotated image (optional Canvas render).

## Event Log (chronological, newest last)
- 2025-10-22 07:17 — UX — Notes popover, (legacy) right‑click delete, style overhaul.
- 2025-10-22 12:00 — UX — **Menu with icons; Move/Resize arm-only; 4 resize handles; cursors; right‑click delete removed; safer drawing; pointer unification kept.**
