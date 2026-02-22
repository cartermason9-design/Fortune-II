// live-rank-widget.js (ES module) — v2.1
// ✅ SAME UI, just scaled down ~30%
// ✅ X button works reliably
// ✅ Keeps draggable + persist pos/visibility
// ✅ No bold text

const STYLE_ID = "lrWidgetStyles-v2";
const WIDGET_ID = "lrWidget-v2";
const POS_KEY = "LR_POS_V2";
const VIS_KEY = "LR_VIS_V2";

const SCALE = 0.85; // ~30% smaller

const $ = (s, r = document) => r.querySelector(s);

function fmtMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getState() {
  try {
    return window.PROFILE_API?.getState?.() || null;
  } catch {
    return null;
  }
}

// ===== rank logic (match your profile script) =====
const RANKS = [
  "Bronze I",
  "Bronze II",
  "Bronze III",
  "Bronze IV",
  "Silver I",
  "Silver II",
  "Silver III",
  "Silver IV",
  "Gold I",
  "Gold II",
  "Gold III",
  "Gold IV",
  "Diamond I",
  "Diamond II",
  "Diamond III",
  "Diamond IV",
  "Legendary I",
  "Legendary II",
  "Legendary III",
  "Legendary IV",
  "Master",
  "Master Better",
  "Radiant",
];

function rankColor(name) {
  const n = String(name || "");
  if (n.startsWith("Bronze")) return "#b87333";
  if (n.startsWith("Silver")) return "#c7d0d9";
  if (n.startsWith("Gold")) return "#ffd34d";
  if (n.startsWith("Diamond")) return "#46e0ff";
  if (n.startsWith("Legendary")) return "#ff7a2f";
  if (n === "Master") return "#b04dff";
  if (n === "Master Better") return "#ff4d6d";
  if (n === "Radiant") return "#00ffcc";
  return "#ff4d6d";
}

const RANK_BASE = 350;
const RANK_GROWTH = 1.38;

function buildRankThresholds() {
  const thresholds = [0];
  let acc = 0;
  for (let i = 1; i < RANKS.length; i++) {
    const stepNeed = Math.round(RANK_BASE * Math.pow(RANK_GROWTH, i - 1));
    acc += stepNeed;
    thresholds.push(acc);
  }
  return thresholds;
}
const TH = buildRankThresholds();

function computeRank(totalWagered) {
  const tw = Math.max(0, Number(totalWagered) || 0);

  let idx = 0;
  for (let i = 0; i < TH.length; i++) {
    if (tw >= TH[i]) idx = i;
    else break;
  }
  idx = Math.max(0, Math.min(RANKS.length - 1, idx));

  const cur = RANKS[idx];
  const next = idx < RANKS.length - 1 ? RANKS[idx + 1] : null;

  const curStart = TH[idx];
  const nextStart = next ? TH[idx + 1] : curStart;

  const span = Math.max(1, nextStart - curStart);
  const prog = next ? Math.max(0, Math.min(1, (tw - curStart) / span)) : 1;
  const pct = next ? Math.round(prog * 100) : 100;

  return {
    cur,
    next: next || "Max rank",
    total: tw,
    needed: nextStart,
    pct,
    color: rankColor(cur),
  };
}

// ===== UI =====
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    .lrV2{
      position: fixed;
      left: 24px;
      top: 24px;
      width: 460px; /* original logical size (scaled via transform) */
      max-width: calc(100vw - 48px);
      border-radius: 14px;
      background: #1a2f3a; /* solid */
      box-shadow: 0 18px 60px rgba(0,0,0,.45);
      overflow: hidden;
      z-index: 2147483647;
      user-select: none;

      /* ✅ scale down without changing layout */
      transform: scale(${SCALE});
      transform-origin: top left;
    }
    .lrV2Hidden{ display:none !important; }

    .lrTop{
      height: 44px;
      background: rgba(255,255,255,.06);
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding: 0 10px 0 14px;
      cursor: grab;
    }
    .lrTop:active{ cursor: grabbing; }

    .lrTitle{
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 500;
      font-size: 16px;
      color: rgba(255,255,255,.92);
      letter-spacing: .2px;
    }

    .lrBtn{
      width: 30px;
      height: 30px;
      border-radius: 10px;
      border: 0;
      background: transparent;
      color: rgba(255,255,255,.86);
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:center;
      transition: background .12s ease, transform .12s ease;
      pointer-events: auto; /* ✅ ensure clickable */
    }
    .lrBtn:hover{ background: rgba(255,255,255,.08); }
    .lrBtn:active{ transform: translateY(1px); }
    .lrBtn svg{ width: 18px; height: 18px; display:block; }

    .lrBody{
      padding: 14px;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 500;
      color: rgba(182,210,227,.92);
    }

    .lrGrid{
      display:flex;
      justify-content:space-between;
      gap: 16px;
    }
    .lrBlock{ min-width: 160px; }
    .lrLabel{
      color: rgba(255,255,255,.92);
      font-size: 14px;
      font-weight: 500;
      letter-spacing: .2px;
    }
    .lrVal{
      color: rgba(182,210,227,.92);
      font-size: 18px;
      font-weight: 500;
      margin-top: 6px;
    }

    .lrBar{
      margin-top: 14px;
      height: 12px;
      border-radius: 999px;
      background: rgba(22,37,45,.95);
      overflow:hidden;
    }
    .lrFill{
      height: 100%;
      width: 0%;
      border-radius: 999px;
      transition: width .16s ease;
    }
    .lrRanks{
      margin-top: 10px;
      display:flex;
      justify-content:space-between;
      font-size: 16px;
      font-weight: 500;
      letter-spacing: .2px;
    }
  `;
  document.head.appendChild(st);
}

function clampToViewport(x, y, el) {
  // Because the element is scaled, its visual size = rect * SCALE.
  // getBoundingClientRect() already returns the *visual* (scaled) size -> perfect for clamping.
  const r = el.getBoundingClientRect();
  const pad = 10;
  const maxX = Math.max(pad, window.innerWidth - r.width - pad);
  const maxY = Math.max(pad, window.innerHeight - r.height - pad);
  return {
    x: Math.max(pad, Math.min(maxX, x)),
    y: Math.max(pad, Math.min(maxY, y)),
  };
}

function createWidget() {
  injectStyles();

  let el = document.getElementById(WIDGET_ID);
  if (el) return el;

  el = document.createElement("div");
  el.id = WIDGET_ID;
  el.className = "lrV2 lrV2Hidden";
  el.innerHTML = `
    <div class="lrTop" id="lrTopV2">
      <div class="lrTitle">Live Rank</div>
      <button class="lrBtn" id="lrCloseV2" type="button" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="lrBody">
      <div class="lrGrid">
        <div class="lrBlock">
          <div class="lrLabel">Total Wagered:</div>
          <div class="lrVal" id="lrTotalV2">0.00</div>

          <div style="height:12px;"></div>

          <div class="lrLabel">Percent:</div>
          <div class="lrVal" id="lrPctV2">0%</div>
        </div>

        <div class="lrBlock" style="text-align:right;">
          <div class="lrLabel">Total Needed:</div>
          <div class="lrVal" id="lrNeedV2">0.00</div>
        </div>
      </div>

      <div class="lrBar">
        <div class="lrFill" id="lrFillV2"></div>
      </div>

      <div class="lrRanks">
        <div id="lrLeftV2">—</div>
        <div id="lrRightV2">—</div>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  const top = $("#lrTopV2", el);
  const closeBtn = $("#lrCloseV2", el);

  function applyPos(x, y, save = true) {
    const c = clampToViewport(x, y, el);
    el.style.left = `${c.x}px`;
    el.style.top = `${c.y}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    if (save) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(c));
      } catch {}
    }
  }

  // restore pos
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y))
        applyPos(p.x, p.y, false);
    }
  } catch {}

  // drag (adjust for scale so it tracks the cursor correctly)
  let dragging = false,
    dx = 0,
    dy = 0;

  top.addEventListener("pointerdown", (e) => {
    // ✅ don't start dragging if user pressed the close button
    if (closeBtn && (e.target === closeBtn || closeBtn.contains(e.target)))
      return;

    dragging = true;
    const r = el.getBoundingClientRect();
    dx = e.clientX - r.left;
    dy = e.clientY - r.top;
    top.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  top.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    // dx/dy are already in screen px, rect is scaled, so this stays correct.
    applyPos(e.clientX - dx, e.clientY - dy);
  });

  top.addEventListener("pointerup", () => {
    dragging = false;
  });
  top.addEventListener("pointercancel", () => {
    dragging = false;
  });

  // ✅ X works (no drag capture stealing it)
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    el.classList.add("lrV2Hidden");
    try {
      localStorage.setItem(VIS_KEY, "0");
    } catch {}
  });

  // update loop
  const totalEl = $("#lrTotalV2", el);
  const needEl = $("#lrNeedV2", el);
  const pctEl = $("#lrPctV2", el);
  const fillEl = $("#lrFillV2", el);
  const lEl = $("#lrLeftV2", el);
  const rEl = $("#lrRightV2", el);

  let last = "";
  function tick() {
    const st = getState();
    const tw = Number(st?.totalWagered) || 0;
    const rk = computeRank(tw);
    const sig = `${rk.cur}|${rk.next}|${rk.pct}|${rk.total}|${rk.needed}|${rk.color}`;
    if (sig !== last) {
      last = sig;
      totalEl.textContent = fmtMoney2(rk.total);
      needEl.textContent = fmtMoney2(rk.needed);
      pctEl.textContent = `${rk.pct}%`;
      fillEl.style.width = `${rk.pct}%`;
      fillEl.style.background = rk.color;
      lEl.textContent = rk.cur;
      rEl.textContent = rk.next;
      lEl.style.color = rk.color;
      rEl.style.color = rk.color;
    }
    el.__raf = requestAnimationFrame(tick);
  }
  el.__raf = requestAnimationFrame(tick);

  window.addEventListener("resize", () => {
    const r = el.getBoundingClientRect();
    applyPos(r.left, r.top);
  });

  el.__show = () => {
    el.classList.remove("lrV2Hidden");
    try {
      localStorage.setItem(VIS_KEY, "1");
    } catch {}
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      applyPos(r.left, r.top);
    });
  };

  return el;
}

function boot() {
  injectStyles();

  // restore visibility
  try {
    if (localStorage.getItem(VIS_KEY) === "1") {
      createWidget().__show?.();
    }
  } catch {}

  // open on event (NO guessing)
  window.addEventListener("PROFILE:OPEN_LIVE_RANK", () => {
    createWidget().__show?.();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
