// chance-bar.js (ES module) — v9 FIXED HOUSE EDGE (ALL segments/difficulty) + HIGH MULTIS
// Bottom pinned, full-width row, difficulty controls #colors.
// FIXES:
// - ✅ Lower multiplier => higher chance; higher multiplier => lower chance
// - ✅ Low: 4 colors total (0x + 3 wins)
// - ✅ Medium: 5 colors total (0x + 4 wins)
// - ✅ High: 6 colors total (0x + 5 wins)
// - ✅ Uses *integer slice counts* per tier so fractions match segments exactly (k/segments)
// - ✅ Multipliers ALWAYS satisfy house edge: Σ(p_i * m_i) = (1 - HOUSE_EDGE)
// - ✅ Allows high multipliers naturally when segments are high / rare tiers are 1 slice
// Does NOT touch index.html.

const $ = (s, r = document) => r.querySelector(s);

const STYLE_ID = "chance-bar-styles-v9";
const UI_ID = "chanceBarRoot-v9";

/* House edge */
const HOUSE_EDGE = 0.045; // 4.5%
const RTP = 1 - HOUSE_EDGE;

/* Difficulty parameters */
const DIFF = {
  Low: { pills: 4, loseP: 0.52, steepness: 1.35 },
  Medium: { pills: 5, loseP: 0.6, steepness: 1.65 },
  High: { pills: 6, loseP: 0.7, steepness: 2.05 },
};

function clampInt(n, a, b) {
  n = Number.isFinite(n) ? Math.floor(n) : a;
  return Math.max(a, Math.min(b, n));
}
function money2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    .chanceBar{
      position:absolute;
      left: 18px;
      right: 18px;
      bottom: 18px;
      z-index: 30;
      pointer-events: none;
      display:flex;
      justify-content: stretch;
    }

    .chanceCard{
      pointer-events:auto;
      width: 100%;
      display:flex;
      flex-direction: column;
      gap: 10px;
    }

    .chanceInfo{
      width:100%;
      border-radius: 10px;
      background: rgba(0,0,0,.18);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
      padding: 10px 12px;
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;

      transform: translateY(10px);
      opacity: 0;
      pointer-events:none;
      transition: transform .18s ease, opacity .18s ease;
    }
    .chanceCard.isHovering .chanceInfo{
      transform: translateY(0);
      opacity: 1;
      pointer-events:auto;
    }

    .chanceField{ display:flex; flex-direction:column; gap: 6px; min-width: 0; }
    .chanceLabel{
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 500;
      font-size: 11px;
      color: rgba(159,190,208,.95);
      letter-spacing: .2px;
      user-select:none;
    }
    .chanceValue{
      height: 24px;
      border-radius: 6px;
      background: rgba(22,37,45,.95);
      box-shadow: inset 0 0 0 2px rgba(57,85,101,.85);
      display:flex;
      align-items:center;
      padding: 0 8px;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 400;
      font-size: 12px;
      color: rgba(182,210,227,.95);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pillRow{
      width:100%;
      display:grid;
      gap: 10px;
    }

    .pill{
      height: 44px;
      border-radius: 10px;
      background: rgba(0,0,0,.18);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
      display:flex;
      align-items:center;
      justify-content:center;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 500;
      font-size: 16px;
      color: rgba(182,210,227,.92);
      user-select:none;
      cursor: default;
      position: relative;
      overflow: hidden;
    }

    .pill::after{
      content:"";
      position:absolute;
      left:0; right:0; bottom:0;
      height: 6px;
      opacity: .95;
      background: rgba(255,255,255,.12);
      z-index: 2;
    }

    .pillFill{
      position:absolute;
      inset:0;
      transform: translateY(100%);
      transition: transform .22s ease;
      z-index: 0;
    }
    .pill.isHover .pillFill{ transform: translateY(0); }

    .pillText{
      position:relative;
      z-index: 3;
      padding: 0 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pill.isHover{ color:#ffffff; }
    .pill.isHover[data-tone="light"]{ color:#0b1a22; }
  `;
  document.head.appendChild(st);
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

/**
 * Allocate INTEGER slice counts that match the chosen segments.
 * This is what makes "k/segments" exact and keeps probabilities consistent.
 */
function allocateCountsForSegments(diffKey, segments) {
  const prof = DIFF[diffKey] || DIFF.Medium;
  const pills = prof.pills;
  const nWin = pills - 1;

  const loseP = Math.max(0.5, Math.min(0.9, prof.loseP));
  let loseCount = Math.round(loseP * segments);

  // must leave at least 1 slice per win tier
  const minWinTotal = nWin; // 1 each
  if (segments - loseCount < minWinTotal) {
    loseCount = Math.max(0, segments - minWinTotal);
  }

  // also keep lose >= 50% if possible (your rule)
  // if segments are tiny + many win tiers, this could be impossible — we already enforced 1 each.
  const minLoseCount = Math.ceil(0.5 * segments);
  if (segments - minLoseCount >= minWinTotal) {
    loseCount = Math.max(loseCount, minLoseCount);
  }

  let remaining = segments - loseCount;
  if (remaining < minWinTotal) {
    // fallback (shouldn't happen now, but safe)
    loseCount = Math.max(0, segments - minWinTotal);
    remaining = segments - loseCount;
  }

  // weights for win tiers: tier 1 most common, tier nWin rarest
  const w = [];
  for (let i = 1; i <= nWin; i++) w.push(1 / Math.pow(i, prof.steepness));
  const wSum = w.reduce((a, b) => a + b, 0) || 1;

  // base allocation proportional to weights
  const winRaw = w.map((wi) => (wi / wSum) * remaining);

  // start with floors but ensure >= 1
  const winCounts = winRaw.map((x) => Math.floor(x));
  for (let i = 0; i < winCounts.length; i++)
    winCounts[i] = Math.max(1, winCounts[i]);

  // fix total to exactly remaining
  let used = winCounts.reduce((a, b) => a + b, 0);

  // if we used too many because of the ">=1" bumps, take from the most common tiers first
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

  // if we used too few, distribute remaining by largest fractional parts
  if (used < remaining) {
    let need = remaining - used;
    const fracs = winRaw.map((x, i) => ({ i, f: x - Math.floor(x) }));
    fracs.sort((a, b) => b.f - a.f);
    for (let k = 0; k < need; k++) {
      winCounts[fracs[k % fracs.length].i] += 1;
    }
  }

  // final counts array [lose, win1, win2, ...]
  const counts = [loseCount, ...winCounts];

  // exact fix: ensure sums exactly segments
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum !== segments) counts[0] += segments - sum;

  // guarantee: rarest tier at least 1 slice
  if (counts[counts.length - 1] < 1) {
    // steal from lose if possible, else from most common win
    const donor = counts[0] > 1 ? 0 : 1;
    if (counts[donor] > 1) {
      counts[donor] -= 1;
      counts[counts.length - 1] += 1;
    } else {
      counts[counts.length - 1] = 1; // last resort
    }
  }

  return counts;
}

/**
 * House-edge multipliers across multiple win tiers.
 * We keep EV constant by giving each win tier an equal share of RTP:
 *   m_i = RTP / (nWin * p_i)
 * Then:
 *   Σ p_i*m_i (wins only) = RTP
 */
function payoutFromProb(pTier, nWin) {
  if (!(pTier > 0)) return 0;
  const n = Math.max(1, Number(nWin) || 1);
  const m = RTP / (n * pTier);
  // keep finite
  return Number.isFinite(m) ? m : 0;
}

function chanceAsFractionFromCount(count, segments) {
  const k = Math.max(0, Math.min(segments, Number(count) || 0));
  return `${k}/${segments}`;
}

function paletteFor(diffKey) {
  const BASE = [
    {
      strip: "rgba(255,255,255,.12)",
      fill: "rgba(57,85,101,.55)",
      light: false,
    },
    { strip: "#00ff2a", fill: "#00ff2a", light: false },
    { strip: "#ffffff", fill: "#ffffff", light: true },
    { strip: "#ffd400", fill: "#ffd400", light: true },
    { strip: "#ff8a00", fill: "#ff8a00", light: true },
    { strip: "#b14cff", fill: "#b14cff", light: false },
  ];

  const pills = (DIFF[diffKey] || DIFF.Medium).pills;
  return BASE.slice(0, pills);
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
  root.className = "chanceBar";
  root.id = UI_ID;

  root.innerHTML = `
    <div class="chanceCard" id="chanceCard">
      <div class="chanceInfo" id="chanceInfo">
        <div class="chanceField">
          <div class="chanceLabel">Profit On Win</div>
          <div class="chanceValue" id="chanceProfitVal">0.00</div>
        </div>
        <div class="chanceField">
          <div class="chanceLabel">Chance</div>
          <div class="chanceValue" id="chanceChanceVal">—</div>
        </div>
      </div>

      <div class="pillRow" id="chancePillRow"></div>
    </div>
  `;

  rightPanel.appendChild(root);

  const cardEl = $("#chanceCard");
  const profitEl = $("#chanceProfitVal");
  const chanceEl = $("#chanceChanceVal");
  const rowEl = $("#chancePillRow");

  let pills = [];

  function computeModel() {
    const segments = readSegments();
    const diff = readDifficulty();
    const prof = DIFF[diff] || DIFF.Medium;

    const counts = allocateCountsForSegments(diff, segments);
    const probs = counts.map((c) => (segments > 0 ? c / segments : 0));
    const nWin = prof.pills - 1;

    const mult = probs.map((p, idx) =>
      idx === 0 ? 0 : payoutFromProb(p, nWin)
    );

    return { segments, diff, pills: prof.pills, counts, probs, mult };
  }

  function rebuildPills() {
    const model = computeModel();
    const pal = paletteFor(model.diff);

    rowEl.style.gridTemplateColumns = `repeat(${model.pills}, minmax(0, 1fr))`;
    rowEl.innerHTML = "";

    for (let i = 0; i < model.pills; i++) {
      const t = pal[i];

      const pill = document.createElement("div");
      pill.className = "pill";
      pill.dataset.idx = String(i);
      if (t.light) pill.dataset.tone = "light";

      pill.innerHTML = `
        <div class="pillFill"></div>
        <div class="pillText">${i === 0 ? "0.00x" : "—"}</div>
      `;

      const fill = pill.querySelector(".pillFill");
      if (fill) fill.style.background = t.fill;

      pill.style.boxShadow =
        "inset 0 1px 0 rgba(255,255,255,.04), inset 0 -6px 0 " + t.strip;

      rowEl.appendChild(pill);
    }

    pills = [...rowEl.querySelectorAll(".pill")];

    pills.forEach((pill) => {
      pill.addEventListener("mouseenter", () => {
        pills.forEach((p) => p.classList.remove("isHover"));
        pill.classList.add("isHover");
        cardEl.classList.add("isHovering");
        setTopFieldsForIndex(Number(pill.dataset.idx));
      });
      pill.addEventListener("mouseleave", () => {
        pills.forEach((p) => p.classList.remove("isHover"));
        cardEl.classList.remove("isHovering");
        setTopFieldsForIndex(0);
      });
    });

    renderMultipliers();
    setTopFieldsForIndex(0);
  }

  function renderMultipliers() {
    const model = computeModel();

    pills.forEach((pill) => {
      const idx = Number(pill.dataset.idx);
      const text = pill.querySelector(".pillText");
      if (!text) return;

      if (idx === 0) {
        text.textContent = "0.00x";
        return;
      }

      const m = model.mult[idx];

      // show high multis cleanly without breaking layout
      // (still keeps your simple "xx.xx" style for normal ranges)
      let label = "—";
      if (Number.isFinite(m)) {
        if (m >= 1000000) label = `${Math.round(m).toLocaleString()}x`;
        else label = `${m.toFixed(2)}x`;
      }
      text.textContent = label;
    });
  }

  function setTopFieldsForIndex(idx) {
    const bet = readBet();
    const model = computeModel();

    const p = model.probs[idx] ?? 0;
    const c = model.counts[idx] ?? 0;

    if (idx === 0) {
      profitEl.textContent = "0.00";
      chanceEl.textContent = chanceAsFractionFromCount(c, model.segments);
      return;
    }

    const m = model.mult[idx];
    const profitOnWin = bet * (m - 1);

    profitEl.textContent = money2(profitOnWin);
    chanceEl.textContent = chanceAsFractionFromCount(c, model.segments);
  }

  const betInput = document.getElementById("betAmount");
  if (betInput) {
    const upd = () => {
      const hovered = pills.find((p) => p.classList.contains("isHover"));
      if (hovered) setTopFieldsForIndex(Number(hovered.dataset.idx));
    };
    betInput.addEventListener("input", upd);
    betInput.addEventListener("blur", upd);
  }

  const ddSeg = document.getElementById("ddSegments");
  const ddDiff = document.getElementById("ddDifficulty");

  const mo = new MutationObserver(() => {
    rebuildPills();
    const hovered = pills.find((p) => p.classList.contains("isHover"));
    if (hovered) setTopFieldsForIndex(Number(hovered.dataset.idx));
  });

  if (ddSeg)
    mo.observe(ddSeg, { subtree: true, characterData: true, childList: true });
  if (ddDiff)
    mo.observe(ddDiff, { subtree: true, characterData: true, childList: true });

  rebuildPills();

  return { rebuildPills, renderMultipliers, setTopFieldsForIndex };
}

function boot() {
  const tryMount = () => {
    const rightPanel = document.querySelector(".rightPanel");
    const ddSeg = document.getElementById("ddSegments");
    const ddDiff = document.getElementById("ddDifficulty");
    if (!rightPanel || !ddSeg || !ddDiff) return false;
    buildUI();
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
