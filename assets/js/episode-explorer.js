/* Episode explorer: scrub a real-robot agent episode turn by turn.
 * Usage: window.mountEpisodeExplorer(el, { dataUrl: "data/episode.json", basePath: "" })
 * Returns a promise resolving to { go(i), next(), prev(), play(), pause(), destroy() }.
 *
 * Each turn is two columns that read left to right:
 *   Sees: the observation message the agent receives (camera images, perception, arm state, todo),
 *         preceded by the tool message carrying the previous call's returned text;
 *   Thinks / Does / Gets back: its reasoning, the one tool call it emits, and the text that call
 *         returns. That text reaches the agent as the next turn's tool message; it is shown here,
 *         beside the call that produced it, with a one-line harness log (never sent to the agent).
 * Call coordinates that match values in the observation or reasoning (x, y within MATCH_M) share a
 * highlight color; hovering one emphasises the others. The columns stack at narrow widths.
 */
(function () {
  "use strict";

  var INLINE_RAW = 420; // returned text up to this length is shown open; longer is collapsed
  var PLAY_MS = 3200;
  var MATCH_M = 0.005; // x, y distance under which two coordinates count as the same point
  var CAM_SHORT = { left_wrist: "L wrist", right_wrist: "R wrist", overview: "overview" };

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs[k] == null) continue;
        if (k === "class") el.className = attrs[k];
        else if (k === "text") el.textContent = attrs[k];
        else if (k === "style") el.setAttribute("style", attrs[k]);
        else el.setAttribute(k, attrs[k]);
      }
    }
    (kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  function prettyJson(obj) {
    // Keep flat objects (e.g. one arm command) on a single line.
    var raw = JSON.stringify(obj, null, 2).replace(/\{\n\s*([^{}\[\]]*?)\n\s*\}/g, function (m, body) {
      var one = "{ " + body.split(/,\n\s*/).join(", ") + " }";
      return one.length <= 110 ? one : m;
    });
    var s = esc(raw);
    return s.replace(
      /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      function (m, str, colon, num) {
        if (str) return colon ? '<span class="k">' + str + "</span>" + colon : '<span class="s">' + str + "</span>";
        return '<span class="n">' + num + "</span>";
      }
    );
  }

  function outcomeClass(o) {
    if (o === "reached" || o === "complete") return "ok";
    if (o === "short" || o === "stalled" || o === "blocked" || o === "incomplete") return "warn";
    if (o === "not_attempted" || o === "unknown" || o === "failed") return "bad";
    return "neutral";
  }

  function fmtNum(v, unit) {
    if (v == null) return "-";
    if (unit === "m") return (v * 1000).toFixed(1) + " mm";
    if (unit === "deg") return v.toFixed(2) + "°";
    return String(v);
  }

  function fmtInt(n) {
    return n == null ? "-" : Number(n).toLocaleString("en-US");
  }

  function fmtXYZ(v) {
    return "(" + v.map(function (x) { return x.toFixed(3); }).join(", ") + ")";
  }

  function sameList(a, b) {
    return JSON.stringify(a || []) === JSON.stringify(b || []);
  }

  function toolChip(name) {
    return h("span", { class: "epx-tool t-" + name, text: name });
  }

  function roleTag(role) {
    return h("span", { class: "epx-role", text: role });
  }

  function details(summary, kids, cls) {
    var s = h("summary");
    if (typeof summary === "string") s.textContent = summary;
    else s.appendChild(summary);
    return h("details", { class: "epx-det" + (cls ? " " + cls : "") }, [s].concat(kids));
  }

  function rawPre(text) {
    var pre = h("pre", { class: "epx-raw" });
    pre.textContent = text;
    return pre;
  }

  function table(head, rows) {
    var tb = h("table", {}, [h("thead", {}, [h("tr", {}, head.map(function (c) { return h("th", { text: c }); }))])]);
    var body = h("tbody");
    rows.forEach(function (r) { body.appendChild(r); });
    tb.appendChild(body);
    return h("div", { class: "epx-tablewrap" }, [tb]);
  }

  /* ---------- coordinate matching ---------- */
  // "x, y" number pairs written in free text, e.g. "<0.412,0.200>" or "(0.412, 0.200, 0.009)".
  var PAIR_RE = /(-?\d*\.\d+)\s*,\s*(-?\d*\.\d+)/g;

  function pairsIn(text) {
    var out = [];
    var m;
    PAIR_RE.lastIndex = 0;
    while ((m = PAIR_RE.exec(text || ""))) out.push({ at: m.index, len: m[0].length, x: parseFloat(m[1]), y: parseFloat(m[2]) });
    return out;
  }

  // The x, y points a call names: one per move_to command, or the pairs written in update_todo items.
  function targetsOf(tool) {
    var inp = tool.input || {};
    var out = [];
    if (tool.name === "move_to") {
      (inp.commands || []).forEach(function (c) {
        if (typeof c.x === "number" && typeof c.y === "number") out.push({ x: c.x, y: c.y });
      });
    } else if (tool.name === "update_todo") {
      (inp.items || []).forEach(function (s) {
        pairsIn(s).forEach(function (p) {
          if (matchIndex(out, p.x, p.y) < 0) out.push({ x: p.x, y: p.y });
        });
      });
    }
    return out;
  }

  // Index of the nearest target within MATCH_M of (x, y), or -1.
  function matchIndex(targets, x, y) {
    var best = -1;
    var bestD = MATCH_M + 1e-9;
    targets.forEach(function (tg, k) {
      var d = Math.sqrt((tg.x - x) * (tg.x - x) + (tg.y - y) * (tg.y - y));
      if (d <= bestD) { bestD = d; best = k; }
    });
    return best;
  }

  function mount(root, opts) {
    opts = opts || {};
    var base = opts.basePath || "";
    if (base && base.charAt(base.length - 1) !== "/") base += "/";
    var dataUrl = opts.dataUrl || base + "data/episode.json";
    root.classList.add("epx");
    root.setAttribute("tabindex", "0");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Episode explorer");
    root.textContent = "Loading episode…";

    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var state = { i: 0, playing: false, timer: null };
    var api = {};

    return fetch(dataUrl)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        build(data);
        return api;
      })
      .catch(function (err) {
        root.textContent = "Could not load episode data (" + err.message + ").";
        return api;
      });

    function build(data) {
      var turns = data.turn_list;
      var N = turns.length;
      var VIEWS = data.views && data.views.length ? data.views : ["left wrist", "overview", "right wrist"];
      root.textContent = "";

      turns.forEach(function (t) {
        var im = new Image();
        im.src = base + t.image;
      });

      /* ---------- episode header ---------- */
      var metaBits = [data.turns + " turns", data.episode_s.toFixed(1) + " s wall clock", data.moves + " robot actions", data.rig];
      var head = h("div", { class: "epx-head" }, [
        h("span", { class: "epx-task", text: data.task }),
        h("span", { class: "epx-pill " + (data.success ? "ok" : "bad"), text: data.success ? "success" : "failed" }),
        h("span", { class: "epx-meta", text: metaBits.join(" · ") }),
        data.tokens ? h("span", { class: "epx-meta epx-small", text: fmtInt(data.tokens.in) + " tokens in, " + fmtInt(data.tokens.out) + " out" }) : null,
      ]);

      /* ---------- turn navigator ---------- */
      var prevBtn = h("button", { class: "epx-btn", type: "button", "aria-label": "Previous turn", text: "←" });
      var playBtn = h("button", { class: "epx-btn epx-play", type: "button", "aria-label": "Play", text: "▶ Play" });
      var nextBtn = h("button", { class: "epx-btn", type: "button", "aria-label": "Next turn", text: "→" });
      var turnLabel = h("span", { class: "epx-turnlabel", "aria-live": "polite" });
      var hint = h("span", { class: "epx-hint", text: "← / → step · space play" });
      var controls = h("div", { class: "epx-controls" }, [prevBtn, playBtn, nextBtn, turnLabel, hint]);

      var timeline = h("div", { class: "epx-timeline", role: "tablist", "aria-label": "Turns" });
      var tip = h("div", { class: "epx-tip", role: "tooltip", id: "epx-tip-" + Math.random().toString(36).slice(2, 8), hidden: "" });
      var segs = turns.map(function (t, i) {
        var dur = Math.max(1, t.t_end - t.t_start);
        var b = h("button", {
          class: "epx-seg t-" + t.tool.name,
          type: "button",
          role: "tab",
          style: "flex-grow:" + dur.toFixed(2),
          "aria-label": "Turn " + t.turn + ", " + t.tool.name + ", " + dur.toFixed(1) + " seconds",
          "aria-describedby": tip.id,
        }, [h("span", { class: "epx-segn", text: String(t.turn) }), h("span", { class: "epx-segt", text: t.tool.name })]);
        b.addEventListener("click", function () { hideTip(); pause(); go(i); });
        b.addEventListener("mouseenter", function () { showTip(i); });
        b.addEventListener("focus", function () { showTip(i); });
        b.addEventListener("mouseleave", hideTip);
        b.addEventListener("blur", hideTip);
        timeline.appendChild(b);
        return b;
      });
      var nav = h("div", { class: "epx-nav" }, [controls, timeline, tip]);

      // Tool names show inside segments wide enough to hold them (11px mono: about 6.7px per character,
      // plus padding and the gap between number and name).
      function fitSegs() {
        segs.forEach(function (b, i) {
          var need = (String(turns[i].turn).length + turns[i].tool.name.length) * 6.7 + 22;
          b.classList.toggle("is-wide", b.clientWidth >= need);
        });
      }
      var ro = null;
      if (window.ResizeObserver) { ro = new ResizeObserver(fitSegs); ro.observe(timeline); }
      else window.addEventListener("resize", fitSegs);

      function showTip(i) {
        var t = turns[i];
        tip.textContent = "";
        tip.appendChild(h("div", { class: "epx-tiphead" }, [
          "Turn " + t.turn + " · ", toolChip(t.tool.name),
          h("span", { class: "epx-muted", text: " " + (t.t_end - t.t_start).toFixed(1) + " s" }),
        ]));
        callLines(t.tool).forEach(function (s) { tip.appendChild(h("div", { class: "epx-tipline", text: s })); });
        tip.hidden = false;
        var nr = nav.getBoundingClientRect();
        var sr = segs[i].getBoundingClientRect();
        var w = tip.offsetWidth;
        var x = sr.left + sr.width / 2 - nr.left - w / 2;
        tip.style.left = Math.max(0, Math.min(nr.width - w, x)) + "px";
        tip.style.top = sr.bottom - nr.top + 8 + "px";
      }
      function hideTip() { tip.hidden = true; }

      /* ---------- the turn: two columns ---------- */
      function block(label, kids, cls) {
        return h("div", { class: "epx-blk" + (cls ? " " + cls : "") }, [h("div", { class: "epx-blabel", text: label }), h("div", { class: "epx-bbody" }, kids)]);
      }
      function colHead(title, kids) {
        return h("header", { class: "epx-chead" }, [h("h5", { class: "epx-ctitle", text: title })].concat(kids || []));
      }

      var seesHead = h("div");
      var thumbs = VIEWS.map(function (v, k) {
        var img = h("img", { alt: "", loading: "lazy", decoding: "async", style: "left:" + -100 * k + "%" });
        var b = h("button", { class: "epx-thumb", type: "button", "aria-label": "Enlarge the " + v + " image" }, [
          h("span", { class: "epx-crop" }, [img]),
          h("span", { class: "epx-vlabel", text: v }),
        ]);
        b.addEventListener("click", function () { lbOpen(k, b); });
        return { btn: b, img: img };
      });
      var media = h("div", { class: "epx-media" }, [
        h("div", { class: "epx-thumbs" }, thumbs.map(function (x) { return x.btn; })),
        h("div", { class: "epx-imgfoot" }, [
          h("span", { text: "Click an image to enlarge." }),
          data.image_note ? details("About these images", [h("p", { class: "epx-note", text: data.image_note })], "epx-inline-det") : null,
        ]),
      ]);
      var seesBody = h("div", { class: "epx-cbody" });
      var sees = h("section", { class: "epx-col c-sees", "aria-label": "What the agent sees" }, [seesHead, media, seesBody]);
      var act = h("section", { class: "epx-col c-act", "aria-label": "What the agent thinks, does and gets back" });
      var turnEl = h("div", { class: "epx-turn" }, [sees, act]);
      var foot = h("p", { class: "epx-footnote" }, [
        "Timeline segment width = wall-clock time of the turn (model inference + tool execution).",
        data.history_mode === "full_history" ? " Each message is appended to the conversation, so the agent also keeps every earlier turn in context." : null,
      ]);
      root.appendChild(h("div", { class: "epx-inner" }, [head, nav, turnEl, foot]));

      prevBtn.addEventListener("click", function () { pause(); prev(); });
      nextBtn.addEventListener("click", function () { pause(); next(); });
      playBtn.addEventListener("click", function () { state.playing ? pause() : play(); });
      root.addEventListener("keydown", onKey);
      root.addEventListener("mouseover", onHl);
      root.addEventListener("mouseout", onHl);

      function onKey(e) {
        var tag = e.target && e.target.tagName;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
        if (e.key === "ArrowRight") { e.preventDefault(); pause(); next(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); pause(); prev(); }
        else if (e.key === " " && (e.target === root || e.target === playBtn)) {
          e.preventDefault();
          state.playing ? pause() : play();
        } else if (e.key === "Home") { e.preventDefault(); pause(); go(0); }
        else if (e.key === "End") { e.preventDefault(); pause(); go(N - 1); }
      }

      // Hovering a highlighted coordinate emphasises every value with the same color.
      function onHl(e) {
        var el = e.type === "mouseover" && e.target.closest ? e.target.closest(".epx-hl") : null;
        if (el) root.setAttribute("data-hl-on", el.getAttribute("data-hl"));
        else root.removeAttribute("data-hl-on");
      }

      function jumpLink(i, text) {
        var b = h("button", { class: "epx-link epx-inline", type: "button", text: text });
        b.addEventListener("click", function () { pause(); go(i); });
        return b;
      }

      /* ---------- highlighting ---------- */
      var cur = { targets: [], outside: 0 }; // per-render: the call's points, and matches found outside the call

      function hlSpan(k, text, inCall) {
        if (!inCall) cur.outside++;
        return h("span", { class: "epx-hl hl-" + (k % 3), "data-hl": String(k), text: text });
      }
      // Text with every "x, y" pair that matches a call point wrapped in that point's highlight.
      function hlText(text, inCall) {
        var out = [];
        var pos = 0;
        if (cur.targets.length) {
          pairsIn(text).forEach(function (p) {
            var k = matchIndex(cur.targets, p.x, p.y);
            if (k < 0) return;
            out.push(text.slice(pos, p.at));
            out.push(hlSpan(k, text.slice(p.at, p.at + p.len), inCall));
            pos = p.at + p.len;
          });
        }
        out.push(text.slice(pos));
        return out;
      }
      function hlXYZ(v) {
        var k = cur.targets.length ? matchIndex(cur.targets, v[0], v[1]) : -1;
        return k < 0 ? fmtXYZ(v) : hlSpan(k, fmtXYZ(v), false);
      }

      /* ---------- Sees: tool message line, then the observation ---------- */
      function renderSeesHead(t, i) {
        var o = t.obs || {};
        seesHead.textContent = "";
        var line;
        if (i === 0 || o.prev_result == null) {
          line = h("div", { class: "epx-msgline" }, [roleTag("user"), " observation: the first message after the system prompt (no tool message on turn 1)"]);
        } else {
          var p = turns[i - 1];
          line = h("div", { class: "epx-msgline" }, [
            roleTag("tool"), " result of ", jumpLink(i - 1, "turn " + p.turn + "'s " + p.tool.name),
            o.prev_is_error ? h("span", { class: "epx-err", text: " (flagged as an error)" }) : null,
            ", then ", roleTag("user"), " observation, with no model turn in between",
          ]);
        }
        seesHead.appendChild(colHead("Sees", [h("span", { class: "epx-cmeta" }, [
          "t = ", h("b", { text: t.t_start.toFixed(1) + " s" }), " of " + data.episode_s.toFixed(1) + " s",
          t.tokens_in != null ? " · " + fmtInt(t.tokens_in) + " tokens in context" : null,
        ])]));
        seesHead.appendChild(line);
      }

      function detLine(d, list) {
        var cam = CAM_SHORT[d.cam] || d.cam.replace("_", " ");
        if (d.none) return h("li", { class: "epx-det-none" }, [h("span", { class: "epx-dcam", text: cam }), h("span", { class: "epx-muted", text: "no detections" })]);
        var meas = [];
        if (d.centroid) {
          meas.push("centroid ", hlXYZ(d.centroid), " m");
          if (d.top_z != null) meas.push(" · top_z " + d.top_z.toFixed(3));
          if (d.spans) meas.push(" · " + d.spans.map(function (v) { return (v * 1000).toFixed(0); }).join("×") + " mm");
        } else meas.push(h("span", { class: "epx-muted", text: "2D box only (no depth)" + (d.bbox ? " · px <" + d.bbox.join(",") + ">" : "") }));
        // Two queries can resolve to one object: note it once, on the later of the twins.
        var twins = d.centroid ? list.slice(0, list.indexOf(d)).filter(function (e) {
          return !e.none && e.cam === d.cam && e.centroid && sameList(e.centroid, d.centroid);
        }) : [];
        return h("li", {}, [
          h("div", { class: "epx-dtop" }, [
            h("span", { class: "epx-dcam", text: cam }),
            h("span", { class: "epx-dq", text: "#" + d.id + " " + d.query }),
            d.conf != null ? h("span", { class: "epx-muted", text: "conf " + d.conf.toFixed(2) }) : null,
          ]),
          h("div", { class: "epx-dmeas" }, meas),
          twins.length ? h("div", { class: "epx-dnote", text: "same centroid as " + twins.map(function (e) { return "#" + e.id + " “" + e.query + "”"; }).join(", ") + " above: both queries matched one object" }) : null,
        ]);
      }

      function renderPerception(t, i) {
        var o = t.obs || {};
        var kids = [];
        var q = t.queries || [];
        var pq = i > 0 ? turns[i - 1].queries || [] : [];
        if (!q.length) kids.push(h("div", { class: "epx-empty", text: "No queries yet: raw RGB only." }));
        else {
          kids.push(h("div", { class: "epx-chips" }, q.map(function (s) {
            return h("span", { class: "epx-chip" + (i > 0 && pq.indexOf(s) < 0 ? " new" : ""), text: s });
          })));
          var st = [];
          if (o.perception_generation != null) st.push("query generation " + o.perception_generation);
          if (t.perception_status) st.push("status " + t.perception_status);
          if (i > 0 && !sameList(q, pq)) st.push("set by turn " + turns[i - 1].turn + "'s " + turns[i - 1].tool.name + ", first run on this snapshot");
          if (st.length) kids.push(h("div", { class: "epx-small epx-muted", text: st.join(" · ") }));
        }
        // Wrist detections carry metric depth; show those (only the ones the call uses, when it uses any),
        // and fold the rest (overview 2D boxes, unused detections) behind "+ N more".
        var all = t.detections || [];
        var wrist = all.filter(function (d) { return d.cam !== "overview"; });
        var used = wrist.filter(function (d) { return d.centroid && cur.targets.length && matchIndex(cur.targets, d.centroid[0], d.centroid[1]) >= 0; });
        var primary = used.length ? wrist.filter(function (d) { return d.none || used.indexOf(d) >= 0; }) : wrist;
        var rest = all.filter(function (d) { return primary.indexOf(d) < 0; });
        if (all.length) {
          if (primary.length) kids.push(h("ul", { class: "epx-dets" }, primary.map(function (d) { return detLine(d, all); })));
          if (rest.length) {
            var n = rest.filter(function (d) { return !d.none; }).length;
            var label = n ? "+ " + n + " more" + (rest.length > n ? " (and empty views)" : "") : "+ empty views";
            kids.push(details(label, [h("ul", { class: "epx-dets" }, rest.map(function (d) { return detLine(d, all); }))]));
          }
        }
        var comp = o.compass || {};
        var ck = Object.keys(comp);
        if (ck.length) {
          kids.push(details("Orientation notes sent with the wrist images", ck.map(function (c) {
            return h("div", { class: "epx-state" }, [h("b", { text: c.replace("_", " ") }), " " + comp[c]]);
          })));
        }
        return block("Perception", kids);
      }

      function renderArms(t) {
        var o = t.obs || {};
        var kids = [];
        ["left", "right"].forEach(function (a) {
          var s = t.state && t.state[a];
          if (!s) return;
          kids.push(h("div", { class: "epx-state" }, [
            h("b", { text: a }),
            "tcp ", hlXYZ(s.tcp), " m · jaws " + s.aperture_mm.toFixed(1) + " mm",
            h("div", { class: "epx-pose", text: s.pose_words + " · last commanded grip: " + (s.prev_grip || "none") }),
          ]));
        });
        var budget = [];
        if (o.turn_budget) budget.push("turn " + o.turn_budget[0] + " of " + o.turn_budget[1]);
        if (o.env_steps) budget.push(o.env_steps[0] + " of " + o.env_steps[1] + " robot steps used (" + (o.env_steps[1] - o.env_steps[0]) + " left)");
        if (budget.length) kids.push(h("div", { class: "epx-small epx-muted", text: "Budget: " + budget.join(" · ") }));
        if (!kids.length) kids.push(h("div", { class: "epx-empty", text: "not reported" }));
        return block("Arms", kids);
      }

      function todoList(items, cls) {
        if (!items || !items.length) return h("div", { class: "epx-empty", text: "(empty)" });
        var ol = h("ol", { class: "epx-todo" + (cls ? " " + cls : "") });
        items.forEach(function (s) { ol.appendChild(h("li", {}, hlText(s, false))); });
        return ol;
      }

      function renderTodo(t, i) {
        var changed = i > 0 && !sameList(turns[i - 1].todo_before, t.todo_before);
        return block("Todo", [
          todoList(t.todo_before, changed ? "changed" : null),
          changed ? h("div", { class: "epx-small epx-carry", text: "updated by turn " + turns[i - 1].turn + "'s " + turns[i - 1].tool.name }) : null,
        ]);
      }

      function renderSees(t, i) {
        thumbs.forEach(function (x, k) {
          x.img.src = base + t.image;
          x.btn.setAttribute("aria-label", "Enlarge turn " + t.turn + "'s " + VIEWS[k] + " image" + (t.overlays ? " (with segmentation masks and numbered boxes)" : ""));
        });
        renderSeesHead(t, i);
        seesBody.textContent = "";
        seesBody.appendChild(renderPerception(t, i));
        seesBody.appendChild(renderArms(t));
        seesBody.appendChild(renderTodo(t, i));
      }

      /* ---------- Does: the call in compact form ---------- */
      function argText(c) {
        return Object.keys(c).filter(function (k) { return k !== "arm"; }).map(function (k) {
          return k + "=" + (typeof c[k] === "string" ? JSON.stringify(c[k]) : String(c[k]));
        }).join(" ");
      }

      // Plain-text lines for the timeline preview.
      function callLines(tool) {
        var inp = tool.input || {};
        if (inp.commands) return inp.commands.map(function (c) { return (c.arm ? c.arm + "  " : "") + argText(c); });
        if (inp.queries) return inp.queries.map(function (s) { return JSON.stringify(s); });
        if (inp.items) return inp.items.map(function (s, k) { return k + 1 + ". " + (s.length > 72 ? s.slice(0, 70) + "…" : s); });
        if (tool.name === "done") return ["outcome=" + inp.outcome];
        return Object.keys(inp).map(function (k) { return k + "=" + JSON.stringify(inp[k]); });
      }

      function renderCall(tool) {
        var inp = tool.input || {};
        var kids = [h("div", { class: "epx-callname" }, [toolChip(tool.name)])];
        if (inp.commands) {
          kids.push(h("div", { class: "epx-cmds" }, inp.commands.map(function (c) {
            var parts = [];
            Object.keys(c).filter(function (k) { return k !== "arm"; }).forEach(function (k) {
              if (k === "x" && tool.name === "move_to" && typeof c.y === "number") {
                var m = matchIndex(cur.targets, c.x, c.y);
                parts.push(m >= 0 ? hlSpan(m, "x=" + c.x + " y=" + c.y, true) : "x=" + c.x + " y=" + c.y, " ");
              } else if (!(k === "y" && tool.name === "move_to" && typeof c.x === "number")) {
                parts.push(k + "=" + (typeof c[k] === "string" ? JSON.stringify(c[k]) : String(c[k])), " ");
              }
            });
            return h("div", { class: "epx-cmd" }, [h("span", { class: "epx-arm", text: c.arm || "" }), h("span", { class: "epx-args" }, parts)]);
          })));
        } else if (inp.queries) {
          kids.push(h("div", { class: "epx-chips" }, inp.queries.map(function (s) { return h("span", { class: "epx-chip new", text: s }); })));
        } else if (inp.items) {
          var ol = h("ol", { class: "epx-todo changed" });
          inp.items.forEach(function (s) { ol.appendChild(h("li", {}, hlText(s, true))); });
          kids.push(ol);
        } else if (tool.name === "done") {
          kids.push(h("div", { class: "epx-cmd plain" }, [h("span", { class: "epx-args", text: "outcome=" + inp.outcome })]));
          if (inp.summary != null) kids.push(h("p", { class: "epx-summary" }, [h("span", { class: "epx-muted", text: "summary: " }), inp.summary]));
        } else {
          Object.keys(inp).forEach(function (k) { kids.push(h("div", { class: "epx-cmd plain" }, [h("span", { class: "epx-args", text: k + "=" + JSON.stringify(inp[k]) })])); });
        }
        return h("div", { class: "epx-call" }, kids);
      }

      /* ---------- Gets back: returned text + one-line harness log ---------- */
      function harnessLine(t) {
        var r = t.report;
        if (r.kind === "motion") {
          var crit = {};
          (r.criteria || []).forEach(function (c) { crit[c.channel] = c; });
          var arms = Object.keys(r.summary).map(function (a) {
            var p = crit[a + ".position"];
            var o = crit[a + ".orientation"];
            var err = [p ? fmtNum(p.error, p.unit) : null, o ? fmtNum(o.error, o.unit) : null].filter(Boolean).join(" / ");
            return a + " " + r.summary[a] + (err ? " " + err : "");
          });
          return arms.join(" · ") + (r.hold_s != null ? " · " + r.hold_s.toFixed(1) + " s" : "");
        }
        if (r.kind === "gripper") {
          var bits = [r.outcome + (r.cause ? " (" + r.cause + ")" : "")];
          Object.keys(r.arms).forEach(function (a) { bits.push(a + " stopped at " + r.arms[a].measured_mm.toFixed(1) + " mm"); });
          return bits.join(" · ");
        }
        return "no robot motion";
      }

      function harnessLog(t, i) {
        var r = t.report;
        var kids = [];
        var bits;
        kids.push(h("p", { class: "epx-note", text: "act " + t.tool_s.toFixed(1) + " s" }));
        if (r.kind === "motion") {
          var arms = h("div", { class: "epx-arms" });
          Object.keys(r.summary).forEach(function (a) {
            arms.appendChild(h("span", { class: "epx-badge " + outcomeClass(r.summary[a]), text: a + ": " + r.summary[a] }));
          });
          kids.push(arms);
          kids.push(table(["criterion", "status", "error / tol"], r.criteria.map(function (c) {
            return h("tr", {}, [
              h("td", { text: c.channel }),
              h("td", { class: "st-" + c.status, text: c.status }),
              h("td", { text: fmtNum(c.error, c.unit) + " / " + fmtNum(c.tol, c.unit) }),
            ]);
          })));
          bits = [];
          if (r.outcome) bits.push("overall " + r.outcome);
          if (r.route) bits.push("route " + r.route);
          bits.push("execution " + r.execution, "motion observed: " + r.observed_motion, "at rest: " + r.rest_confirmed);
          if (r.hold_s != null) bits.push("move took " + r.hold_s.toFixed(1) + " s");
          if (r.inter_arm_skew_ms != null) bits.push("arm skew " + r.inter_arm_skew_ms.toFixed(0) + " ms");
          if (r.cause) bits.push("cause: " + r.cause);
          kids.push(h("p", { class: "epx-note", text: bits.join(" · ") }));
        } else if (r.kind === "gripper") {
          var ga = h("div", { class: "epx-arms" }, [
            h("span", { class: "epx-badge " + outcomeClass(r.outcome), text: r.outcome + (r.cause ? " (" + r.cause + ")" : "") }),
          ]);
          Object.keys(r.arms).forEach(function (a) {
            var v = r.arms[a];
            ga.appendChild(h("span", {
              class: "epx-badge neutral",
              text: a + ": stopped at " + v.measured_mm.toFixed(1) + " mm" + (v.goal != null ? " (goal " + v.goal + ", aperture " + v.measured + ")" : ""),
            }));
          });
          kids.push(ga);
          kids.push(table(["criterion", "status", "error / tol"], r.criteria.map(function (c) {
            return h("tr", {}, [h("td", { text: c.channel }), h("td", { class: "st-" + c.status, text: c.status }), h("td", { text: c.error + " / " + c.tol })]);
          })));
          bits = [];
          if (r.execution) bits.push("execution " + r.execution);
          if (r.observed_motion) bits.push("motion observed: " + r.observed_motion);
          if (bits.length) kids.push(h("p", { class: "epx-note", text: bits.join(" · ") }));
          if (r.note) kids.push(h("p", { class: "epx-note epx-annot", text: "Our note: " + r.note }));
        } else {
          kids.push(h("p", { class: "epx-note", text: "No execution detail beyond the returned text: " + t.tool.name + " does not move the robot." }));
        }

        // Effects on queries / todo, only where the next observation does not already show them.
        var nx = i < N - 1 ? turns[i + 1] : null;
        if (!sameList(t.queries, t.queries_after) && !(nx && sameList(nx.queries, t.queries_after))) {
          kids.push(h("div", { class: "epx-state" }, [h("b", { text: "queries now set" })].concat((t.queries_after || []).map(function (s) {
            return h("span", { class: "epx-chip" + ((t.queries || []).indexOf(s) < 0 ? " new" : ""), text: s });
          }))));
        }
        if (!sameList(t.todo_before, t.todo_after) && !(nx && sameList(nx.todo_before, t.todo_after))) {
          kids.push(h("div", {}, [h("div", { class: "epx-note", text: "Todo list after this call:" }), todoList(t.todo_after, "changed")]));
        }
        var sum = h("span", { class: "epx-hsum" }, [h("span", { class: "epx-hlab", text: "Harness log, not sent to the agent: " }), harnessLine(t)]);
        return details(sum, kids, "epx-harness");
      }

      function renderGetsBack(t, i) {
        var r = t.report;
        var raw = r.agent_saw != null ? r.agent_saw : r.text;
        var nx = i < N - 1 ? turns[i + 1] : null;
        var sub = nx
          ? h("span", { class: "epx-csub" }, [roleTag("tool"), " message, arrives as ", jumpLink(i + 1, "turn " + nx.turn + "'s input")])
          : h("span", { class: "epx-csub" }, [roleTag("tool"), " message, the last one: the episode ends here"]);
        var kids = [];
        if (raw != null) {
          if (raw.length <= INLINE_RAW) kids.push(rawPre(raw));
          else kids.push(details("Returned text, verbatim (" + fmtInt(raw.length) + " characters of JSON)", [rawPre(raw)], "epx-rawdet"));
        }
        kids.push(harnessLog(t, i));
        if (!nx) {
          kids.push(h("div", { class: "epx-next epx-end" }, [
            h("span", { class: "epx-next-arrow", "aria-hidden": "true", text: "■" }),
            h("span", {}, ["Episode over: ended by ", h("code", { text: data.end_reason }), " · agent claimed " + data.agent_claim + " · judged "]),
            h("span", { class: "epx-pill " + (data.success ? "ok" : "bad"), text: data.success ? "success" : "failed" }),
          ]));
        }
        return h("div", { class: "epx-part p-back" }, [colHead("Gets back", [h("span", { class: "epx-cmeta", text: "act " + t.tool_s.toFixed(1) + " s" })]), sub].concat(kids));
      }

      function renderAct(t, i) {
        act.textContent = "";
        act.appendChild(h("div", { class: "epx-part p-think" }, [
          colHead("Thinks", [h("span", { class: "epx-cmeta", text: "think " + t.llm_s.toFixed(1) + " s · " + fmtInt(t.tokens_out) + " tokens out" })]),
          h("p", { class: "epx-reason" }, hlText(t.reasoning || "(no reasoning text)", false)),
        ]));
        var outsideBefore = cur.outside;
        var call = renderCall(t.tool);
        var pre = h("pre", { class: "epx-json" });
        pre.innerHTML = prettyJson({ tool: t.tool.name, input: t.tool.input });
        act.appendChild(h("div", { class: "epx-part p-does" }, [
          colHead("Does", [h("span", { class: "epx-cmeta", text: "one tool call" })]),
          call,
          outsideBefore ? h("p", { class: "epx-small epx-muted epx-hlnote" }, [
            "Highlighted x, y: within " + MATCH_M * 1000 + " mm of the same-colored values in what the agent sees or reasons. Hover one to link them.",
          ]) : null,
          details("Raw JSON, exactly as emitted", [pre], "epx-jsondet"),
        ]));
        act.appendChild(renderGetsBack(t, i));
      }

      /* ---------- image lightbox (same dialog styles as the page's video lightbox) ---------- */
      var LB = null;
      function lbEl() {
        if (LB) return LB;
        var x = h("button", { class: "lb-close", type: "button", "aria-label": "Close enlarged image" });
        x.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11"/></svg>';
        var img = h("img", { alt: "" });
        var crop = h("div", { class: "epx-crop" }, [img]);
        var title = h("span", { class: "epx-lbtitle" });
        var tabs = h("div", { class: "epx-lbtabs", role: "group", "aria-label": "Camera" });
        var vbtns = VIEWS.map(function (v, k) {
          var b = h("button", { class: "epx-btn", type: "button", text: v });
          b.addEventListener("click", function () { lbView(k); });
          tabs.appendChild(b);
          return b;
        });
        var note = h("p", { class: "epx-lbnote", text: data.image_note || "" });
        var fig = h("figure", { class: "epx-lbfig" }, [h("div", { class: "epx-lbhead" }, [title, tabs]), crop, note]);
        var stage = h("div", { class: "lb-stage" }, [fig]);
        var d = h("dialog", { class: "lb epx-lb", "aria-modal": "true", "aria-label": "Enlarged camera image" }, [x, stage]);
        x.addEventListener("click", function () { d.close(); });
        d.addEventListener("click", function (e) { if (e.target === d || e.target === stage) d.close(); });
        d.addEventListener("keydown", function (e) {
          if (e.key === "ArrowRight") { e.preventDefault(); lbView((LB.k + 1) % VIEWS.length); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); lbView((LB.k + VIEWS.length - 1) % VIEWS.length); }
        });
        d.addEventListener("close", function () {
          document.documentElement.classList.remove("lb-open");
          if (LB.from && LB.from.focus && document.contains(LB.from)) LB.from.focus({ preventScroll: true });
        });
        document.body.appendChild(d);
        LB = { d: d, x: x, img: img, title: title, vbtns: vbtns, k: 0, from: null };
        return LB;
      }
      function lbView(k) {
        var t = turns[state.i];
        LB.k = k;
        LB.img.style.left = -100 * k + "%";
        LB.img.alt = "Turn " + t.turn + ", " + VIEWS[k] + " camera" + (t.overlays ? ", with segmentation masks and numbered boxes" : "");
        LB.title.textContent = "Turn " + t.turn + " · " + VIEWS[k];
        LB.vbtns.forEach(function (b, j) { b.setAttribute("aria-pressed", j === k ? "true" : "false"); });
      }
      function lbOpen(k, from) {
        if (typeof HTMLDialogElement !== "function" || !("showModal" in HTMLDialogElement.prototype)) {
          window.open(base + turns[state.i].image, "_blank");
          return;
        }
        pause();
        var L = lbEl();
        if (L.d.open) return;
        L.from = from;
        L.img.src = base + turns[state.i].image;
        lbView(k);
        document.documentElement.classList.add("lb-open");
        L.d.showModal();
        L.x.focus();
      }

      function go(i) {
        i = Math.max(0, Math.min(N - 1, i));
        state.i = i;
        var t = turns[i];
        segs.forEach(function (s, j) {
          s.setAttribute("aria-current", j === i ? "true" : "false");
          s.setAttribute("aria-selected", j === i ? "true" : "false");
        });
        turnLabel.textContent = "";
        turnLabel.appendChild(h("span", {}, ["Turn ", h("b", { text: String(t.turn) }), " of " + N]));
        turnLabel.appendChild(toolChip(t.tool.name));
        turnLabel.appendChild(h("span", { class: "epx-small", text: "t = " + t.t_start.toFixed(1) + " s" }));
        cur = { targets: targetsOf(t.tool), outside: 0 };
        root.removeAttribute("data-hl-on");
        renderSees(t, i);
        renderAct(t, i);
      }
      function next() { go(state.i + 1 >= N ? 0 : state.i + 1); }
      function prev() { go(state.i - 1); }
      function tick() {
        if (state.i >= N - 1) { pause(); return; }
        go(state.i + 1);
        state.timer = setTimeout(tick, PLAY_MS);
      }
      function play() {
        if (state.playing) return;
        state.playing = true;
        playBtn.textContent = "❚❚ Pause";
        playBtn.setAttribute("aria-label", "Pause");
        if (state.i >= N - 1) go(0);
        state.timer = setTimeout(tick, reduced ? PLAY_MS * 1.5 : PLAY_MS);
      }
      function pause() {
        state.playing = false;
        clearTimeout(state.timer);
        playBtn.textContent = "▶ Play";
        playBtn.setAttribute("aria-label", "Play");
      }

      api.go = go; api.next = next; api.prev = prev; api.play = play; api.pause = pause;
      api.destroy = function () {
        pause();
        root.removeEventListener("keydown", onKey);
        root.removeEventListener("mouseover", onHl);
        root.removeEventListener("mouseout", onHl);
        if (ro) ro.disconnect(); else window.removeEventListener("resize", fitSegs);
        if (LB && LB.d.parentNode) { if (LB.d.open) LB.d.close(); LB.d.parentNode.removeChild(LB.d); }
        root.textContent = "";
      };
      go(0);
      fitSegs();
    }
  }

  window.mountEpisodeExplorer = mount;
})();
