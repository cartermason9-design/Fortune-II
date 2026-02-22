// live-stats.js (ES module) — v5
// FIX: Profit + graph reset each refresh EVEN with profile balance sync.
// Key fixes:
// 1) Singleton guard + cleanup so old versions stop running.
// 2) Baseline "settle" window: wait for initial balance sync.
// 3) If a big balance jump happens early (and no bets yet), treat it as initial sync → reset baseline.
// Profit = Balance - startBalance (startBalance = settled balance on this page load)

const $ = (s, r = document) => r.querySelector(s);

const STYLE_ID = "live-stats-styles-v5";
const UI_ID = "liveStatsRoot-v5";
const BTN_ID = "liveStatsBtn-v5";

// ---- singleton guard (kills older instances) ----
(function killOlder() {
  try {
    if (window.__LIVE_STATS_SINGLETON__?.cleanup) {
      window.__LIVE_STATS_SINGLETON__.cleanup();
    }
  } catch {}
  window.__LIVE_STATS_SINGLETON__ = { cleanup: null };
})();

const ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M21 21H6.2C5.07989 21 4.51984 21 4.09202 20.782C3.71569 20.5903 3.40973 20.2843 3.21799 19.908C3 19.4802 3 18.9201 3 17.8V3M7 15L12 9L16 13L21 7"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
</svg>
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    .lsBtn{
      position:absolute;
      left: 14px;
      bottom: 14px;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 0;
      background: none;
      box-shadow: none;
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      user-select:none;
      z-index: 60;
      color: rgba(182,210,227,.62);
      transition: color .12s ease, transform .12s ease;
    }
    .lsBtn:hover{ color: rgba(255,255,255,.98); }
    .lsBtn:active{ transform: translateY(1px); }
    .lsBtn svg{ width: 22px; height: 22px; display:block; }

    .lsPanel{
      position:absolute;
      width: 270px;
      height: 520px;
      border-radius: 14px;
      background: #1a2f3a;
      box-shadow: 0 18px 50px rgba(0,0,0,.38);
      overflow:hidden;
      z-index: 80;
      pointer-events:auto;
      display:flex;
      flex-direction:column;
    }

    .lsHeader{
      height: 52px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding: 0 12px;
      gap: 10px;
      cursor: grab;
      user-select:none;
      background: #1c3340;
    }
    .lsHeader:active{ cursor: grabbing; }

    .lsTitleRow{ display:flex; align-items:center; gap: 10px; min-width: 0; }
    .lsTitleIcon{ width: 18px; height: 18px; color: rgba(182,210,227,.92); opacity: .9; }
    .lsTitle{
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 600;
      font-size: 14px;
      color: rgba(182,210,227,.98);
      letter-spacing: .2px;
      white-space: nowrap;
      overflow:hidden;
      text-overflow: ellipsis;
    }

    .lsClose{
      width: 36px;
      height: 36px;
      border-radius: 10px;
      border: 0;
      background: transparent;
      color: rgba(182,210,227,.85);
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:center;
      transition: background .12s ease, color .12s ease;
    }
    .lsClose:hover{
      background: rgba(255,255,255,.06);
      color: rgba(255,255,255,.98);
    }
    .lsClose svg{ width: 18px; height: 18px; display:block; }

    .lsBody{
      padding: 12px;
      display:flex;
      flex-direction:column;
      gap: 12px;
      flex: 1;
      min-height: 0;
    }

    .lsStatsCard{
      border-radius: 12px;
      background: #203a47;
      padding: 12px;
      display:grid;
      grid-template-columns: 1fr 10px 1fr;
      gap: 12px;
      align-items: stretch;
    }
    .lsDivider{ }

    .lsCol{ display:flex; flex-direction:column; gap: 10px; }
    .lsRow{ display:flex; flex-direction:column; gap: 6px; }

    .lsLabel{
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 600;
      font-size: 12px;
      color: rgba(159,190,208,.92);
      letter-spacing: .2px;
      user-select:none;
    }
    .lsVal{
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 700;
      font-size: 18px;
      color: rgba(182,210,227,.98);
      letter-spacing: .2px;
      user-select:none;
      line-height: 1.05;
    }
    .lsVal.good{ color: rgba(0,255,42,.95); }
    .lsVal.bad{ color: rgba(255,77,109,.95); }

    .lsGraphCard{
      border-radius: 12px;
      background: #203a47;
      padding: 10px;
      flex: 1;
      min-height: 0;
      display:flex;
    }

    .lsGraph{
      width: 100%;
      height: 100%;
      display:block;
      border-radius: 10px;
    }

    .lsHidden{ display:none !important; }
  `;
  document.head.appendChild(st);
}

function ensureLeftPanelPositioned() {
  const leftPanel = document.querySelector(".leftPanel");
  if (!leftPanel) return null;
  const cs = getComputedStyle(leftPanel);
  if (cs.position === "static") leftPanel.style.position = "relative";
  return leftPanel;
}

function money2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseBalanceText(text) {
  if (!text) return NaN;
  const m = String(text).match(/([-+]?\d[\d,]*\.\d{2})/);
  if (!m) return NaN;
  return Number(m[1].replace(/,/g, ""));
}

function getBetAmount() {
  const inp = document.getElementById("betAmount");
  if (!inp) return 0;
  const raw = String(inp.value || "").replace(/[^0-9.]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/* Smooth curve helper */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function buildUI() {
  injectStyles();

  const leftPanel = ensureLeftPanelPositioned();
  if (!leftPanel) return null;

  // remove any old roots/buttons from earlier versions
  try {
    document
      .querySelectorAll('[id^="liveStatsRoot-"]')
      .forEach((n) => n.remove());
    document
      .querySelectorAll('[id^="liveStatsBtn-"]')
      .forEach((n) => n.remove());
  } catch {}

  // icon-only toggle button
  const btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.className = "lsBtn";
  btn.type = "button";
  btn.innerHTML = ICON_SVG;
  leftPanel.appendChild(btn);

  // root holder
  const root = document.createElement("div");
  root.id = UI_ID;
  root.className = "lsHidden";
  root.style.position = "fixed";
  root.style.left = "0px";
  root.style.top = "0px";
  root.style.zIndex = "9999";
  root.style.pointerEvents = "none";

  root.innerHTML = `
    <div class="lsPanel" id="lsPanel">
      <div class="lsHeader" id="lsHeader">
        <div class="lsTitleRow">
          <div class="lsTitleIcon">${ICON_SVG}</div>
          <div class="lsTitle">Live Stats</div>
        </div>
        <button class="lsClose" id="lsClose" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="lsBody">
        <div class="lsStatsCard">
          <div class="lsCol">
            <div class="lsRow">
              <div class="lsLabel">Profit</div>
              <div class="lsVal" id="lsProfit">0.00</div>
            </div>
            <div class="lsRow">
              <div class="lsLabel">Wagered</div>
              <div class="lsVal" id="lsWagered">0.00</div>
            </div>
          </div>

          <div class="lsDivider"></div>

          <div class="lsCol">
            <div class="lsRow">
              <div class="lsLabel">Wins</div>
              <div class="lsVal good" id="lsWins">0</div>
            </div>
            <div class="lsRow">
              <div class="lsLabel">Losses</div>
              <div class="lsVal bad" id="lsLosses">0</div>
            </div>
          </div>
        </div>

        <div class="lsGraphCard">
          <canvas class="lsGraph" id="lsGraph"></canvas>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const panel = $("#lsPanel", root);
  const header = $("#lsHeader", root);
  const closeBtn = $("#lsClose", root);

  const elProfit = $("#lsProfit", root);
  const elWagered = $("#lsWagered", root);
  const elWins = $("#lsWins", root);
  const elLosses = $("#lsLosses", root);

  const graph = $("#lsGraph", root);
  const gctx = graph.getContext("2d");

  // position
  let pos = { x: 16, y: 16 };
  function setRootPos() {
    root.style.left = `${pos.x}px`;
    root.style.top = `${pos.y}px`;
  }
  setRootPos();

  function clampIntoViewport() {
    const r = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    pos.x = Math.max(8, Math.min(vw - r.width - 8, pos.x));
    pos.y = Math.max(8, Math.min(vh - r.height - 8, pos.y));
    setRootPos();
  }

  function openPanel() {
    root.classList.remove("lsHidden");
    clampIntoViewport();
    resizeGraph();
    drawGraph();
  }
  function closePanel() {
    root.classList.add("lsHidden");
  }

  btn.addEventListener("click", () => {
    if (root.classList.contains("lsHidden")) openPanel();
    else closePanel();
  });
  closeBtn.addEventListener("click", closePanel);

  // dragging
  let dragging = false;
  let dragOff = { x: 0, y: 0 };
  header.addEventListener("pointerdown", (e) => {
    if (e.target && e.target.closest?.("#lsClose")) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    dragOff.x = e.clientX - rect.left;
    dragOff.y = e.clientY - rect.top;
    header.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  header.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = panel.getBoundingClientRect();

    let nx = e.clientX - dragOff.x;
    let ny = e.clientY - dragOff.y;

    nx = Math.max(8, Math.min(vw - rect.width - 8, nx));
    ny = Math.max(8, Math.min(vh - rect.height - 8, ny));

    pos.x = nx;
    pos.y = ny;
    setRootPos();
  });
  header.addEventListener("pointerup", (e) => {
    dragging = false;
    try {
      header.releasePointerCapture?.(e.pointerId);
    } catch {}
  });

  const onWinResize = () => {
    if (!root.classList.contains("lsHidden")) {
      clampIntoViewport();
      resizeGraph();
      drawGraph();
    }
  };
  window.addEventListener("resize", onWinResize);

  // ----- STATE (session-only, should reset each refresh) -----
  const state = {
    startBalance: null, // baseline
    balance: 0,
    profit: 0,
    wagered: 0,
    wins: 0,
    losses: 0,
    profitSeries: [0],
    pending: false,
    pendingBet: 0,

    // baseline settle/sync handling
    bootT0: performance.now(),
    settleDeadline: performance.now() + 650, // wait ~650ms for profile sync
    lastSeenBalance: null,
    baselineLocked: false,
  };

  function setText() {
    elProfit.textContent = money2(state.profit);
    elWagered.textContent = money2(state.wagered);
    elWins.textContent = String(state.wins);
    elLosses.textContent = String(state.losses);

    elProfit.classList.toggle("good", state.profit > 0.000001);
    elProfit.classList.toggle("bad", state.profit < -0.000001);
  }

  function resizeGraph() {
    const rect = graph.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    graph.width = Math.max(1, Math.floor(rect.width * dpr));
    graph.height = Math.max(1, Math.floor(rect.height * dpr));
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawGraph() {
    const rect = graph.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    gctx.clearRect(0, 0, w, h);

    const pad = 14;
    const gx = pad;
    const gy = pad;
    const gw = Math.max(1, w - pad * 2);
    const gh = Math.max(1, h - pad * 2);

    const data = state.profitSeries;
    const n = data.length;

    let minV = Infinity;
    let maxV = -Infinity;
    for (const v of data) {
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    if (!Number.isFinite(minV)) minV = 0;
    if (!Number.isFinite(maxV)) maxV = 0;

    const span = Math.max(1e-6, maxV - minV);
    minV -= span * 0.12;
    maxV += span * 0.12;

    minV = Math.min(minV, 0);
    maxV = Math.max(maxV, 0);

    const xAt = (i) => gx + (i / Math.max(1, n - 1)) * gw;
    const yAt = (v) => {
      const t = (v - minV) / Math.max(1e-9, maxV - minV);
      return gy + (1 - t) * gh;
    };

    const y0 = yAt(0);

    gctx.strokeStyle = "rgba(182,210,227,0.20)";
    gctx.lineWidth = 2;
    gctx.beginPath();
    gctx.moveTo(gx, y0);
    gctx.lineTo(gx + gw, y0);
    gctx.stroke();

    if (n <= 1) return;

    const pts = data.map((v, i) => ({ x: xAt(i), y: yAt(v) }));

    const samples = [];
    const STEPS_PER_SEG = 14;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      for (let s = 0; s <= STEPS_PER_SEG; s++) {
        const t = s / STEPS_PER_SEG;
        const x = catmullRom(p0.x, p1.x, p2.x, p3.x, t);
        const y = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
        samples.push({ x, y });
      }
    }

    // GREEN fill above baseline
    gctx.fillStyle = "rgba(0,255,42,0.12)";
    gctx.beginPath();
    let started = false;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      const above = p.y < y0;
      if (above && !started) {
        started = true;
        gctx.moveTo(p.x, y0);
        gctx.lineTo(p.x, p.y);
      } else if (above && started) {
        gctx.lineTo(p.x, p.y);
      } else if (!above && started) {
        gctx.lineTo(p.x, y0);
        gctx.closePath();
        gctx.fill();
        gctx.beginPath();
        started = false;
      }
    }
    if (started) {
      const last = samples[samples.length - 1];
      gctx.lineTo(last.x, y0);
      gctx.closePath();
      gctx.fill();
    }

    // RED fill below baseline
    gctx.fillStyle = "rgba(255,77,109,0.12)";
    gctx.beginPath();
    started = false;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      const below = p.y > y0;
      if (below && !started) {
        started = true;
        gctx.moveTo(p.x, y0);
        gctx.lineTo(p.x, p.y);
      } else if (below && started) {
        gctx.lineTo(p.x, p.y);
      } else if (!below && started) {
        gctx.lineTo(p.x, y0);
        gctx.closePath();
        gctx.fill();
        gctx.beginPath();
        started = false;
      }
    }
    if (started) {
      const last = samples[samples.length - 1];
      gctx.lineTo(last.x, y0);
      gctx.closePath();
      gctx.fill();
    }

    // line segments
    gctx.lineWidth = 2.6;
    gctx.lineJoin = "round";
    gctx.lineCap = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const midY = (a.y + b.y) / 2;
      const isAbove = midY < y0;
      gctx.strokeStyle = isAbove
        ? "rgba(0,255,42,0.92)"
        : "rgba(255,77,109,0.92)";
      gctx.beginPath();
      gctx.moveTo(a.x, a.y);
      gctx.lineTo(b.x, b.y);
      gctx.stroke();
    }
  }

  function hardResetSessionBaseline(bal) {
    state.startBalance = bal;
    state.balance = bal;
    state.profit = 0;
    state.wagered = 0;
    state.wins = 0;
    state.losses = 0;
    state.pending = false;
    state.pendingBet = 0;
    state.profitSeries = [0];
    setText();
    if (!root.classList.contains("lsHidden")) {
      resizeGraph();
      drawGraph();
    }
  }

  function lockBaselineIfReady(now) {
    if (state.baselineLocked) return;
    if (state.lastSeenBalance == null) return;

    // wait for settle window so profile sync has time to apply
    if (now < state.settleDeadline) return;

    state.baselineLocked = true;
    hardResetSessionBaseline(state.lastSeenBalance);
  }

  // ---- Bet tracking ----
  let lossResolveTimer = null;
  function scheduleLossResolve() {
    clearTimeout(lossResolveTimer);
    lossResolveTimer = setTimeout(() => {
      if (!state.pending) return;
      state.losses += 1;
      state.pending = false;
      state.pendingBet = 0;
      setText();
    }, 2400);
  }
  function onBetDetected(bet) {
    state.wagered += bet;
    state.pending = true;
    state.pendingBet = bet;
    setText();
    scheduleLossResolve();
  }
  function resolveWin() {
    if (!state.pending) return;
    state.wins += 1;
    state.pending = false;
    state.pendingBet = 0;
    clearTimeout(lossResolveTimer);
    setText();
  }

  // ---- Balance updates from wsBalText ----
  function onBalanceChanged(newBal) {
    const now = performance.now();

    // record last seen balance continuously
    state.lastSeenBalance = newBal;

    // if baseline not locked yet, try to lock once settle window passes
    lockBaselineIfReady(now);

    // if locked, compute profit normally
    if (state.baselineLocked && state.startBalance != null) {
      const prevBal = state.balance;
      state.balance = newBal;

      // detect early "sync jump" right after load BEFORE any bets → treat as new baseline
      const early = now - state.bootT0 < 2200;
      const noSessionActions =
        state.wagered === 0 &&
        state.wins === 0 &&
        state.losses === 0 &&
        !state.pending;
      const bigJump =
        Number.isFinite(prevBal) && Math.abs(newBal - prevBal) >= 0.5;

      if (early && noSessionActions && bigJump) {
        // profile-login just applied the real persisted balance
        hardResetSessionBaseline(newBal);
        return;
      }

      state.profit = newBal - state.startBalance;
      state.profitSeries.push(state.profit);
      setText();
      if (!root.classList.contains("lsHidden")) drawGraph();
    } else {
      // baseline still settling: keep displayed profit at 0
      state.balance = newBal;
      state.profit = 0;
      state.profitSeries = [0];
      setText();
      if (!root.classList.contains("lsHidden")) drawGraph();
    }
  }

  // Observers
  const balMO = new MutationObserver(() => {
    const b = document.getElementById("wsBalText");
    if (!b) return;

    const newBal = parseBalanceText(b.textContent);
    if (!Number.isFinite(newBal) || newBal <= 0) return;

    // bet detection only when baseline locked
    if (state.baselineLocked && state.startBalance != null) {
      const prev = state.balance;
      const bet = getBetAmount();
      const drop = prev - newBal;

      if (
        !state.pending &&
        bet > 0 &&
        drop > 0.001 &&
        Math.abs(drop - bet) <= Math.max(0.02, bet * 0.005)
      ) {
        onBetDetected(bet);
      }
    }

    onBalanceChanged(newBal);
  });

  const popupMO = new MutationObserver(() => {
    const p = document.getElementById("wsWinPopup");
    if (!p) return;
    if (p.classList.contains("show")) resolveWin();
  });

  let mountIv = null;
  function mountObservers() {
    const b = document.getElementById("wsBalText");
    const p = document.getElementById("wsWinPopup");
    if (!b || !p) return false;

    const initBal = parseBalanceText(b.textContent);
    if (Number.isFinite(initBal) && initBal > 0) {
      state.lastSeenBalance = initBal;
      state.balance = initBal;
    }

    balMO.observe(b, { childList: true, subtree: true, characterData: true });
    popupMO.observe(p, { attributes: true, attributeFilter: ["class"] });

    // attempt baseline lock soon after
    const prime = () => {
      lockBaselineIfReady(performance.now());
      if (!state.baselineLocked) requestAnimationFrame(prime);
    };
    requestAnimationFrame(prime);

    return true;
  }

  if (!mountObservers()) {
    mountIv = setInterval(() => {
      if (mountObservers()) {
        clearInterval(mountIv);
        mountIv = null;
      }
    }, 80);
    setTimeout(() => {
      if (mountIv) clearInterval(mountIv);
      mountIv = null;
    }, 8000);
  }

  // initial render
  setText();
  resizeGraph();
  drawGraph();

  // cleanup hook for singleton
  const cleanup = () => {
    try {
      window.removeEventListener("resize", onWinResize);
    } catch {}
    try {
      balMO.disconnect();
    } catch {}
    try {
      popupMO.disconnect();
    } catch {}
    try {
      if (mountIv) clearInterval(mountIv);
    } catch {}
    try {
      clearTimeout(lossResolveTimer);
    } catch {}
    try {
      btn.remove();
    } catch {}
    try {
      root.remove();
    } catch {}
  };
  window.__LIVE_STATS_SINGLETON__.cleanup = cleanup;

  return { openPanel, closePanel, cleanup };
}

function boot() {
  const leftPanel = document.querySelector(".leftPanel");
  if (!leftPanel) return false;
  buildUI();
  return true;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
