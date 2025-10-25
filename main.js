// main.js — Ellipse annotate: draw & move with pointer events; panel opens on select/new
// Mobile/desktop friendly. Adds: delete on right-click (desktop) & long-press (touch/pen).

(function () {
  // ===== DOM Refs =====
  const imageInput = document.getElementById("imageInput");
  const clearBtn = document.getElementById("clearBtn");
  const stage = document.getElementById("stage");
  const img = document.getElementById("baseImage");
  const overlay = document.getElementById("overlay");
  const dropHint = document.getElementById("dropHint");
  const imageUrl = document.getElementById("imageUrl");
  const loadUrlBtn = document.getElementById("loadUrlBtn");
  const errorBox = document.getElementById("errorBox");
  const jsonView = document.getElementById("jsonView");
  const jsonInput = document.getElementById("jsonInput");
  const loadJsonBtn = document.getElementById("loadJsonBtn");
  const copyJsonBtn = document.getElementById("copyJsonBtn");
  const forceCors = document.getElementById("forceCors");

  // Under-image panel
  const panel = document.getElementById("underControls");
  const annoSelect = document.getElementById("annoSelect");
  const annoText = document.getElementById("annoText");

  // ===== State =====
  let objectUrl = null;

  // Drawing
  let isDrawing = false;
  let startPt = { x: 0, y: 0 };
  let activeEllipse = null;

  // Shapes: { id, type:'ellipse', nx, ny, nrx, nry, option, note }
  const shapes = [];

  // Selection
  let selectedId = null;
  let selectedEl = null;

  const MOVE_THRESHOLD_PX = 6;
  const LONG_PRESS_MS = 600;

  // ===== Utils =====
  const uid = () =>
    Math.random().toString(36).slice(2) + Date.now().toString(36);

  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx,
      dy = ay - by;
    return dx * dx + dy * dy;
  }

  function safeRelease(el, pid) {
    try {
      el.releasePointerCapture?.(pid);
    } catch {}
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = !msg;
  }
  const clearError = () => showError("");

  const updateJsonView = () => {
    if (jsonView) jsonView.textContent = JSON.stringify(shapes, null, 2);
  };

  const findShape = (id) => shapes.find((s) => s.id === id) || null;

  function getSelectedShape() {
    return selectedId ? findShape(selectedId) : null;
  }

  // === Delete helper
  function deleteShapeById(id) {
    const idx = shapes.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const wasSelected = selectedId === id;
    shapes.splice(idx, 1);
    if (wasSelected) clearSelection();
    repaintShapes();
    updateJsonView();
  }

  // Panel open/close (CSS: .under-image-controls {display:none}, .is-open {display:flex})
  function openUnderPanel() {
    panel?.classList.add("is-open");
  }
  function closeUnderPanel() {
    panel?.classList.remove("is-open");
  }

  function showPanelForShape(s) {
    if (!panel || !s) return hidePanel();
    if (annoSelect) annoSelect.value = s.option ?? "";
    if (annoText) annoText.value = s.note ?? "";
    openUnderPanel();
  }

  function hidePanel() {
    if (!panel) return;
    if (annoSelect) annoSelect.value = "";
    if (annoText) annoText.value = "";
    closeUnderPanel();
  }

  function selectEl(el) {
    if (selectedEl && selectedEl !== el)
      selectedEl.classList.remove("is-selected");
    selectedEl = el || null;
    selectedId = el?.dataset?.id || null;

    if (el) el.classList.add("is-selected");

    const s = getSelectedShape();
    if (s) showPanelForShape(s);
    else hidePanel();
  }

  function clearSelection() {
    if (selectedEl) selectedEl.classList.remove("is-selected");
    selectedEl = null;
    selectedId = null;
    hidePanel();
  }

  // ===== Image Loading =====
  function onImageLoaded() {
    overlay.style.display = "block";
    dropHint.style.display = "none";
    repaintShapes();
    clearError();
  }

  function loadFromFile(file) {
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    img.removeAttribute("crossorigin");
    img.onload = onImageLoaded;
    img.onerror = () => showError("خطا در بارگذاری فایل.");
    img.src = objectUrl;
  }

  function loadFromUrl(urlInput) {
    const url = (urlInput || "").trim();
    if (!/^https?:|^data:image/.test(url)) {
      showError("آدرس معتبر وارد کنید.");
      return;
    }
    if (location.protocol === "https:" && url.startsWith("http:")) {
      showError("Mixed Content: URL باید HTTPS باشد یا فایل را محلی باز کنید.");
      return;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);

    let triedCors = false;
    function attempt(withCors) {
      img.onload = onImageLoaded;
      img.onerror = () => {
        if (!triedCors) {
          triedCors = true;
          attempt(true);
          return;
        }
        showError("خطا در بارگذاری URL (CORS/Hotlink).");
      };
      if (withCors || (forceCors && forceCors.checked))
        img.crossOrigin = "anonymous";
      else img.removeAttribute("crossorigin");
      img.src = url;
    }
    attempt(false);
  }

  imageInput?.addEventListener("change", (e) =>
    loadFromFile(e.target.files?.[0])
  );
  loadUrlBtn?.addEventListener("click", () => {
    clearError();
    loadFromUrl(imageUrl.value);
  });
  imageUrl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearError();
      loadFromUrl(imageUrl.value);
    }
  });

  // Drag & Drop
  stage?.addEventListener("dragover", (e) => {
    e.preventDefault();
    stage.classList.add("dragover");
  });
  stage?.addEventListener("dragleave", () =>
    stage.classList.remove("dragover")
  );
  stage?.addEventListener("drop", (e) => {
    e.preventDefault();
    stage.classList.remove("dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) loadFromFile(file);
  });

  // Click background → clear selection
  stage?.addEventListener("pointerdown", (e) => {
    const isOnShape =
      e.target instanceof Element && e.target.closest("ellipse");
    if (!isOnShape && !isDrawing) clearSelection();
  });

  // ===== Render / Repaint =====
  function repaintShapes() {
    overlay.innerHTML = "";
    const rect = overlay.getBoundingClientRect();
    const w = rect.width,
      h = rect.height;

    for (const s of shapes) {
      if (s.type !== "ellipse") continue;

      const el = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "ellipse"
      );
      el.classList.add("ellipse-shape");
      el.dataset.id = s.id;

      const cx = s.nx * w;
      const cy = s.ny * h;
      const rx = Math.abs(s.nrx * w);
      const ry = Math.abs(s.nry * h);

      el.setAttribute("cx", cx);
      el.setAttribute("cy", cy);
      el.setAttribute("rx", rx);
      el.setAttribute("ry", ry);

      // Style: black stroke + soft fill (hue per-index)
      const idx = shapes.indexOf(s) + 1;
      const hue = (idx * 47) % 360;
      el.setAttribute("stroke", "#000");
      el.setAttribute("stroke-width", "2");
      el.setAttribute("fill", `hsl(${hue}, 75%, 65%)`);
      el.setAttribute("fill-opacity", "0.25");

      // Pointer handlers (move only)
      el.addEventListener("pointerdown", (ev) =>
        onShapePointerDown(ev, el, s.id)
      );
      el.addEventListener("pointermove", (ev) =>
        onShapePointerMove(ev, el, s.id)
      );
      el.addEventListener("pointerup", (ev) => onShapePointerEnd(ev, el, s.id));
      el.addEventListener("pointercancel", (ev) =>
        onShapePointerCancel(ev, el, s.id)
      );

      // Delete on right-click (desktop)
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        deleteShapeById(s.id);
      });

      // Keep selection styling
      if (s.id === selectedId) {
        el.classList.add("is-selected");
        selectedEl = el;
        el.setAttribute("fill-opacity", "0.6");
      }

      overlay.appendChild(el);

      // Label (index)
      const label = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      label.textContent = String(idx);
      label.setAttribute("x", cx);
      label.setAttribute("y", cy);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "central");
      label.setAttribute("fill", "#111");
      label.setAttribute("font-size", "12px");
      label.setAttribute("paint-order", "stroke");
      label.setAttribute("stroke", "#fff");
      label.setAttribute("stroke-width", "3");
      label.setAttribute("pointer-events", "none");
      el.__labelRef = label;

      overlay.appendChild(label);
    }

    // Sync panel after repaint
    const curr = getSelectedShape();
    if (curr) showPanelForShape(curr);
    else hidePanel();
  }

  function repaintOne(el, s) {
    const r = overlay.getBoundingClientRect();
    const cx = s.nx * r.width;
    const cy = s.ny * r.height;
    const rx = s.nrx * r.width;
    const ry = s.nry * r.height;

    el.setAttribute("cx", cx);
    el.setAttribute("cy", cy);
    el.setAttribute("rx", rx);
    el.setAttribute("ry", ry);

    // keep label centered
    const lbl = el.__labelRef;
    if (lbl) {
      lbl.setAttribute("x", cx);
      lbl.setAttribute("y", cy);
    }
  }

  window.addEventListener("resize", () => {
    if (overlay.style.display === "block") repaintShapes();
  });

  // ===== Drawing (Pointer Events) =====
  function getRelative(evt) {
    const rect = overlay.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    };
  }

  overlay?.addEventListener("pointerdown", (e) => {
    if (!img.src) return;
    // Start drawing only on empty space
    const isOnShape =
      e.target instanceof Element && e.target.closest("ellipse");
    if (isOnShape) return;

    isDrawing = true;
    const { x, y } = getRelative(e);
    startPt = { x, y };

    activeEllipse = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "ellipse"
    );
    activeEllipse.classList.add("ellipse-shape");
    // Guide style while drawing
    activeEllipse.setAttribute("fill", "none");
    activeEllipse.setAttribute("stroke", "#3b82f6");
    activeEllipse.setAttribute("stroke-dasharray", "6 3");
    activeEllipse.setAttribute("stroke-width", "2");
    overlay.appendChild(activeEllipse);

    overlay.setPointerCapture?.(e.pointerId);
  });

  overlay?.addEventListener("pointermove", (e) => {
    if (!isDrawing || !activeEllipse) return;

    const { x, y } = getRelative(e);
    // Rubber-band
    let cx = (startPt.x + x) / 2;
    let cy = (startPt.y + y) / 2;
    let rx = Math.abs(x - startPt.x) / 2;
    let ry = Math.abs(y - startPt.y) / 2;

    if (e.shiftKey) {
      const r = Math.min(rx, ry);
      rx = r;
      ry = r;
    }
    if (rx < 0.5) rx = 0.5;
    if (ry < 0.5) ry = 0.5;

    activeEllipse.setAttribute("cx", cx);
    activeEllipse.setAttribute("cy", cy);
    activeEllipse.setAttribute("rx", rx);
    activeEllipse.setAttribute("ry", ry);
  });

  window.addEventListener("pointerup", () => {
    if (!isDrawing || !activeEllipse) return;
    const rect = overlay.getBoundingClientRect();

    const cx = parseFloat(activeEllipse.getAttribute("cx") || "0");
    const cy = parseFloat(activeEllipse.getAttribute("cy") || "0");
    const rx = Math.abs(parseFloat(activeEllipse.getAttribute("rx") || "0"));
    const ry = Math.abs(parseFloat(activeEllipse.getAttribute("ry") || "0"));

    // Too small → discard
    if (rx < 4 || ry < 4) {
      activeEllipse.remove();
      isDrawing = false;
      activeEllipse = null;
      return;
    }

    const s = {
      id: uid(),
      type: "ellipse",
      nx: cx / rect.width,
      ny: cy / rect.height,
      nrx: rx / rect.width,
      nry: ry / rect.height,
      option: "",
      note: "",
    };
    shapes.push(s);

    // Finish drawing
    activeEllipse = null;
    isDrawing = false;

    // Repaint & select the new shape → panel opens
    repaintShapes();

    // Find newly added element and select it
    const ellipses = overlay.querySelectorAll("ellipse");
    const lastEl = ellipses[ellipses.length - 1];
    if (lastEl) selectEl(lastEl);

    updateJsonView();
  });

  // ===== Pointer handlers on shapes (move only) =====
  function onShapePointerDown(e, el, id) {
    e.stopPropagation(); // don't start a new drawing
    el.setPointerCapture?.(e.pointerId);
    const s = findShape(id);
    if (!s) return;

    // Select + open panel
    selectEl(el);

    // state
    el.__st = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      dragging: false,
      startNX: s.nx,
      startNY: s.ny,
      longPressTimer: null,
    };

    // Long-press (touch/pen) → delete
    const pt = e.pointerType;
    if (pt === "touch" || pt === "pen") {
      if (el.__st.longPressTimer) clearTimeout(el.__st.longPressTimer);
      const startX = e.clientX,
        startY = e.clientY;
      el.__st.longPressTimer = setTimeout(() => {
        const dx = el.__st.lastX - startX;
        const dy = el.__st.lastY - startY;
        if (dx * dx + dy * dy < MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
          deleteShapeById(id);
        }
      }, LONG_PRESS_MS);
    }
  }

  function onShapePointerMove(e, el, id) {
    const st = el.__st;
    if (!st || st.pointerId !== e.pointerId) return;

    st.lastX = e.clientX;
    st.lastY = e.clientY;

    if (
      !st.moved &&
      dist2(st.startX, st.startY, e.clientX, e.clientY) >=
        MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX
    ) {
      st.moved = true;
      st.dragging = true;
      el.classList.add("dragging");
      // اگر حرکت قابل توجه شد، لانگ‌پرس را لغو کن
      if (st.longPressTimer) {
        clearTimeout(st.longPressTimer);
        st.longPressTimer = null;
      }
    }

    if (st.dragging) {
      const s = findShape(id);
      if (!s) return;
      const r = overlay.getBoundingClientRect();
      const dxN = (e.clientX - st.startX) / r.width;
      const dyN = (e.clientY - st.startY) / r.height;

      s.nx = clamp01(st.startNX + dxN);
      s.ny = clamp01(st.startNY + dyN);

      repaintOne(el, s);
      updateJsonView();
    }
  }

  function onShapePointerEnd(e, el, id) {
    const st = el.__st;
    if (!st || st.pointerId !== e.pointerId) return;

    if (st.dragging) {
      el.classList.remove("dragging");
      safeRelease(el, st.pointerId);
      // پایان درگ → لانگ‌پرس لغو شود
      if (st.longPressTimer) {
        clearTimeout(st.longPressTimer);
        st.longPressTimer = null;
      }
      el.__st = null;
      return; // keep selection open
    }

    // کلیک ساده روی شکل → لانگ‌پرس را لغو کن
    if (st.longPressTimer) {
      clearTimeout(st.longPressTimer);
      st.longPressTimer = null;
    }
    safeRelease(el, st.pointerId);
    el.__st = null;
  }

  function onShapePointerCancel(e, el, id) {
    const st = el.__st;
    if (!st || st.pointerId !== e.pointerId) return;
    el.classList.remove("dragging");
    if (st.longPressTimer) {
      clearTimeout(st.longPressTimer);
      st.longPressTimer = null;
    }
    safeRelease(el, st.pointerId);
    el.__st = null;
  }

  // ===== JSON I/O =====
  copyJsonBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(shapes, null, 2));
      copyJsonBtn.textContent = "کپی شد ✔";
      setTimeout(() => (copyJsonBtn.textContent = "کپی JSON"), 1200);
    } catch {
      showError("امکان کپی در کلیپ‌بورد وجود ندارد.");
    }
  });

  loadJsonBtn?.addEventListener("click", () => {
    const txt = jsonInput.value.trim();
    if (!txt) return;

    try {
      const arr = JSON.parse(txt);
      if (!Array.isArray(arr)) throw new Error("not array");

      const prevSelected = typeof selectedId === "string" ? selectedId : null;

      shapes.length = 0;

      for (const item of arr) {
        const id = item.id || uid();

        if (item.type === "ellipse" && "nx" in item && "ny" in item) {
          shapes.push({
            id,
            type: "ellipse",
            nx: Number(item.nx) ?? 0,
            ny: Number(item.ny) ?? 0,
            nrx: Math.abs(Number(item.nrx) ?? 0),
            nry: Math.abs(Number(item.nry) ?? 0),
            option: item.option ?? "",
            note: item.note ?? "",
          });
          continue;
        }

        // Legacy absolute coords
        if (item.canvasW && item.canvasH) {
          const cw = Number(item.canvasW) || 1;
          const ch = Number(item.canvasH) || 1;
          shapes.push({
            id,
            type: "ellipse",
            nx: (Number(item.cx) ?? 0) / cw,
            ny: (Number(item.cy) ?? 0) / ch,
            nrx: Math.abs(Number(item.rx) ?? 0) / cw,
            nry: Math.abs(Number(item.ry) ?? 0) / ch,
            option: item.option ?? "",
            note: item.note ?? "",
          });
          continue;
        }
      }

      repaintShapes();
      updateJsonView();

      const hasPrev = prevSelected && shapes.some((s) => s.id === prevSelected);
      if (hasPrev) {
        selectedId = prevSelected;
        repaintShapes(); // will open panel via showPanelForShape
      } else {
        clearSelection(); // will close panel
      }
    } catch {
      showError("JSON نامعتبر است.");
    }
  });

  // Bind panel → selected shape
  annoSelect?.addEventListener("change", () => {
    const s = getSelectedShape();
    if (!s) return;
    s.option = annoSelect.value;
    updateJsonView();
  });

  annoText?.addEventListener("input", () => {
    const s = getSelectedShape();
    if (!s) return;
    s.note = annoText.value;
    updateJsonView();
  });

  // Clear all
  clearBtn?.addEventListener("click", () => {
    shapes.length = 0;
    clearSelection();
    repaintShapes();
    updateJsonView();
  });

  // ===== Init =====
  hidePanel(); // panel closed by default
  updateJsonView();
})();
