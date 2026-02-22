// advanced-autobet.js (ES module) — v3
// ✅ Removes the vertical line next to %
// ✅ "Increase By" shows fully (no "Increase...")
// ✅ Makes the percent box smaller so the segmented buttons have more room
// ✅ Keeps everything else the same (scroll + pinned start button)

const $ = (s, r = document) => r.querySelector(s);

const STYLE_ID = "adv-autobet-styles-v3";
const ROOT_ID = "advAutobetRoot-v3";
const SCROLLER_ID = "advAutobetScroller-v3";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
  .advWrap{
    display:none;
    margin-top: calc(8px * var(--uiScale));
    width: 100%;
    flex: 0 0 auto;
  }
    .advWrap.show{ display:block; }

    .advScroll{
        width: 100%;
        max-height: calc(260px * var(--uiScale));
        overflow-y: auto;
        overflow-x: hidden;
      
        padding-right: 2px;
        padding-bottom: calc(10px * var(--uiScale));
        display:flex;
        flex-direction:column;
        gap: calc(10px * var(--uiScale));
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .advScroll::-webkit-scrollbar{ width: 0; height: 0; }
      
    .advBlock{
      display:flex;
      flex-direction:column;
      gap: calc(8px * var(--uiScale));
      flex: 0 0 auto;
    }

    .advHeader{
      color: var(--label);
      font-weight: 500;
      font-size: calc(17px * var(--uiScale));
      letter-spacing: .2px;
      margin: 0 2px;
    }

    .advRow{
      width: 100%;
      display:flex;
      align-items:center;
      gap: calc(10px * var(--uiScale));
    }

    /* segmented mini (Reset / Increase By) */
    .advSeg{
      flex: 1 1 auto;
      height: calc(var(--controlH) * var(--uiScale));
      border-radius: var(--controlR);
      background: rgba(0,0,0,0.18);
      box-shadow: var(--shadowTop);
      padding: calc(6px * var(--uiScale));
      display:flex;
      gap: calc(6px * var(--uiScale));
      min-width: 0;
    }
    .advSegBtn{
      flex: 1 1 0;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--text);
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 500;
      font-size: calc(16px * var(--uiScale));
      cursor:pointer;
      opacity: .92;
      transition: background .12s ease, opacity .12s ease, filter .12s ease;
      white-space: nowrap;

      /* ✅ ensure labels show fully */
      overflow: visible;
      text-overflow: clip;
    }
    .advSegBtn:hover{ background: rgba(57,85,101,.42); opacity: 1; }
    .advSegBtn.isActive{ background: rgba(57,85,101,.55); opacity: 1; }

    /* percent control (smaller so "Increase By" fits) */
    .advPct{
      width: calc(72px * var(--uiScale)); /* ✅ smaller (was 92) */
      height: calc(var(--controlH) * var(--uiScale));
      border-radius: var(--controlR);
      background: var(--panelFill);
      border: 2px solid var(--stroke);
      box-shadow: var(--shadowTop);
      display:flex;
      align-items:center;
      overflow:hidden;
      flex: 0 0 auto;
    }
    .advPctInput{
      width: 100%;
      height: 100%;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--text);
      font-weight: 400;
      font-size: calc(17px * var(--uiScale));
      padding: 0 calc(8px * var(--uiScale)); /* slightly tighter */
      text-align: left;
      min-width: 0;
    }
    .advPctSuffix{
      width: calc(22px * var(--uiScale)); /* ✅ smaller suffix area */
      height: 100%;

      /* ✅ REMOVE the vertical divider line */
      border-left: 0;

      display:flex;
      align-items:center;
      justify-content:center;
      color: var(--quickText);
      font-weight: 500;
      font-size: calc(16px * var(--uiScale));
      user-select:none;
      opacity: .95;
      padding-right: 2px;
    }

    .advPct.isDisabled{
      opacity: .55;
      filter: saturate(.85);
    }
    .advPct.isDisabled .advPctInput{
      pointer-events: none;
    }

    .advStopWrap{
      width: 100%;
      height: calc(var(--controlH) * var(--uiScale));
      border-radius: var(--controlR);
      background: var(--panelFill);
      border: 2px solid var(--stroke);
      display:flex;
      align-items:center;
      padding: 0 calc(12px * var(--uiScale));
      box-shadow: var(--shadowTop);
    }
    .advStopInput{
      width: 100%;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--text);
      font-weight: 400;
      font-size: calc(17px * var(--uiScale));
    }
  `;
  document.head.appendChild(st);
}

function clampNum(n, a, b) {
  n = Number(n);
  if (!Number.isFinite(n)) n = a;
  return Math.max(a, Math.min(b, n));
}

function fmt2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : "0.00";
}

function readSwitchOn() {
  const sw = document.getElementById("advSwitch");
  if (!sw) return false;
  return (
    sw.classList.contains("isOn") || sw.getAttribute("aria-checked") === "true"
  );
}

function ensureUI() {
  injectStyles();

  const autoOnly = document.querySelector(".autoOnly");
  const advSwitch = document.getElementById("advSwitch");
  const startBtn = document.getElementById("startAutobet");
  if (!autoOnly || !advSwitch || !startBtn) return null;

  if (document.getElementById(ROOT_ID)) return document.getElementById(ROOT_ID);

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "advWrap";

  root.innerHTML = `
    <div class="advScroll" id="${SCROLLER_ID}">
      <div class="advBlock" data-kind="win">
        <div class="advHeader">On Win</div>
        <div class="advRow">
          <div class="advSeg" role="group" aria-label="On Win">
            <button class="advSegBtn isActive" type="button" data-mode="reset" data-target="win">Reset</button>
            <button class="advSegBtn" type="button" data-mode="inc" data-target="win">Increase By</button>
          </div>
          <div class="advPct isDisabled" data-pctbox="win">
            <input class="advPctInput" id="advWinPct" type="text" inputmode="decimal" value="0" />
            <div class="advPctSuffix">%</div>
          </div>
        </div>
      </div>

      <div class="advBlock" data-kind="loss">
        <div class="advHeader">On Loss</div>
        <div class="advRow">
          <div class="advSeg" role="group" aria-label="On Loss">
            <button class="advSegBtn isActive" type="button" data-mode="reset" data-target="loss">Reset</button>
            <button class="advSegBtn" type="button" data-mode="inc" data-target="loss">Increase By</button>
          </div>
          <div class="advPct isDisabled" data-pctbox="loss">
            <input class="advPctInput" id="advLossPct" type="text" inputmode="decimal" value="0" />
            <div class="advPctSuffix">%</div>
          </div>
        </div>
      </div>

      <div class="advBlock">
        <div class="advHeader">Stop on Profit</div>
        <div class="advStopWrap">
          <input class="advStopInput" id="advStopProfit" type="text" inputmode="decimal" value="0.00" />
        </div>
      </div>

      <div class="advBlock">
        <div class="advHeader">Stop on Loss</div>
        <div class="advStopWrap">
          <input class="advStopInput" id="advStopLoss" type="text" inputmode="decimal" value="0.00" />
        </div>
      </div>
    </div>
  `;

  startBtn.parentNode.insertBefore(root, startBtn);

  const scroller = document.getElementById(SCROLLER_ID);

  const segBtns = Array.from(root.querySelectorAll(".advSegBtn"));
  const pctWinBox = root.querySelector('[data-pctbox="win"]');
  const pctLossBox = root.querySelector('[data-pctbox="loss"]');
  const winPct = root.querySelector("#advWinPct");
  const lossPct = root.querySelector("#advLossPct");
  const stopProfit = root.querySelector("#advStopProfit");
  const stopLoss = root.querySelector("#advStopLoss");

  function setMode(target, mode) {
    segBtns
      .filter((b) => b.dataset.target === target)
      .forEach((b) => b.classList.toggle("isActive", b.dataset.mode === mode));

    const pctBox = target === "win" ? pctWinBox : pctLossBox;
    const isReset = mode === "reset";
    pctBox.classList.toggle("isDisabled", isReset);
  }

  segBtns.forEach((b) => {
    b.addEventListener("click", () =>
      setMode(b.dataset.target, b.dataset.mode)
    );
  });

  function cleanPctInput(inp) {
    const raw = String(inp.value || "").replace(/[^0-9.]/g, "");
    let n = Number(raw);
    if (!Number.isFinite(n)) n = 0;
    n = clampNum(n, 0, 1000);
    inp.value = String(n % 1 === 0 ? Math.trunc(n) : n);
  }

  function cleanMoneyInput(inp) {
    const raw = String(inp.value || "").replace(/[^0-9.]/g, "");
    let n = Number(raw);
    if (!Number.isFinite(n)) n = 0;
    n = clampNum(n, 0, 1e18);
    inp.value = fmt2(n);
  }

  [winPct, lossPct].forEach((inp) => {
    inp.addEventListener("input", () => cleanPctInput(inp));
    inp.addEventListener("blur", () => cleanPctInput(inp));
  });

  [stopProfit, stopLoss].forEach((inp) => {
    inp.addEventListener("input", () => {
      inp.value = String(inp.value || "").replace(/[^0-9.]/g, "");
    });
    inp.addEventListener("blur", () => cleanMoneyInput(inp));
  });

  setMode("win", "reset");
  setMode("loss", "reset");

  function syncVisibility() {
    const on = readSwitchOn();
    root.classList.toggle("show", on);
    if (!on && scroller) scroller.scrollTop = 0;
  }
  syncVisibility();

  const mo = new MutationObserver(syncVisibility);
  mo.observe(advSwitch, {
    attributes: true,
    attributeFilter: ["class", "aria-checked"],
  });

  window.WHEEL_ADV_API = window.WHEEL_ADV_API || {};
  window.WHEEL_ADV_API.getSettings = () => {
    const enabled = readSwitchOn();
    if (!enabled) return { enabled: false };

    const winModeBtn = root.querySelector(
      '.advBlock[data-kind="win"] .advSegBtn.isActive'
    );
    const lossModeBtn = root.querySelector(
      '.advBlock[data-kind="loss"] .advSegBtn.isActive'
    );

    const winMode = winModeBtn?.dataset.mode === "inc" ? "inc" : "reset";
    const lossMode = lossModeBtn?.dataset.mode === "inc" ? "inc" : "reset";

    const winPctN = clampNum(Number(winPct.value || 0), 0, 1000);
    const lossPctN = clampNum(Number(lossPct.value || 0), 0, 1000);

    const sp = clampNum(
      Number(String(stopProfit.value || "0").replace(/[^0-9.]/g, "")),
      0,
      1e18
    );
    const sl = clampNum(
      Number(String(stopLoss.value || "0").replace(/[^0-9.]/g, "")),
      0,
      1e18
    );

    return {
      enabled: true,
      onWin: { mode: winMode, pct: winPctN },
      onLoss: { mode: lossMode, pct: lossPctN },
      stopProfit: sp,
      stopLoss: sl,
    };
  };

  return root;
}

function boot() {
  const tryMount = () => {
    const ok =
      document.querySelector(".autoOnly") &&
      document.getElementById("advSwitch") &&
      document.getElementById("startAutobet");
    if (!ok) return false;
    ensureUI();
    return true;
  };

  if (tryMount()) return;

  const iv = setInterval(() => {
    if (tryMount()) clearInterval(iv);
  }, 60);
  setTimeout(() => clearInterval(iv), 8000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
