/*
 * Orientation widget: slot yaw (psi), tilt (tau), tilt direction (phi).
 *
 * Drawing code and the three animations are lifted from the original
 * artifact (agent_policy/docs/orientation_triple_animations.html): same
 * oblique projection, gripper geometry, colours and periods. The three cards
 * are merged into one stage driven by three sliders, and a compact readout
 * shows the equivalent fixed-axis XYZ Euler angles (the harness's internal
 * rpy_deg convention, DROID level frame) so the gimbal seam at a horizontal
 * tool is visible.
 *
 * API: window.mountOrientationWidget(el, {autoplay: true, angles: {psi, tau, phi}})
 *   -> {setAngles({psi, tau, phi}), play(), pause(), destroy()}
 */
(function (root) {
  "use strict";

  var TAU2 = Math.PI * 2;
  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }

  /* ---------- vector math (from the original) ---------- */
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(v, s) { return [v[0] * s, v[1] * s, v[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function rotateZ(v, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
  }
  function rotateAxis(v, axis, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
  }
  /* Local frame: tool points along -z, slot along +x (level pose). */
  function orient(v, psi, tau, phi) {
    var turned = rotateZ(v, rad(psi));
    var p = rad(phi);
    return rotateAxis(turned, [Math.sin(p), -Math.cos(p), 0], rad(tau));
  }

  /* ---------- Euler readout ---------- */
  /* Harness level frame (DROID_LEVEL_ROT): body y = slot -> world +x,
   * body z = tool -> world -z, body x -> world +y. Columns of the world
   * rotation are the body axes expressed in world. */
  function rotationMatrix(psi, tau, phi) {
    var bx = orient([0, 1, 0], psi, tau, phi);
    var by = orient([1, 0, 0], psi, tau, phi);
    var bz = orient([0, 0, -1], psi, tau, phi);
    return [[bx[0], by[0], bz[0]], [bx[1], by[1], bz[1]], [bx[2], by[2], bz[2]]];
  }
  /* Inverse of Rz(yaw) Ry(pitch) Rx(roll); mirrors matrix_to_rpy_deg. */
  function eulerRPY(psi, tau, phi) {
    var m = rotationMatrix(psi, tau, phi);
    var pitch = Math.asin(Math.max(-1, Math.min(1, -m[2][0])));
    var roll, yaw;
    if (Math.abs(Math.cos(pitch)) > 1e-9) {
      roll = Math.atan2(m[2][1], m[2][2]);
      yaw = Math.atan2(m[1][0], m[0][0]);
    } else {
      roll = 0;
      yaw = Math.atan2(-m[0][1], m[1][1]);
    }
    return { roll: deg(roll), pitch: deg(pitch), yaw: deg(yaw) };
  }
  function wrapDelta(a, b) {
    var d = ((b - a) % 360 + 540) % 360 - 180;
    return Math.abs(d);
  }
  /* Largest single-angle change between two Euler triples (wrapped). */
  function eulerJump(e1, e2) {
    return Math.max(wrapDelta(e1.roll, e2.roll), wrapDelta(e1.pitch, e2.pitch), wrapDelta(e1.yaw, e2.yaw));
  }

  var api = { orient: orient, rotationMatrix: rotationMatrix, eulerRPY: eulerRPY, eulerJump: eulerJump };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined") return;

  /* ---------- drawing (from the original, themed) ---------- */
  function project(v, s) {
    return { x: s.cx + (v[0] - v[1]) * s.scale * .78, y: s.cy + ((v[0] + v[1]) * .34 - v[2]) * s.scale };
  }
  function line(ctx, a, b, o) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = o.color;
    ctx.lineWidth = o.width || 2;
    ctx.lineCap = o.cap || "round";
    if (o.dash) ctx.setLineDash(o.dash);
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.stroke();
    ctx.restore();
  }
  function arrow(ctx, a, b, o) {
    line(ctx, a, b, o);
    var ang = Math.atan2(b.y - a.y, b.x - a.x), size = o.head || 8;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * .55);
    ctx.lineTo(-size, size * .55);
    ctx.closePath();
    ctx.fillStyle = o.color;
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.fill();
    ctx.restore();
  }
  function label(ctx, C, text, p, color, align) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = "700 12px " + C.font;
    ctx.textAlign = align || "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.bg;
    ctx.strokeText(text, p.x, p.y);
    ctx.fillText(text, p.x, p.y);
    ctx.restore();
  }

  function drawGrid(ctx, s, C) {
    var z = -1.24;
    for (var n = -3; n <= 3; n += 1) {
      line(ctx, project([n * .4, -1.2, z], s), project([n * .4, 1.2, z], s), { color: C.grid, width: 1 });
      line(ctx, project([-1.2, n * .4, z], s), project([1.2, n * .4, z], s), { color: C.grid, width: 1 });
    }
  }
  function drawCompass(ctx, w, C) {
    var o = { x: w - 48, y: 48 };
    arrow(ctx, o, { x: o.x + 29, y: o.y }, { color: C.x, width: 3, head: 7 });
    arrow(ctx, o, { x: o.x, y: o.y - 29 }, { color: C.y, width: 3, head: 7 });
    ctx.save();
    ctx.beginPath();
    ctx.arc(o.x, o.y, 4, 0, TAU2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.restore();
    label(ctx, C, "+X 0°", { x: o.x + 32, y: o.y + 13 }, C.x, "right");
    label(ctx, C, "+Y 90°", { x: o.x - 2, y: o.y - 39 }, C.y, "center");
  }
  function seg(ctx, s, a, b, A, o) {
    line(ctx, project(orient(a, A.psi, A.tau, A.phi), s), project(orient(b, A.psi, A.tau, A.phi), s), o);
  }
  function drawGripper(ctx, s, A, C) {
    var body = { color: C.toolDark, width: 20 };
    var metal = { color: C.metal, width: 13 };
    seg(ctx, s, [0, 0, 0], [0, 0, -.56], A, body);
    seg(ctx, s, [0, -.28, -.59], [0, .28, -.59], A, body);
    seg(ctx, s, [0, -.28, -.56], [0, -.28, -1.02], A, metal);
    seg(ctx, s, [0, .28, -.56], [0, .28, -1.02], A, metal);
    seg(ctx, s, [-.48, 0, -.91], [.48, 0, -.91], A, { color: C.slot, width: 13 });
    seg(ctx, s, [-.53, 0, -.91], [.53, 0, -.91], A, { color: "rgba(255,255,255,.64)", width: 2 });
    var pv = project([0, 0, 0], s);
    ctx.save();
    ctx.beginPath();
    ctx.arc(pv.x, pv.y, 10, 0, TAU2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pv.x, pv.y, 4, 0, TAU2);
    ctx.fillStyle = C.bg;
    ctx.fill();
    ctx.restore();
  }
  function drawAxes(ctx, s, A, C) {
    var t0 = project(orient([0, 0, -.08], A.psi, A.tau, A.phi), s);
    var t1 = project(orient([0, 0, -1.3], A.psi, A.tau, A.phi), s);
    arrow(ctx, t0, t1, { color: C.tool, width: 4, head: 10 });
    label(ctx, C, "tool", { x: t1.x + 5, y: t1.y + 16 }, C.tool, "center");
    var s0 = project(orient([-.65, 0, -.91], A.psi, A.tau, A.phi), s);
    var s1 = project(orient([.65, 0, -.91], A.psi, A.tau, A.phi), s);
    arrow(ctx, s0, s1, { color: C.slot, width: 3, head: 9 });
    label(ctx, C, "slot", { x: s1.x + 6, y: s1.y - 12 }, C.slot, "left");
  }
  function drawTiltArc(ctx, s, A, C, alpha) {
    var r = 1.04, n = Math.max(2, Math.round(A.tau / 4));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (var i = 0; i <= n; i += 1) {
      var p = project(orient([0, 0, -r], A.psi, A.tau * i / n, A.phi), s);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = C.tilt;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
    var down = project([0, 0, -1.08], s), mid = project([0, 0, -.59], s);
    line(ctx, project([0, 0, 0], s), down, { color: C.muted, width: 2, dash: [5, 5], alpha: .6 * alpha });
    if (alpha > .5) label(ctx, C, "down", { x: mid.x - 10, y: mid.y }, C.muted, "right");
    if (A.tau > 3 && alpha > .5) {
      var m = project(orient([0, 0, -r], A.psi, A.tau / 2, A.phi), s);
      label(ctx, C, "tilt τ", { x: m.x + 17, y: m.y + 4 }, C.tilt, "left");
    }
  }
  function drawToward(ctx, s, A, C, alpha) {
    var z = -1.235, o = project([0, 0, z], s), p = rad(A.phi);
    var e = project([.82 * Math.cos(p), .82 * Math.sin(p), z], s);
    arrow(ctx, o, e, { color: C.tilt, width: 5, head: 10, alpha: alpha });
    if (alpha > .5) label(ctx, C, "tilt dir ϕ", { x: e.x, y: e.y + 17 }, C.tilt, "center");
  }
  function drawSlotOrbit(ctx, s, A, C) {
    ctx.save();
    ctx.beginPath();
    for (var d = 0; d <= 360; d += 8) {
      var p = project(orient([.61, 0, -.91], d, A.tau, A.phi), s);
      if (d === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.strokeStyle = C.slot;
    ctx.globalAlpha = .32;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- animations (from the original) ---------- */
  function triangular(p) { return p < .5 ? p * 2 : (1 - p) * 2; }
  var SEGMENTS = [
    { key: "psi", period: 7200, at: function (p) { return { psi: p * 360, tau: 45, phi: 0 }; } },
    { key: "tau", period: 5600, at: function (p) { return { psi: 90, tau: triangular(p) * 90, phi: 0 }; } },
    { key: "phi", period: 7200, at: function (p) { return { psi: 90, tau: 45, phi: p * 360 }; } }
  ];
  var BLEND = 700; // ms eased hand-off between segments (new; originals were separate cards)
  var CYCLE = SEGMENTS.reduce(function (t, sg) { return t + sg.period + BLEND; }, 0);

  function angDiff(a, b) { return ((b - a) % 360 + 540) % 360 - 180; }
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function mod360(v) { return ((v % 360) + 360) % 360; }

  function animAt(t) {
    t = t % CYCLE;
    for (var i = 0; i < SEGMENTS.length; i += 1) {
      var sg = SEGMENTS[i];
      if (t < sg.period) return { focus: sg.key, angles: sg.at(t / sg.period) };
      t -= sg.period;
      if (t < BLEND) {
        var a = sg.at(1), b = SEGMENTS[(i + 1) % SEGMENTS.length].at(0), k = ease(t / BLEND);
        return {
          focus: SEGMENTS[(i + 1) % SEGMENTS.length].key,
          angles: {
            psi: mod360(a.psi + angDiff(a.psi, b.psi) * k),
            tau: a.tau + (b.tau - a.tau) * k,
            phi: mod360(a.phi + angDiff(a.phi, b.phi) * k)
          }
        };
      }
      t -= BLEND;
    }
    return { focus: "psi", angles: SEGMENTS[0].at(0) };
  }

  /* ---------- theme ---------- */
  function readColors(el) {
    var cs = getComputedStyle(el);
    function v(name, fb) { var x = cs.getPropertyValue(name).trim(); return x || fb; }
    return {
      bg: v("--ow-bg", "#ffffff"),
      ink: v("--ow-fg", "#102642"),
      muted: v("--ow-muted", "#6b7f8f"),
      grid: v("--ow-grid", "#dce5e5"),
      tool: v("--ow-tool", "#129b98"),
      toolDark: v("--ow-tool-dark", "#08716f"),
      metal: v("--ow-metal", "#8fd2cf"),
      slot: v("--ow-slot", "#326ee8"),
      tilt: v("--ow-tilt", "#f08a35"),
      x: v("--ow-x", "#e8483f"),
      y: v("--ow-y", "#20a85a"),
      font: cs.fontFamily || "system-ui, sans-serif"
    };
  }

  var META = {
    psi: { sym: "ψ", name: "slot yaw", min: 0, max: 360, hint: "how the jaws are turned about vertical" },
    tau: { sym: "τ", name: "tilt", min: 0, max: 180, hint: "how far the tool leans from straight down" },
    phi: { sym: "ϕ", name: "tilt direction", min: 0, max: 360, hint: "which way the fingertips tip" }
  };
  var KEYS = ["psi", "tau", "phi"];

  function fmt(v) { return (v < 0 ? "−" : "") + Math.abs(v).toFixed(0) + "°"; }

  function mount(el, opts) {
    opts = opts || {};
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var state = {
      angles: Object.assign({ psi: 90, tau: 45, phi: 0 }, opts.angles || {}),
      focus: "tau",
      playing: opts.autoplay !== false && !reduce,
      t0: 0,
      animT: 0,
      visible: true,
      raf: 0,
      prevEuler: null,
      lastStep: null
    };

    el.classList.add("ow");
    el.innerHTML =
      '<div class="ow-stage"><canvas role="img" aria-label="Gripper orientation for the current slot yaw, tilt and tilt direction"></canvas>' +
      '<div class="ow-chip" aria-hidden="true"><span class="ow-chip-sym"></span> <span class="ow-chip-val"></span></div>' +
      '<div class="ow-legend" aria-hidden="true"><span><i style="background:var(--ow-tool)"></i>tool</span><span><i style="background:var(--ow-slot)"></i>slot</span><span><i style="background:var(--ow-tilt)"></i>tilt</span></div></div>' +
      '<div class="ow-panel">' +
      KEYS.map(function (k) {
        var m = META[k];
        return '<label class="ow-row" data-k="' + k + '"><span class="ow-lab"><b>' + m.sym + '</b> ' + m.name +
          '<output class="ow-val"></output></span><input type="range" min="' + m.min + '" max="' + m.max +
          '" step="1" aria-label="' + m.name + ' (' + m.hint + ')"><span class="ow-note"></span></label>';
      }).join("") +
      '<div class="ow-actions"><button type="button" class="ow-play"></button>' +
      '<button type="button" class="ow-seam" title="Put the tool near horizontal, then drag τ across 90°">Side grasp</button></div>' +
      '<div class="ow-euler" aria-live="off"><div class="ow-euler-h">Same pose as Euler (roll / pitch / yaw)</div>' +
      '<div class="ow-euler-v"><span class="ow-r"></span><span class="ow-p"></span><span class="ow-y"></span></div>' +
      '<div class="ow-euler-d"></div></div></div>';

    var canvas = el.querySelector("canvas");
    var chipSym = el.querySelector(".ow-chip-sym");
    var chipVal = el.querySelector(".ow-chip-val");
    var playBtn = el.querySelector(".ow-play");
    var seamBtn = el.querySelector(".ow-seam");
    var eulerBox = el.querySelector(".ow-euler");
    var eR = el.querySelector(".ow-r"), eP = el.querySelector(".ow-p"), eY = el.querySelector(".ow-y");
    var eD = el.querySelector(".ow-euler-d");
    var rows = {};
    KEYS.forEach(function (k) {
      var row = el.querySelector('.ow-row[data-k="' + k + '"]');
      rows[k] = { row: row, input: row.querySelector("input"), out: row.querySelector("output"), note: row.querySelector(".ow-note") };
      rows[k].input.addEventListener("input", function () { userSet(k, Number(this.value)); });
    });

    var C = readColors(el);
    function refreshColors() { C = readColors(el); draw(); }
    var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    if (mq && mq.addEventListener) mq.addEventListener("change", refreshColors);
    var mo = new MutationObserver(refreshColors);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

    function userSet(k, v) {
      if (state.playing) setPlaying(false);
      var before = Object.assign({}, state.angles);
      state.angles[k] = v;
      state.focus = k;
      var e1 = eulerRPY(before.psi, before.tau, before.phi);
      var e2 = eulerRPY(state.angles.psi, state.angles.tau, state.angles.phi);
      state.lastStep = { key: k, tri: Math.abs(v - before[k]), eul: eulerJump(e1, e2) };
      render();
    }

    function setPlaying(p) {
      state.playing = p;
      if (p) state.t0 = performance.now() - state.animT;
      playBtn.textContent = p ? "Pause" : "Animate";
      playBtn.setAttribute("aria-pressed", p ? "true" : "false");
      el.classList.toggle("ow-is-playing", p);
      if (p) state.lastStep = null;
      kick();
    }

    playBtn.addEventListener("click", function () { setPlaying(!state.playing); });
    seamBtn.addEventListener("click", function () {
      setPlaying(false);
      state.angles = { psi: 90, tau: 88, phi: 1 };
      state.focus = "tau";
      state.lastStep = null;
      render();
      rows.tau.input.focus();
    });

    function syncControls() {
      var A = state.angles;
      var poles = A.tau <= 0 || A.tau >= 180;
      KEYS.forEach(function (k) {
        var r = rows[k];
        var v = Math.round(A[k]);
        if (Number(r.input.value) !== v) r.input.value = String(v);
        r.out.textContent = (k === "phi" && poles) ? "undefined" : v + "°";
        r.row.classList.toggle("is-focus", state.focus === k);
        r.row.classList.toggle("is-locked", state.playing && state.focus !== k);
      });
      rows.phi.note.textContent = poles ? "tool is vertical: ϕ has no meaning at τ = 0° or 180°" : "";
      chipSym.textContent = META[state.focus].sym;
      chipVal.textContent = (state.focus === "phi" && poles) ? "–" : Math.round(A[state.focus]) + "°";

      var e = eulerRPY(A.psi, A.tau, A.phi);
      eR.textContent = "r " + fmt(e.roll);
      eP.textContent = "p " + fmt(e.pitch);
      eY.textContent = "y " + fmt(e.yaw);
      var near = Math.abs(e.pitch) > 80;
      eulerBox.classList.toggle("is-seam", near);
      var d = state.lastStep;
      if (d && d.tri > 0) {
        eD.textContent = META[d.key].sym + " moved " + d.tri.toFixed(0) + "°, Euler moved " + d.eul.toFixed(0) + "°";
        eD.classList.toggle("is-big", d.eul > 5 * d.tri + 5);
      } else {
        eD.textContent = near ? "near the gimbal seam (pitch ≈ ±90°)" : "";
        eD.classList.remove("is-big");
      }
      state.prevEuler = e;
    }

    function draw() {
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(1, rect.width), h = Math.max(1, rect.height);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var s = { cx: w * .48, cy: h * .22, scale: Math.min(w / 3.25, h / 2.65) };
      var A = state.angles, f = state.focus;
      drawGrid(ctx, s, C);
      drawCompass(ctx, w, C);
      if (f === "psi") drawSlotOrbit(ctx, s, A, C);
      if (A.tau > 0.5 && A.tau < 179.5) drawToward(ctx, s, A, C, f === "phi" ? 1 : .22);
      drawGripper(ctx, s, A, C);
      drawTiltArc(ctx, s, A, C, f === "tau" ? 1 : .22);
      drawAxes(ctx, s, A, C);
    }

    function render() { syncControls(); draw(); }

    function frame(now) {
      state.raf = 0;
      if (state.playing) {
        state.animT = now - state.t0;
        var a = animAt(state.animT);
        state.angles = a.angles;
        state.focus = a.focus;
      }
      render();
      if (state.playing && state.visible) state.raf = requestAnimationFrame(frame);
    }
    function kick() { if (!state.raf) state.raf = requestAnimationFrame(frame); }

    var io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (entries) {
        state.visible = entries[0].isIntersecting;
        if (state.visible && state.playing) { state.t0 = performance.now() - state.animT; kick(); }
      });
      io.observe(el);
    }
    var ro = null;
    if ("ResizeObserver" in window) { ro = new ResizeObserver(function () { draw(); }); ro.observe(canvas); }

    setPlaying(state.playing);
    render();

    return {
      setAngles: function (a) { setPlaying(false); Object.assign(state.angles, a); render(); },
      play: function () { setPlaying(true); },
      pause: function () { setPlaying(false); },
      destroy: function () {
        setPlaying(false);
        if (state.raf) cancelAnimationFrame(state.raf);
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        mo.disconnect();
        if (mq && mq.removeEventListener) mq.removeEventListener("change", refreshColors);
        el.innerHTML = "";
        el.classList.remove("ow", "ow-is-playing");
      }
    };
  }

  root.mountOrientationWidget = mount;
  root.orientationWidgetMath = api;
})(typeof window !== "undefined" ? window : globalThis);
