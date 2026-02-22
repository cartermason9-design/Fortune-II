// wheel-stake.js (ES module) — v13 (MATCHES chance-bar v9)
// ✅ House edge is constant for ALL segments + difficulty
// ✅ High multis happen naturally when rare tiers are 1 slice at high segments
// ✅ Wheel uses INTEGER slice counts per tier (k/segments is exact)
// ✅ Multipliers use: m_i = RTP / (nWin * p_i)  => Σ(p_i*m_i) = RTP
//
// Keeps everything else the same:
// - payout determined by slice under the PIN
// - controls locking
// - profile balance sync/persistence behavior
// - Advanced autobet logic (ONLY when Advanced toggle ON)

const $ = (s, r = document) => r.querySelector(s);

const STYLE_ID = "wheel-stake-styles-v13";
const UI_ID = "wheelStakeRoot-v13";

const HOUSE_EDGE = 0.045;
const RTP = 1 - HOUSE_EDGE;

const DEFAULT_START_BALANCE = 1000;
const WS_BAL_STORE_PREFIX = "WS_WHEEL_BAL_V13_";

function wsGetProfileState() {
  try {
    if (!window.PROFILE_API) return null;
    if (typeof window.PROFILE_API.getState !== "function") return null;
    return window.PROFILE_API.getState();
  } catch {
    return null;
  }
}
function wsIsLoggedIn() {
  const st = wsGetProfileState();
  return !!st && !!st.loggedIn;
}
function wsProfileKey() {
  const st = wsGetProfileState();
  const id = st?.userId || "loggedin";
  return WS_BAL_STORE_PREFIX + String(id);
}
function wsReadSavedBalance() {
  try {
    if (!wsIsLoggedIn()) return null;
    const raw = localStorage.getItem(wsProfileKey());
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
function wsSaveBalance(n) {
  try {
    if (!wsIsLoggedIn()) return;
    localStorage.setItem(wsProfileKey(), String(n));
  } catch {}
}

const DIFF = {
  Low: { pills: 4, loseP: 0.52, steepness: 1.35 },
  Medium: { pills: 5, loseP: 0.6, steepness: 1.65 },
  High: { pills: 6, loseP: 0.7, steepness: 2.05 },
};

const PALETTE = [
  { arc: "#2a3b46" },
  { arc: "#00ff2a" },
  { arc: "#e9f6ff" },
  { arc: "#ffd400" },
  { arc: "#ff8a00" },
  { arc: "#7d3cff" },
];

const BET_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M9.4 7.53333C9.2 7.26667 8.8 7.26667 8.6 7.53333L6.225 10.7C6.09167 10.8778 6.09167 11.1222 6.225 11.3L8.6 14.4667C8.8 14.7333 9.2 14.7333 9.4 14.4667L11.775 11.3C11.9083 11.1222 11.9083 10.8778 11.775 10.7L9.4 7.53333Z" fill="#ffffff"></path>
  <path d="M4.09245 5.63868C4.03647 5.5547 4.03647 5.4453 4.09245 5.36133L4.79199 4.31202C4.89094 4.16359 5.10906 4.16359 5.20801 4.31202L5.90755 5.36132C5.96353 5.4453 5.96353 5.5547 5.90755 5.63867L5.20801 6.68798C5.10906 6.83641 4.89094 6.83641 4.79199 6.68798L4.09245 5.63868Z" fill="#ffffff"></path>
  <path d="M13.208 15.312C13.1091 15.1636 12.8909 15.1636 12.792 15.312L12.0924 16.3613C12.0365 16.4453 12.0365 16.5547 12.0924 16.6387L12.792 17.688C12.8909 17.8364 13.1091 17.8364 13.208 17.688L13.9075 16.6387C13.9635 16.5547 13.9635 16.4453 13.9075 16.3613L13.208 15.312Z" fill="#ffffff"></path>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M1 4C1 2.34315 2.34315 1 4 1H14C15.1323 1 16.1181 1.62732 16.6288 2.55337L20.839 3.68148C22.4394 4.11031 23.3891 5.75532 22.9603 7.35572L19.3368 20.8787C18.908 22.4791 17.263 23.4288 15.6626 23L8.19849 21H4C2.34315 21 1 19.6569 1 18V4ZM17 18V4.72339L20.3213 5.61334C20.8548 5.75628 21.1714 6.30461 21.0284 6.83808L17.405 20.361C17.262 20.8945 16.7137 21.2111 16.1802 21.0681L15.1198 20.784C16.222 20.3403 17 19.261 17 18ZM4 3C3.44772 3 3 3.44772 3 4V18C3 18.5523 3.44772 19 4 19H14C14.5523 19 15 18.5523 15 18V4C15 3.44772 14.5523 3 14 3H4Z" fill="#ffffff"></path>
</svg>
`;

function clampInt(n, a, b) {
  n = Number.isFinite(n) ? Math.floor(n) : a;
  return Math.max(a, Math.min(b, n));
}

function fmtMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtMult(m) {
  const x = Number(m);
  if (!Number.isFinite(x) || x <= 0) return "—";
  if (x >= 1e6) return `${Math.round(x).toLocaleString()}x`;
  return `${x.toFixed(2)}x`;
}

function readDropdownValue(ddId) {
  const dd = document.getElementById(ddId);
  if (!dd) return null;
  const v = dd.querySelector(".ddValue,[data-value]");
  return v ? v.textContent.trim() : null;
}
function readSegments() {
  const v = readDropdownValue("ddSegments");
  const n = parseInt(v || "30", 10);
  return clampInt(n, 10, 999);
}
function readDifficulty() {
  const v = readDropdownValue("ddDifficulty");
  return v && DIFF[v] ? v : "Medium";
}
function readBet() {
  const inp = document.getElementById("betAmount");
  if (!inp) return 0;
  const raw = String(inp.value || "").replace(/[^0-9.]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
function writeBet(n) {
  const inp = document.getElementById("betAmount");
  if (!inp) return;
  const x = Number(n);
  inp.value = Number.isFinite(x) ? x.toFixed(2) : "0.00";
  inp.dispatchEvent(new Event("input", { bubbles: true }));
}
function readNumBets() {
  const el = document.getElementById("numBets");
  if (!el) return 0;
  const v = String(el.value || "").trim();
  const n = parseInt(v || "0", 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getAdvancedSettings() {
  try {
    if (
      !window.WHEEL_ADV_API ||
      typeof window.WHEEL_ADV_API.getSettings !== "function"
    ) {
      return { enabled: false };
    }
    const s = window.WHEEL_ADV_API.getSettings();
    return s && typeof s === "object" ? s : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

// ---------- NEW: integer slice allocation (same as chance-bar v9) ----------
function allocateCountsForSegments(diffKey, segments) {
  const prof = DIFF[diffKey] || DIFF.Medium;
  const pills = prof.pills;
  const nWin = pills - 1;

  const loseP = Math.max(0.5, Math.min(0.9, prof.loseP));
  let loseCount = Math.round(loseP * segments);

  const minWinTotal = nWin; // 1 each
  if (segments - loseCount < minWinTotal) {
    loseCount = Math.max(0, segments - minWinTotal);
  }

  const minLoseCount = Math.ceil(0.5 * segments);
  if (segments - minLoseCount >= minWinTotal) {
    loseCount = Math.max(loseCount, minLoseCount);
  }

  let remaining = segments - loseCount;
  if (remaining < minWinTotal) {
    loseCount = Math.max(0, segments - minWinTotal);
    remaining = segments - loseCount;
  }

  const w = [];
  for (let i = 1; i <= nWin; i++) w.push(1 / Math.pow(i, prof.steepness));
  const wSum = w.reduce((a, b) => a + b, 0) || 1;

  const winRaw = w.map((wi) => (wi / wSum) * remaining);

  const winCounts = winRaw.map((x) => Math.floor(x));
  for (let i = 0; i < winCounts.length; i++)
    winCounts[i] = Math.max(1, winCounts[i]);

  let used = winCounts.reduce((a, b) => a + b, 0);

  if (used > remaining) {
    let extra = used - remaining;
    for (let i = 0; i < winCounts.length && extra > 0; i++) {
      const canTake = Math.max(0, winCounts[i] - 1);
      const take = Math.min(canTake, extra);
      winCounts[i] -= take;
      extra -= take;
    }
    used = winCounts.reduce((a, b) => a + b, 0);
  }

  if (used < remaining) {
    let need = remaining - used;
    const fracs = winRaw.map((x, i) => ({ i, f: x - Math.floor(x) }));
    fracs.sort((a, b) => b.f - a.f);
    for (let k = 0; k < need; k++) {
      winCounts[fracs[k % fracs.length].i] += 1;
    }
  }

  const counts = [loseCount, ...winCounts];

  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum !== segments) counts[0] += segments - sum;

  if (counts[counts.length - 1] < 1) {
    const donor = counts[0] > 1 ? 0 : 1;
    if (counts[donor] > 1) {
      counts[donor] -= 1;
      counts[counts.length - 1] += 1;
    } else {
      counts[counts.length - 1] = 1;
    }
  }

  return counts;
}

function payoutFromProb(pTier, nWin) {
  if (!(pTier > 0)) return 0;
  const n = Math.max(1, Number(nWin) || 1);
  const m = RTP / (n * pTier);
  return Number.isFinite(m) ? m : 0;
}

// ---------- old allocateCounts/buildProbs/payoutFromChance are NOT used anymore ----------

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    .wsRoot{ position:absolute; inset:0; pointer-events:none; z-index: 10; }

    .wsBalText{
      position:absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      pointer-events:none;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 700;
      font-size: 18px;
      color: rgba(182,210,227,.98);
      letter-spacing: .2px;
      user-select:none;
      z-index: 20;
      text-shadow: 0 2px 12px rgba(0,0,0,.25);
      white-space: nowrap;
    }

    .wsStage{
      position:absolute;
      left: 0; right: 0;
      top: 10px;
      bottom: 15px;
      display:flex;
      align-items:center;
      justify-content:center;
      pointer-events:none;
    }

    .wsStageInner{
      width: 100%;
      height: 100%;
      display:flex;
      align-items:center;
      justify-content:center;
      transform: none;
    }

    .wsWheelWrap{
      position:relative;
      width: min(1120px, 100%);
      height: min(1120px, 100%);
      aspect-ratio: 1 / 1;
      pointer-events:auto;
    }

    canvas.wsCanvas{ width:100%; height:100%; display:block; }

    .wsPointer{
      position:absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 54px;
      height: 66px;
      pointer-events:none;
      filter: drop-shadow(0 10px 16px rgba(0,0,0,.28));
      z-index: 10;
      top: 0;
    }

    .wsWinPopup{
      position:absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%) scale(0.75);
      width: 230px;
      height: 160px;
      border-radius: 18px;
      background: rgba(10, 26, 34, 0.55);
      box-shadow: inset 0 0 0 4px rgba(0, 255, 42, 0.95);
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap: 16px;
      opacity: 0;
      pointer-events:none;
      z-index: 12;
      transition: opacity .18s ease, transform .22s ease;
      will-change: opacity, transform;
    }
    .wsWinPopup.show{
      opacity: 1;
      transform: translate(-50%, -50%) scale(0.80);
    }
    .wsWinPopup.fade{
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.77);
      transition: opacity .30s ease, transform .30s ease;
    }
    .wsWinMult{
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 600;
      font-size: 34px;
      color: rgba(0,255,42,0.95);
      letter-spacing: .2px;
      user-select:none;
      line-height: 1;
    }
    .wsWinDivider{
      width: 120px;
      height: 6px;
      border-radius: 999px;
      background: rgba(57,85,101,.55);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
    }
    .wsWinAmt{
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 600;
      font-size: 26px;
      color: rgba(0,255,42,0.95);
      user-select:none;
      line-height: 1;
    }

    .wsBtnIcon{
      width: 23px;
      height: 23px;
      display:inline-block;
      vertical-align: middle;
    }
    .wsBtnRow{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap: 10px;
    }

    .wsCtlLocked{
      opacity: 0.55 !important;
      filter: saturate(0.85) !important;
      pointer-events: none !important;
      cursor: not-allowed !important;
    }
    .wsCtlLocked *{ cursor: not-allowed !important; }
  `;
  document.head.appendChild(st);
}

function buildUI() {
  injectStyles();

  const rightPanel = document.querySelector(".rightPanel");
  if (!rightPanel) return null;

  const rpStyle = getComputedStyle(rightPanel);
  if (rpStyle.position === "static") rightPanel.style.position = "relative";

  const existing = document.getElementById(UI_ID);
  if (existing) existing.remove();

  const root = document.createElement("div");
  root.className = "wsRoot";
  root.id = UI_ID;

  let initialBalance = DEFAULT_START_BALANCE;

  const st = wsGetProfileState();
  if (st && st.loggedIn && typeof st.balance !== "undefined") {
    initialBalance = Number(st.balance) || 0;
    wsSaveBalance(initialBalance);
  } else {
    const saved = wsReadSavedBalance();
    if (saved !== null) initialBalance = saved;
    else initialBalance = DEFAULT_START_BALANCE;
  }

  root.innerHTML = `
    <div class="wsBalText" id="wsBalText">Balance: ${fmtMoney2(
      initialBalance
    )}</div>

    <div class="wsStage">
      <div class="wsStageInner">
        <div class="wsWheelWrap" id="wsWheelWrap">
          <canvas class="wsCanvas" id="wsCanvas"></canvas>

          <svg class="wsPointer" id="wsPointer" viewBox="0 0 64 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M32 6c10 0 18 8 18 18 0 17-18 45-18 45S14 41 14 24c0-10 8-18 18-18z" fill="#ff4d6d"/>
            <circle cx="32" cy="24" r="10" fill="#ff7a93" opacity="0.95"/>
          </svg>

          <div class="wsWinPopup" id="wsWinPopup" aria-hidden="true">
            <div class="wsWinMult" id="wsWinMult">—</div>
            <div class="wsWinDivider"></div>
            <div class="wsWinAmt" id="wsWinAmt">—</div>
          </div>
        </div>
      </div>
    </div>
  `;

  rightPanel.appendChild(root);

  const wheelWrap = $("#wsWheelWrap");
  const pointer = $("#wsPointer");
  const canvas = $("#wsCanvas");
  const ctx = canvas.getContext("2d");
  const balText = $("#wsBalText");

  const winPopup = $("#wsWinPopup");
  const winMultEl = $("#wsWinMult");
  const winAmtEl = $("#wsWinAmt");

  const leftPanel = document.getElementById("leftPanel");
  const manualBtn = document.getElementById("manualBtn");
  const autoBtn = document.getElementById("autoBtn");
  const betAmountInput = document.getElementById("betAmount");
  const halfBtn = document.getElementById("halfBtn");
  const doubleBtn = document.getElementById("doubleBtn");
  const ddDifficulty = document.getElementById("ddDifficulty");
  const ddSegments = document.getElementById("ddSegments");
  const numBetsInput = document.getElementById("numBets");
  const advSwitch = document.getElementById("advSwitch");

  const placeBetBtn = document.getElementById("placeBet");
  const startAutobetBtn = document.getElementById("startAutobet");

  const PLACE_LABEL = placeBetBtn ? placeBetBtn.textContent : "Place Bet";
  const AUTO_START_LABEL = startAutobetBtn
    ? startAutobetBtn.textContent
    : "Start Autobet";

  let winHideTimer = null;
  let winFadeTimer = null;

  function hideWinPopupInstant() {
    clearTimeout(winHideTimer);
    clearTimeout(winFadeTimer);
    winPopup.classList.remove("show");
    winPopup.classList.remove("fade");
  }

  function showWinPopup(mult, winAmount) {
    hideWinPopupInstant();
    winMultEl.textContent = fmtMult(mult);
    winAmtEl.textContent = fmtMoney2(winAmount);
    winPopup.classList.add("show");

    winHideTimer = setTimeout(() => {
      winPopup.classList.add("fade");
      winFadeTimer = setTimeout(() => {
        winPopup.classList.remove("show");
        winPopup.classList.remove("fade");
      }, 300);
    }, 4000);
  }

  function setPlaceBtnSpinning(on) {
    if (!placeBetBtn) return;
    if (on) {
      placeBetBtn.innerHTML = `<span class="wsBtnRow"><span class="wsBtnIcon">${BET_ICON_SVG}</span></span>`;
      placeBetBtn.classList.add("wsCtlLocked");
      placeBetBtn.disabled = true;
    } else {
      placeBetBtn.classList.remove("wsCtlLocked");
      placeBetBtn.disabled = false;
      placeBetBtn.textContent = PLACE_LABEL;
    }
  }

  function setAutoBtnRunning(on) {
    if (!startAutobetBtn) return;
    if (on) {
      startAutobetBtn.innerHTML = `<span class="wsBtnRow"><span>Stop Autobet</span><span class="wsBtnIcon">${BET_ICON_SVG}</span></span>`;
    } else {
      startAutobetBtn.textContent = AUTO_START_LABEL;
    }
  }

  const prev = new WeakMap();
  function lockControl(el, on) {
    if (!el) return;
    if (!prev.has(el)) {
      prev.set(el, {
        disabled: "disabled" in el ? !!el.disabled : undefined,
        tab: el.getAttribute("tabindex"),
        aria: el.getAttribute("aria-disabled"),
      });
    }
    const p = prev.get(el);

    if (on) {
      el.classList.add("wsCtlLocked");
      if ("disabled" in el) el.disabled = true;
      el.setAttribute("aria-disabled", "true");
      el.setAttribute("tabindex", "-1");
    } else {
      el.classList.remove("wsCtlLocked");
      if ("disabled" in el) el.disabled = p.disabled;
      if (p.aria == null) el.removeAttribute("aria-disabled");
      else el.setAttribute("aria-disabled", p.aria);
      if (p.tab == null) el.removeAttribute("tabindex");
      else el.setAttribute("tabindex", p.tab);
    }
  }

  const LOCKABLES = [
    manualBtn,
    autoBtn,
    betAmountInput,
    halfBtn,
    doubleBtn,
    ddDifficulty,
    ddSegments,
    numBetsInput,
    advSwitch,
    placeBetBtn,
  ];

  function setControlsLocked(on, allowStopAutobet) {
    for (const el of LOCKABLES) lockControl(el, on);
    if (on) setPlaceBtnSpinning(true);
    else setPlaceBtnSpinning(false);

    if (startAutobetBtn) {
      const allowStop = !!on && !!allowStopAutobet;
      if (allowStop) {
        startAutobetBtn.classList.remove("wsCtlLocked");
        startAutobetBtn.disabled = false;
        startAutobetBtn.removeAttribute("aria-disabled");
        startAutobetBtn.removeAttribute("tabindex");
      } else {
        lockControl(startAutobetBtn, on);
      }
    }

    if (
      on &&
      leftPanel &&
      document.activeElement &&
      leftPanel.contains(document.activeElement)
    ) {
      document.activeElement.blur?.();
    }
  }

  let balance = initialBalance;
  let applyingFromProfile = false;

  function setBalance(v) {
    balance = Math.max(0, Number(v) || 0);
    balText.textContent = `Balance: ${fmtMoney2(balance)}`;

    if (
      !applyingFromProfile &&
      window.PROFILE_API &&
      typeof window.PROFILE_API.setBalance === "function"
    ) {
      window.PROFILE_API.setBalance(balance);
    }

    if (wsIsLoggedIn()) wsSaveBalance(balance);
  }

  function pullBalanceFromProfile() {
    const st = wsGetProfileState();
    if (!st || !st.loggedIn) return false;
    if (typeof st.balance === "undefined") return false;

    const pb = Number(st.balance) || 0;
    if (!Number.isFinite(pb)) return false;
    if (Math.abs(pb - balance) < 1e-9) return false;

    applyingFromProfile = true;
    setBalance(pb);
    applyingFromProfile = false;

    wsSaveBalance(pb);
    return true;
  }

  let geom = { cx: 0, cy: 0, R: 0, ringW: 0 };
  function computeGeom() {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const R = Math.min(cx, cy) * 0.66;
    const ringW = Math.max(24, R * 0.18);
    geom = { cx, cy, R, ringW };
  }

  function layoutPointerKiss() {
    const wrapRect = wheelWrap.getBoundingClientRect();
    const { R, ringW } = geom;
    const cy = wrapRect.height / 2;
    const ringOuterTopY = cy - (R + ringW * 0.36);
    const pRect = pointer.getBoundingClientRect();
    const pointerH = pRect.height || 66;
    const tipYInPointer = (6 / 80) * pointerH;
    const EPS = -36;
    pointer.style.top = `${(ringOuterTopY - tipYInPointer + EPS).toFixed(2)}px`;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeGeom();
    layoutPointerKiss();
    drawWheel(currentRotation);
  }

  // ✅ NEW model: counts -> probs -> multis (matches chance-bar)
  function computeModel() {
    const segments = readSegments();
    const diff = readDifficulty();
    const prof = DIFF[diff] || DIFF.Medium;

    const counts = allocateCountsForSegments(diff, segments);
    const probs = counts.map((c) => (segments > 0 ? c / segments : 0));
    const nWin = prof.pills - 1;

    const mult = probs.map((p, i) => (i === 0 ? 0 : payoutFromProb(p, nWin)));

    return { segments, diff, pills: prof.pills, counts, probs, mult };
  }

  function buildSlices(model) {
    const slices = [];
    for (let tier = 0; tier < model.pills; tier++) {
      const c = model.counts[tier] || 0;
      for (let k = 0; k < c; k++) slices.push(tier);
    }
    while (slices.length < model.segments) slices.push(0);
    slices.length = model.segments;

    for (let i = slices.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [slices[i], slices[j]] = [slices[j], slices[i]];
    }
    return slices;
  }

  let currentRotation = 0;
  let slicesCache = null;
  let modelCache = null;

  function drawWheel(rotation) {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const { cx, cy, R, ringW } = geom;

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = ringW * 0.92;
    ctx.stroke();

    const model = modelCache || computeModel();
    if (
      !slicesCache ||
      slicesCache.length !== model.segments ||
      !modelCache ||
      modelCache.diff !== model.diff
    ) {
      modelCache = model;
      slicesCache = buildSlices(model);
    }

    const startAngle = -Math.PI / 2 + rotation;
    const step = (Math.PI * 2) / model.segments;

    for (let i = 0; i < model.segments; i++) {
      const tier = slicesCache[i] || 0;
      ctx.beginPath();
      ctx.arc(cx, cy, R, startAngle + i * step, startAngle + (i + 1) * step);
      ctx.strokeStyle = (PALETTE[tier] || PALETTE[0]).arc;
      ctx.lineWidth = ringW * 0.72;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = "rgba(0,0,0,0.20)";
    ctx.lineWidth = 1;
    for (let i = 0; i < model.segments; i++) {
      const a = -Math.PI / 2 + i * step;
      ctx.beginPath();
      ctx.moveTo(
        Math.cos(a) * (R - ringW * 0.36),
        Math.sin(a) * (R - ringW * 0.36)
      );
      ctx.lineTo(
        Math.cos(a) * (R + ringW * 0.36),
        Math.sin(a) * (R + ringW * 0.36)
      );
      ctx.stroke();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.52, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function normAng(a) {
    a = a % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a;
  }

  function sliceIndexUnderPin(rotation, segments) {
    const step = (Math.PI * 2) / segments;
    const rel = normAng(-rotation);
    return Math.floor(rel / step) % segments;
  }

  function rotationForSliceCenter(sliceIndex, segments) {
    const step = (Math.PI * 2) / segments;
    return normAng(-((sliceIndex + 0.5) * step));
  }

  let spinning = false;
  let autoRunning = false;
  let autoLeft = 0;

  let autoStartBalance = 0;
  let autoBaseBet = 0;

  function pickOutcomeIndex(model) {
    // sample tier using probs (which are counts/segments)
    const r = Math.random();
    let acc = 0;
    let tier = 0;
    for (let i = 0; i < model.pills; i++) {
      acc += model.probs[i];
      if (r <= acc) {
        tier = i;
        break;
      }
    }
    const idxs = [];
    for (let i = 0; i < slicesCache.length; i++)
      if (slicesCache[i] === tier) idxs.push(i);
    return {
      tier,
      sliceIndex: idxs.length ? idxs[(Math.random() * idxs.length) | 0] : 0,
    };
  }

  function applyAdvancedAfterResult(didWin) {
    const adv = getAdvancedSettings();
    if (!adv.enabled) return;

    const profit = balance - autoStartBalance;
    const stopProfit = Number(adv.stopProfit) || 0;
    const stopLoss = Number(adv.stopLoss) || 0;

    if (stopProfit > 0 && profit >= stopProfit) {
      stopAuto();
      return;
    }
    if (stopLoss > 0 && -profit >= stopLoss) {
      stopAuto();
      return;
    }

    const curBet = readBet();
    const base = autoBaseBet > 0 ? autoBaseBet : curBet;

    const rule = didWin ? adv.onWin : adv.onLoss;
    const mode = rule?.mode === "inc" ? "inc" : "reset";
    const pct = Math.max(0, Number(rule?.pct) || 0);

    let next = curBet;
    if (mode === "reset") next = base;
    else next = curBet * (1 + pct / 100);

    next = Math.max(0.01, Math.min(next, 1e18));
    writeBet(next);
  }

  function spinOnce(fromAuto = false) {
    if (spinning) return;

    pullBalanceFromProfile();

    hideWinPopupInstant();
    const bet = readBet();
    if (!(bet > 0) || bet > balance) return;

    setControlsLocked(true, autoRunning === true);
    setBalance(balance - bet);

    modelCache = computeModel();
    slicesCache = buildSlices(modelCache);

    const { sliceIndex } = pickOutcomeIndex(modelCache);

    const curMod = normAng(currentRotation);
    const wantMod = rotationForSliceCenter(sliceIndex, modelCache.segments);
    let deltaMod = wantMod - curMod;
    if (deltaMod < 0) deltaMod += Math.PI * 2;

    const spins = 7 + Math.random() * 4;
    const targetRot = currentRotation + spins * Math.PI * 2 + deltaMod;

    const startRot = currentRotation;
    const delta = targetRot - startRot;
    const dur = 1350 + Math.random() * 650;
    const t0 = performance.now();
    spinning = true;

    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      currentRotation = startRot + delta * (1 - Math.pow(1 - t, 3));
      drawWheel(currentRotation);

      if (t < 1) requestAnimationFrame(tick);
      else {
        spinning = false;
        currentRotation = normAng(currentRotation);
        setControlsLocked(false, false);

        const landedSlice = sliceIndexUnderPin(
          currentRotation,
          modelCache.segments
        );
        const landedTier = slicesCache[landedSlice] || 0;

        let didWin = false;

        if (landedTier !== 0) {
          didWin = true;
          const m = modelCache.mult[landedTier];
          const winAmount = bet * m;
          setBalance(balance + winAmount);
          showWinPopup(m, winAmount);
        }

        if (
          window.PROFILE_API &&
          typeof window.PROFILE_API.recordBet === "function"
        ) {
          window.PROFILE_API.recordBet({
            win: didWin,
            winAmount: didWin ? bet * modelCache.mult[landedTier] : 0,
            wagered: bet,
          });
        }

        if (autoRunning) applyAdvancedAfterResult(didWin);
        if (fromAuto) scheduleNextAuto();
      }
    };
    requestAnimationFrame(tick);
  }

  function stopAuto() {
    autoRunning = false;
    autoLeft = 0;
    setAutoBtnRunning(false);
  }

  function scheduleNextAuto() {
    if (!autoRunning || spinning) return;
    if (autoLeft > 0) autoLeft--;

    const bet = readBet();
    if (
      !(bet > 0) ||
      bet > balance ||
      (autoLeft === 0 && readNumBets() !== 0)
    ) {
      stopAuto();
      return;
    }

    setTimeout(() => spinOnce(true), 160);
  }

  if (placeBetBtn)
    placeBetBtn.addEventListener("click", () => {
      stopAuto();
      spinOnce(false);
    });

  if (startAutobetBtn)
    startAutobetBtn.addEventListener("click", () => {
      if (autoRunning) {
        stopAuto();
        return;
      }

      autoRunning = true;
      autoLeft = readNumBets();

      autoStartBalance = balance;
      autoBaseBet = readBet();

      setAutoBtnRunning(true);
      scheduleNextAuto();
    });

  const mo = new MutationObserver(() => {
    modelCache = slicesCache = null;
    resizeCanvas();
  });
  [
    document.getElementById("ddSegments"),
    document.getElementById("ddDifficulty"),
  ].forEach(
    (el) =>
      el &&
      mo.observe(el, { subtree: true, characterData: true, childList: true })
  );

  window.addEventListener("resize", resizeCanvas);
  new ResizeObserver(resizeCanvas).observe(canvas);

  const syncIv = setInterval(() => {
    if (spinning) return;
    pullBalanceFromProfile();
  }, 400);

  window.addEventListener("focus", () => {
    if (spinning) return;
    pullBalanceFromProfile();
  });

  const cleanupObs = new MutationObserver(() => {
    const rootNow = document.getElementById(UI_ID);
    if (!rootNow) {
      clearInterval(syncIv);
      cleanupObs.disconnect();
    }
  });
  cleanupObs.observe(document.body, { childList: true, subtree: true });

  setBalance(balance);
  resizeCanvas();
  return { drawWheel };
}

function boot() {
  const tryMount = () => {
    if (
      !document.querySelector(".rightPanel") ||
      !document.getElementById("ddSegments")
    )
      return false;
    buildUI();
    return true;
  };
  if (!tryMount()) {
    const iv = setInterval(() => {
      if (tryMount()) clearInterval(iv);
    }, 60);
    setTimeout(() => clearInterval(iv), 8000);
  }
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
