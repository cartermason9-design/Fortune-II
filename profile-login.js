// profile-login.js (ES module) — v3.5.0 (Supabase) — FIXED SIZE (NO SCROLL), MATCHES YOUR UI NOTES
// ✅ FIX 1: 3-dots menu buttons ALWAYS work (outside-click handler no longer kills clicks)
// ✅ FIX 2: Live rank + stats update live while modal is open (rank bar + totals + winrate etc.)
// ✅ ADD: "Live Rank" button in 3-dots menu that opens your live-rank-widget.js (dispatches PROFILE:OPEN_LIVE_RANK)
// ✅ FIX 3 (CRITICAL): Balance persistence + cross-tab sync + prevents stale tab overwrites
// ✅ ADD v3.5.0: "Reset Balance" button in 3-dots menu (opens confirm modal via PROFILE:OPEN_RESET_BALANCE)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STYLE_ID = "profile-login-styles-v35";
const BTN_ID = "profileBtn-v35";
const MODAL_ID = "profileModal-v35";

// ====== YOU MUST SET THESE ======
const SUPABASE_URL = "https://xdfiqhzbggymsixoaall.supabase.co";
const SUPABASE_KEY = "sb_publishable_5DDByl42-e0ExJq5kgRA5A_dqvSmHSD";

// Wallet table name
const WALLET_TABLE = "player_wallets";

// Demo balance baseline
const START_BALANCE = 1000;

// -----------------------------
const $ = (s, r = document) => r.querySelector(s);

const PROFILE_SVG = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 21c0-3.866-3.582-7-8-7s-8 3.134-8 7"
    stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const MORE_SVG = `
<svg viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg" stroke="#ffffff" aria-hidden="true">
  <path d="M12,16a2,2,0,1,1-2,2A2,2,0,0,1,12,16ZM10,6a2,2,0,1,0,2-2A2,2,0,0,0,10,6Zm0,6a2,2,0,1,0,2-2A2,2,0,0,0,10,12Z"></path>
</svg>
`;

function fmtMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function safeText(s) {
  return String(s ?? "").replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])
  );
}

// =========================
// ✅ BALANCE PERSIST (ANTI TAB-RACE)
// =========================
const BAL_SYNC_CH = "PF_BAL_SYNC_V1";
const balBC =
  "BroadcastChannel" in window ? new BroadcastChannel(BAL_SYNC_CH) : null;

// localStorage keys
const BAL_LS_KEY = "PF_BAL_LAST_V1"; // stores JSON { userId, balance, ts }

// Read last saved balance snapshot (any user)
function readLocalBalSnap() {
  try {
    const raw = localStorage.getItem(BAL_LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    const bal = Number(obj.balance);
    const ts = Number(obj.ts);
    const userId = obj.userId ?? null;
    if (!Number.isFinite(bal) || !Number.isFinite(ts)) return null;
    return { userId, balance: Math.max(0, bal), ts };
  } catch {
    return null;
  }
}

function writeLocalBalSnap(userId, balance, ts) {
  try {
    localStorage.setItem(
      BAL_LS_KEY,
      JSON.stringify({
        userId: userId ?? null,
        balance: Math.max(0, Number(balance) || 0),
        ts: Number(ts) || Date.now(),
      })
    );
  } catch {
    // ignore
  }
}

// =========================
// RANK SYSTEM (TOTAL WAGERED)
// =========================
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
  return "#1267c6";
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
const RANK_THRESHOLDS = buildRankThresholds();

function computeRank(totalWagered) {
  const tw = Math.max(0, Number(totalWagered) || 0);

  let idx = 0;
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (tw >= RANK_THRESHOLDS[i]) idx = i;
    else break;
  }
  idx = Math.max(0, Math.min(RANKS.length - 1, idx));

  const curName = RANKS[idx];
  const nextName = idx < RANKS.length - 1 ? RANKS[idx + 1] : null;

  const curStart = RANK_THRESHOLDS[idx];
  const nextStart =
    idx < RANKS.length - 1 ? RANK_THRESHOLDS[idx + 1] : curStart;

  let prog = 1;
  if (idx < RANKS.length - 1) {
    const span = Math.max(1, nextStart - curStart);
    prog = (tw - curStart) / span;
    prog = Math.max(0, Math.min(1, prog));
  }

  return {
    name: curName,
    next: nextName,
    color: rankColor(curName),
    nextColor: nextName ? rankColor(nextName) : rankColor(curName),
    progress01: prog,
  };
}

// -----------------------------
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    .pfBtn{
      position:absolute;
      left: 76px;
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
    .pfBtn:hover{ color: rgba(255,255,255,.98); }
    .pfBtn:active{ transform: translateY(1px); }
    .pfBtn svg{ width: 22px; height: 22px; display:block; }

    .pfModal{
      position: fixed;
      inset: 0;
      z-index: 99999;
      display:none;
      align-items:center;
      justify-content:center;
      padding: 16px;
    }
    .pfModal.show{ display:flex; }

    .pfBackdrop{
      position:absolute;
      inset:0;
      background: rgba(0,0,0,.55);
    }

    /* ✅ ACTUALLY SMALLER + FITS VIEWPORT (NO SCROLL) */
    .pfCard{
      position: relative;
      width: min(420px, calc(100vw - 32px));
      height: min(560px, calc(88vh));
      border-radius: 18px;
      background: #0f2430;
      box-shadow: 0 18px 55px rgba(0,0,0,.55);
      z-index: 1;
      display:flex;
      flex-direction:column;
      overflow:hidden;
    }

    .pfTop{
      height: 54px;
      padding: 0 14px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      background: rgba(84, 120, 140, .30);
      flex: 0 0 auto;
    }
    .pfTitle{
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 800;
      font-size: 20px;
      color: rgba(210,235,248,.95);
      letter-spacing: .2px;
      line-height: 1;
    }
    .pfIconBtn{
      width: 38px;
      height: 38px;
      border-radius: 12px;
      border: 0;
      background: transparent;
      color: rgba(255,255,255,.88);
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:center;
      transition: background .12s ease, transform .12s ease, color .12s ease;
    }
    .pfIconBtn:hover{ background: rgba(255,255,255,.10); color: rgba(255,255,255,.98); }
    .pfIconBtn:active{ transform: translateY(1px); }
    .pfIconBtn svg{ width: 20px; height: 20px; display:block; opacity: .95; }

    .pfBody{
      padding: 12px 14px 14px;
      overflow: hidden;
      flex: 1 1 auto;
      display:flex;
      flex-direction:column;
      gap: 10px;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color: rgba(182,210,227,.92);
    }

    /* Rank slider (no strokes) */
    .pfRankBlock{ flex: 0 0 auto; }
    .pfRankBar{
      height: 14px;
      border-radius: 999px;
      background: rgba(255,255,255,.14);
      overflow:hidden;
    }
    .pfRankFill{
      height: 100%;
      width: 0%;
      border-radius: 999px;
      transition: width .20s ease;
    }
    .pfRankLabels{
      margin-top: 8px;
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap: 10px;
      font-weight: 900;
      letter-spacing: .2px;
      font-size: 16px;
      line-height: 1.1;
    }
    .pfRankLeft, .pfRankRight{ white-space: nowrap; }

    /* Two separate background frames */
    .pfFrame1, .pfFrame2{
      background: rgba(86, 118, 134, .38);
      border-radius: 16px;
      padding: 12px;
      flex: 0 0 auto;
    }

    /* Balance row */
    .pfBalanceRow{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap: 12px;
    }
    .pfBalanceLabel{
      color: rgba(240,250,255,.95);
      font-weight: 900;
      font-size: 18px;
      letter-spacing: .2px;
      line-height: 1.1;
    }
    .pfBalanceValue{
      text-align:right;
      color: rgba(240,250,255,.95);
      font-weight: 900;
      font-size: 18px;
      letter-spacing: .2px;
      line-height: 1.15;
      white-space: nowrap;
      padding-top: 1px;
    }

    /* ✅ Stats block fits: 2-column grid so height stays short */
    .pfFrame2{
      position: relative;
      flex: 1 1 auto;
      overflow: hidden;
      display:flex;
      flex-direction:column;
    }
    .pfStatsGrid{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 16px;
      padding: 2px 2px 44px;
      overflow: hidden;
      align-content: start;
      flex: 1 1 auto;
    }
    .pfStat{
      display:flex;
      flex-direction:column;
      gap: 6px;
      min-width: 0;
    }
    .pfLabel{
      color: rgba(240,250,255,.95);
      font-weight: 900;
      font-size: 16px;
      letter-spacing: .2px;
      line-height: 1.1;
    }
    .pfValue{
      color: rgba(190,215,230,.92);
      font-weight: 900;
      font-size: 18px;
      letter-spacing: .2px;
      line-height: 1.05;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pfGreen{ color: rgba(0,255,42,.92); }
    .pfRed{ color: rgba(255, 77, 109, .92); }

    /* 3-dots button bottom-right */
    .pfDotsBtn{
      position:absolute;
      right: 10px;
      bottom: 10px;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      border: 0;
      background: transparent;
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:center;
      transition: background .12s ease, transform .12s ease;
      color: rgba(255,255,255,.90);
      z-index: 2;
    }
    .pfDotsBtn:hover{ background: rgba(255,255,255,.10); }
    .pfDotsBtn:active{ transform: translateY(1px); }
    .pfDotsBtn svg{ width: 20px; height: 20px; }

    .pfMenu{
      position: absolute;
      right: 10px;
      bottom: 56px;
      min-width: 200px;
      background: rgba(20, 42, 54, .98);
      border-radius: 14px;
      box-shadow: 0 18px 55px rgba(0,0,0,.45);
      padding: 8px;
      display:none;
      z-index: 3;
    }
    .pfMenu.show{ display:block; }
    .pfMenuBtn{
      width: 100%;
      border:0;
      background: transparent;
      color: rgba(255,255,255,.92);
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 900;
      letter-spacing: .2px;
      padding: 10px 10px;
      border-radius: 10px;
      cursor:pointer;
      text-align:left;
      transition: background .12s ease;
    }
    .pfMenuBtn:hover{ background: rgba(255,255,255,.10); }
    .pfMenuBtn.danger{ color: rgba(255, 77, 109, .95); }
    .pfMenuBtn.danger:hover{ background: rgba(255,77,109,.12); }
    .pfMenuSep{
      height: 1px;
      background: rgba(255,255,255,.08);
      margin: 6px 4px;
      border-radius: 999px;
    }

    /* Login inputs if logged out */
    .pfLoginWrap{ margin-top: 8px; flex: 0 0 auto; }
    .pfForm{ display:flex; flex-direction:column; gap: 10px; }
    .pfInput{
      height: 42px;
      border-radius: 14px;
      border: 0;
      outline: none;
      background: rgba(12,22,28,.75);
      padding: 0 12px;
      color: rgba(255,255,255,.92);
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 800;
      letter-spacing: .2px;
    }
    .pfActions{ display:flex; gap: 10px; justify-content:flex-end; margin-top: 10px; }
    .pfBtnPrimary, .pfBtnGhost{
      height: 38px;
      border-radius: 12px;
      border: 0;
      padding: 0 14px;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 900;
      cursor: pointer;
      transition: transform .12s ease, filter .12s ease, background .12s ease;
    }
    .pfBtnPrimary{ background: #1267c6; color: #fff; }
    .pfBtnPrimary:hover{ filter: brightness(1.06); }
    .pfBtnGhost{ background: rgba(255,255,255,.10); color: rgba(255,255,255,.92); }
    .pfBtnGhost:hover{ background: rgba(255,255,255,.14); }
    .pfBtnPrimary:active, .pfBtnGhost:active{ transform: translateY(1px); }
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

function buildModal() {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.className = "pfModal";
  modal.innerHTML = `
    <div class="pfBackdrop" id="pfBackdrop" aria-hidden="true"></div>
    <div class="pfCard" role="dialog" aria-modal="true" aria-label="Profile">
      <div class="pfTop">
        <div class="pfTitle" id="pfTitle">User Name</div>
        <button class="pfIconBtn" id="pfClose" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="pfBody" id="pfBody"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const backdrop = $("#pfBackdrop", modal);
  const closeBtn = $("#pfClose", modal);
  const card = modal.querySelector(".pfCard");

  function close() {
    modal.classList.remove("show");
  }
  function open() {
    modal.classList.add("show");
  }

  backdrop.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    close();
  });
  closeBtn.addEventListener("click", close);

  document.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("show")) return;
    if (e.key === "Escape") close();
  });

  card.addEventListener("pointerdown", (e) => e.stopPropagation());

  modal.__open = open;
  modal.__close = close;
  return modal;
}

function buildButton(leftPanel) {
  let btn = document.getElementById(BTN_ID);
  if (btn) return btn;

  btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.className = "pfBtn";
  btn.type = "button";
  btn.innerHTML = PROFILE_SVG;
  leftPanel.appendChild(btn);
  return btn;
}

// ---------------- Supabase helpers ----------------
function makeSupabase() {
  if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR_PROJECT_ID")) return null;
  if (!SUPABASE_KEY || SUPABASE_KEY.includes("REPLACE_ME")) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

async function getUser(supabase) {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, error };
  return { user: data?.user || null, error: null };
}

// ✅ FIX: THIS MUST BE IN MODULE SCOPE (so PROFILE_API can call it)
async function updateWalletBalance(supabase, userId, balance) {
  const b = Math.max(0, Number(balance) || 0);

  const { error } = await supabase
    .from(WALLET_TABLE)
    .update({ balance: b, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  return { error };
}

async function getOrCreateWallet(supabase, userId) {
  {
    const { data, error } = await supabase
      .from(WALLET_TABLE)
      .select("user_id,balance,total_wagered,updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error) {
      if (data && typeof data.balance !== "undefined") {
        return {
          wallet: {
            user_id: data.user_id,
            balance: Number(data.balance) || 0,
            total_wagered: Number(data.total_wagered) || 0,
            updated_at: data.updated_at || null,
          },
          error: null,
          hasTotalWageredColumn: true,
        };
      }

      const { data: insData, error: insErr } = await supabase
        .from(WALLET_TABLE)
        .insert({ user_id: userId, balance: START_BALANCE, total_wagered: 0 })
        .select("user_id,balance,total_wagered,updated_at")
        .single();

      if (!insErr) {
        return {
          wallet: {
            user_id: insData.user_id,
            balance: Number(insData.balance) || START_BALANCE,
            total_wagered: Number(insData.total_wagered) || 0,
            updated_at: insData.updated_at || null,
          },
          error: null,
          hasTotalWageredColumn: true,
        };
      }
    }
  }

  const { data, error } = await supabase
    .from(WALLET_TABLE)
    .select("user_id,balance,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { wallet: null, error, hasTotalWageredColumn: false };

  if (data && typeof data.balance !== "undefined") {
    return {
      wallet: {
        user_id: data.user_id,
        balance: Number(data.balance) || 0,
        total_wagered: 0,
        updated_at: data.updated_at || null,
      },
      error: null,
      hasTotalWageredColumn: false,
    };
  }

  const { data: insData, error: insErr } = await supabase
    .from(WALLET_TABLE)
    .insert({ user_id: userId, balance: START_BALANCE })
    .select("user_id,balance,updated_at")
    .single();

  if (insErr)
    return { wallet: null, error: insErr, hasTotalWageredColumn: false };

  return {
    wallet: {
      user_id: insData.user_id,
      balance: Number(insData.balance) || START_BALANCE,
      total_wagered: 0,
      updated_at: insData.updated_at || null,
    },
    error: null,
    hasTotalWageredColumn: false,
  };
}

function boot() {
  injectStyles();
  const leftPanel = ensureLeftPanelPositioned();
  if (!leftPanel) return;

  const supabase = makeSupabase();
  const modal = buildModal();
  const btn = buildButton(leftPanel);

  const stats = {
    balance: START_BALANCE,
    profit: 0,
    bets: 0,
    wins: 0,
    biggestWin: 0,
    totalWagered: 0,
  };

  let authedUser = null;
  let walletReady = false;

  // ✅ local “last applied” stamp in THIS TAB (prevents stale overwrites)
  let __lastBalTs = 0;

  function recomputeProfit() {
    stats.profit = (Number(stats.balance) || 0) - START_BALANCE;
  }

  // ===== LIVE UI UPDATE (no re-render spam, but keeps your HTML the same) =====
  let __uiQueued = false;
  function scheduleUiUpdate() {
    if (__uiQueued) return;
    __uiQueued = true;
    requestAnimationFrame(() => {
      __uiQueued = false;
      applyLiveUiIfOpen();
    });
  }

  function applyLiveUiIfOpen() {
    if (!modal.classList.contains("show")) return;

    const fill = $("#pfRankFill", modal);
    const left = $("#pfRankLeft", modal);
    const right = $("#pfRankRight", modal);

    const r = computeRank(stats.totalWagered);
    const pct = r.next ? Math.round(r.progress01 * 100) : 100;
    const rightLabel = r.next ? r.next : r.name;

    if (fill) {
      fill.style.width = `${pct}%`;
      fill.style.background = r.color;
    }
    if (left) {
      left.textContent = r.name;
      left.style.color = r.color;
    }
    if (right) {
      right.textContent = rightLabel;
      right.style.color = r.nextColor;
    }

    const losses = Math.max(
      0,
      (Number(stats.bets) || 0) - (Number(stats.wins) || 0)
    );
    const winRate =
      stats.bets > 0
        ? ((stats.wins / stats.bets) * 100).toFixed(2) + "%"
        : "0.00%";

    const balEl = $("#pfBalVal", modal);
    if (balEl) balEl.textContent = fmtMoney2(stats.balance);

    const winsEl = $("#pfWinsVal", modal);
    if (winsEl) winsEl.textContent = String(Number(stats.wins) || 0);

    const lossesEl = $("#pfLossesVal", modal);
    if (lossesEl) lossesEl.textContent = String(losses);

    const profitEl = $("#pfProfitVal", modal);
    if (profitEl) {
      profitEl.textContent = fmtMoney2(stats.profit);
      profitEl.classList.toggle("pfGreen", stats.profit >= 0);
      profitEl.classList.toggle("pfRed", stats.profit < 0);
    }

    const twEl = $("#pfTotalWageredVal", modal);
    if (twEl) twEl.textContent = fmtMoney2(stats.totalWagered);

    const betsEl = $("#pfBetsVal", modal);
    if (betsEl) betsEl.textContent = String(Number(stats.bets) || 0);

    const wrEl = $("#pfWinRateVal", modal);
    if (wrEl) wrEl.textContent = winRate;

    const bwEl = $("#pfBiggestWinVal", modal);
    if (bwEl) bwEl.textContent = fmtMoney2(stats.biggestWin);
  }

  // ✅ apply balance only if it’s newer than what we already have
  function applyBalanceIfNewer(balance, ts, userId) {
    const t = Number(ts) || 0;
    if (t <= __lastBalTs) return false;

    // also, if this snapshot is for a different user while logged in, ignore
    if (authedUser && userId && userId !== authedUser.id) return false;

    __lastBalTs = t;
    stats.balance = Math.max(0, Number(balance) || 0);
    recomputeProfit();
    scheduleUiUpdate();
    return true;
  }

  // ✅ Seed from localStorage immediately (prevents “snap down” before session loads)
  {
    const snap = readLocalBalSnap();
    if (snap && snap.balance != null && snap.ts != null) {
      applyBalanceIfNewer(snap.balance, snap.ts, snap.userId);
    }
  }

  // Listen to other tabs
  if (balBC) {
    balBC.onmessage = (ev) => {
      const msg = ev?.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type !== "BAL") return;
      applyBalanceIfNewer(msg.balance, msg.ts, msg.userId);
    };
  }

  let __saveT = null;
  let __pendingBal = null;

  async function flushPendingSave() {
    if (!supabase || !authedUser) return;
    if (__pendingBal == null) return;

    const b = __pendingBal;
    __pendingBal = null;
    await updateWalletBalance(supabase, authedUser.id, b);
  }

  window.PROFILE_API = {
    setBalance(n) {
      const b = Math.max(0, Number(n) || 0);

      // stamp this change
      const ts = Date.now();
      __lastBalTs = Math.max(__lastBalTs, ts);

      stats.balance = b;
      recomputeProfit();
      scheduleUiUpdate();

      // persist local snap so refresh doesn't pull old DB and "snap back"
      writeLocalBalSnap(authedUser?.id || null, b, ts);

      // broadcast to other tabs (prevents stale-tab overwrite behavior)
      if (balBC) {
        try {
          balBC.postMessage({
            type: "BAL",
            userId: authedUser?.id || null,
            balance: b,
            ts,
          });
        } catch {
          // ignore
        }
      }

      // ✅ Persist to Supabase if logged in
      if (supabase && authedUser) {
        __pendingBal = b;
        clearTimeout(__saveT);
        __saveT = setTimeout(async () => {
          await flushPendingSave();
        }, 250);
      }
    },

    recordBet({ win = false, winAmount = 0, wagered = 0 } = {}) {
      stats.bets += 1;
      if (win) stats.wins += 1;

      const wa = Number(winAmount) || 0;
      if (wa > stats.biggestWin) stats.biggestWin = wa;

      const w = Number(wagered) || 0;
      if (w > 0) stats.totalWagered = (Number(stats.totalWagered) || 0) + w;

      recomputeProfit();
      scheduleUiUpdate();
    },
    open() {
      btn.click();
    },
    getState() {
      return {
        ...stats,
        loggedIn: !!authedUser,
        userId: authedUser?.id || null,
        startBalance: START_BALANCE,
      };
    },
  };

  // flush saves on tab hide/unload (best effort)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearTimeout(__saveT);
      flushPendingSave().catch(() => {});
    }
  });
  window.addEventListener("beforeunload", () => {
    clearTimeout(__saveT);
  });

  function renderRankTop() {
    const r = computeRank(stats.totalWagered);
    const pct = r.next ? Math.round(r.progress01 * 100) : 100;
    const rightLabel = r.next ? r.next : r.name;
    return `
      <div class="pfRankBlock">
        <div class="pfRankBar">
          <div class="pfRankFill" id="pfRankFill" style="width:${pct}%; background:${
      r.color
    };"></div>
        </div>
        <div class="pfRankLabels">
          <div class="pfRankLeft" id="pfRankLeft" style="color:${
            r.color
          };">${safeText(r.name)}</div>
          <div class="pfRankRight" id="pfRankRight" style="color:${
            r.nextColor
          };">${safeText(rightLabel)}</div>
        </div>
      </div>
    `;
  }

  function renderDotsMenu() {
    return `
      <button class="pfDotsBtn" id="pfDotsBtn" type="button" aria-label="More">
        ${MORE_SVG}
      </button>
      <div class="pfMenu" id="pfMenu" role="menu" aria-label="Profile menu">
        <button class="pfMenuBtn" id="pfMenuRefresh" type="button" role="menuitem">Refresh</button>
        <button class="pfMenuBtn" id="pfMenuLiveRank" type="button" role="menuitem">Live Rank</button>
        <button class="pfMenuBtn danger" id="pfMenuResetBalance" type="button" role="menuitem">Reset Balance</button>
        <div class="pfMenuSep"></div>
        <button class="pfMenuBtn" id="pfMenuLogout" type="button" role="menuitem">Log out</button>
      </div>
    `;
  }

  function renderProfileBody() {
    const losses = Math.max(
      0,
      (Number(stats.bets) || 0) - (Number(stats.wins) || 0)
    );
    const winRate =
      stats.bets > 0
        ? ((stats.wins / stats.bets) * 100).toFixed(2) + "%"
        : "0.00%";

    return `
      ${renderRankTop()}

      <div class="pfFrame1">
        <div class="pfBalanceRow">
          <div class="pfBalanceLabel">Balance:</div>
          <div class="pfBalanceValue" id="pfBalVal">${fmtMoney2(
            stats.balance
          )}</div>
        </div>
      </div>

      <div class="pfFrame2" id="pfStatsFrame">
        <div class="pfStatsGrid">
          <div class="pfStat">
            <div class="pfLabel">Wins:</div>
            <div class="pfValue pfGreen" id="pfWinsVal">${
              Number(stats.wins) || 0
            }</div>
          </div>
          <div class="pfStat">
            <div class="pfLabel">Losses:</div>
            <div class="pfValue pfRed" id="pfLossesVal">${losses}</div>
          </div>

          <div class="pfStat">
            <div class="pfLabel">Profit:</div>
            <div class="pfValue ${
              stats.profit >= 0 ? "pfGreen" : "pfRed"
            }" id="pfProfitVal">${fmtMoney2(stats.profit)}</div>
          </div>
          <div class="pfStat">
            <div class="pfLabel">Total Wagered:</div>
            <div class="pfValue" id="pfTotalWageredVal">${fmtMoney2(
              stats.totalWagered
            )}</div>
          </div>

          <div class="pfStat">
            <div class="pfLabel">Total Bets:</div>
            <div class="pfValue" id="pfBetsVal">${Number(stats.bets) || 0}</div>
          </div>
          <div class="pfStat">
            <div class="pfLabel">Win Rate:</div>
            <div class="pfValue" id="pfWinRateVal">${winRate}</div>
          </div>

          <div class="pfStat" style="grid-column: 1 / -1;">
            <div class="pfLabel">Biggest Win:</div>
            <div class="pfValue pfGreen" id="pfBiggestWinVal">${fmtMoney2(
              stats.biggestWin
            )}</div>
          </div>
        </div>

        ${renderDotsMenu()}
      </div>
    `;
  }

  function wireDotsMenu(userEmail) {
    const dotsBtn = $("#pfDotsBtn", modal);
    const menu = $("#pfMenu", modal);
    const refreshBtn = $("#pfMenuRefresh", modal);
    const liveRankBtn = $("#pfMenuLiveRank", modal);
    const resetBalBtn = $("#pfMenuResetBalance", modal);
    const logoutBtn = $("#pfMenuLogout", modal);

    if (!dotsBtn || !menu) return;

    function hideMenu() {
      menu.classList.remove("show");
    }
    function toggleMenu() {
      menu.classList.toggle("show");
    }

    dotsBtn.onclick = (e) => {
      e.stopPropagation();
      toggleMenu();
    };

    const onDocPointerDown = (e) => {
      if (!menu.classList.contains("show")) return;
      const t = e.target;
      if (menu.contains(t)) return;
      if (dotsBtn === t || dotsBtn.contains(t)) return;
      hideMenu();
    };

    if (modal.__pfDocPointerDown) {
      document.removeEventListener(
        "pointerdown",
        modal.__pfDocPointerDown,
        true
      );
    }
    modal.__pfDocPointerDown = onDocPointerDown;
    document.addEventListener("pointerdown", onDocPointerDown, true);

    menu.addEventListener("pointerdown", (e) => e.stopPropagation());

    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        hideMenu();
        if (!supabase || !authedUser) return;

        const { wallet, error } = await getOrCreateWallet(
          supabase,
          authedUser.id
        );
        if (error || !wallet) return;

        walletReady = true;

        // ✅ prefer newer local snapshot if present
        const snap = readLocalBalSnap();
        if (snap && snap.userId === authedUser.id && snap.ts > __lastBalTs) {
          applyBalanceIfNewer(snap.balance, snap.ts, snap.userId);
          // push it back to DB so refresh won't snap back
          await updateWalletBalance(supabase, authedUser.id, snap.balance);
        } else {
          // normal DB refresh
          const ts = Date.now();
          applyBalanceIfNewer(wallet.balance, ts, authedUser.id);
          writeLocalBalSnap(authedUser.id, wallet.balance, ts);
        }

        stats.totalWagered = Number(wallet.total_wagered) || 0;
        recomputeProfit();
        setModalContentProfile(userEmail);
        scheduleUiUpdate();
      };
    }

    if (liveRankBtn) {
      liveRankBtn.onclick = () => {
        hideMenu();
        window.dispatchEvent(new Event("PROFILE:OPEN_LIVE_RANK"));
      };
    }

    // ✅ NEW: Reset Balance (opens confirm modal in separate script)
    if (resetBalBtn) {
      resetBalBtn.onclick = () => {
        hideMenu();

        const cur = Math.max(0, Number(stats.balance) || 0);
        const target = START_BALANCE;

        window.dispatchEvent(
          new CustomEvent("PROFILE:OPEN_RESET_BALANCE", {
            detail: {
              currentBalance: cur,
              resetTo: target,
              loggedIn: !!authedUser,
              userId: authedUser?.id || null,
            },
          })
        );
      };
    }

    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        hideMenu();
        if (!supabase) return;
        await supabase.auth.signOut();
        authedUser = null;
        walletReady = false;
        setModalContentLoggedOut();
        scheduleUiUpdate();
      };
    }
  }

  function setModalContentProfile(userEmail) {
    $("#pfTitle", modal).textContent = "User Name";
    $("#pfBody", modal).innerHTML = renderProfileBody();
    wireDotsMenu(userEmail);
    scheduleUiUpdate();
  }

  function setModalContentLoggedOut() {
    $("#pfTitle", modal).textContent = "User Name";
    $("#pfBody", modal).innerHTML = `
      ${renderRankTop()}

      <div class="pfFrame1">
        <div class="pfBalanceRow">
          <div class="pfBalanceLabel">Balance:</div>
          <div class="pfBalanceValue" id="pfBalVal">${fmtMoney2(
            START_BALANCE
          )}</div>
        </div>
      </div>

      <div class="pfFrame2" id="pfStatsFrame">
        <div class="pfStatsGrid">
          <div class="pfStat"><div class="pfLabel">Wins:</div><div class="pfValue pfGreen" id="pfWinsVal">0</div></div>
          <div class="pfStat"><div class="pfLabel">Losses:</div><div class="pfValue pfRed" id="pfLossesVal">0</div></div>
          <div class="pfStat"><div class="pfLabel">Profit:</div><div class="pfValue" id="pfProfitVal">0.00</div></div>
          <div class="pfStat"><div class="pfLabel">Total Wagered:</div><div class="pfValue" id="pfTotalWageredVal">0.00</div></div>
          <div class="pfStat"><div class="pfLabel">Total Bets:</div><div class="pfValue" id="pfBetsVal">0</div></div>
          <div class="pfStat"><div class="pfLabel">Win Rate:</div><div class="pfValue" id="pfWinRateVal">0.00%</div></div>
          <div class="pfStat" style="grid-column: 1 / -1;"><div class="pfLabel">Biggest Win:</div><div class="pfValue pfGreen" id="pfBiggestWinVal">0.00</div></div>
        </div>

        ${renderDotsMenu()}
      </div>

      <div class="pfLoginWrap">
        <div class="pfForm">
          <input class="pfInput" id="pfEmail" type="email" placeholder="Email" autocomplete="username" />
          <input class="pfInput" id="pfPass" type="password" placeholder="Password" autocomplete="current-password" />
        </div>
        <div class="pfActions">
          <button class="pfBtnGhost" id="pfSignUpBtn" type="button">Create account</button>
          <button class="pfBtnPrimary" id="pfLoginBtn" type="button">Log in</button>
        </div>
      </div>
    `;

    wireDotsMenu("User Name");
    scheduleUiUpdate();

    $("#pfLoginBtn", modal).onclick = async () => {
      if (!supabase) return;
      const email = String($("#pfEmail", modal).value || "").trim();
      const pass = String($("#pfPass", modal).value || "").trim();
      if (!email || !pass) return;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });
      if (error || !data?.user) return;
      await onLoggedIn(data.user);
    };

    $("#pfSignUpBtn", modal).onclick = async () => {
      if (!supabase) return;
      const email = String($("#pfEmail", modal).value || "").trim();
      const pass = String($("#pfPass", modal).value || "").trim();
      if (!email || !pass) return;

      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
      });
      if (error || !data?.user) return;

      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) return;
      await onLoggedIn(data.user);
    };
  }

  async function onLoggedIn(user) {
    authedUser = user;

    const { wallet, error } = await getOrCreateWallet(supabase, user.id);
    if (error || !wallet) {
      walletReady = false;
      setModalContentLoggedOut();
      return;
    }

    walletReady = true;

    // ✅ prefer newer local snapshot (prevents snap-back)
    const snap = readLocalBalSnap();
    if (snap && snap.userId === user.id && snap.ts > __lastBalTs) {
      applyBalanceIfNewer(snap.balance, snap.ts, user.id);
      await updateWalletBalance(supabase, user.id, snap.balance);
    } else {
      const ts = Date.now();
      applyBalanceIfNewer(wallet.balance, ts, user.id);
      writeLocalBalSnap(user.id, wallet.balance, ts);
    }

    stats.totalWagered = Number(wallet.total_wagered) || 0;
    recomputeProfit();
    setModalContentProfile(user.email);
    scheduleUiUpdate();
  }

  async function syncFromSessionIfAny() {
    if (!supabase) return;
    const { user } = await getUser(supabase);
    if (!user) return;
    await onLoggedIn(user);
  }

  syncFromSessionIfAny().catch(() => {});

  btn.addEventListener("click", async () => {
    if (!supabase) {
      setModalContentLoggedOut();
      return modal.__open();
    }

    const { user } = await getUser(supabase);
    if (!user) {
      setModalContentLoggedOut();
      return modal.__open();
    }

    if (!authedUser || authedUser.id !== user.id) await onLoggedIn(user);
    else setModalContentProfile(user.email);

    modal.__open();
    scheduleUiUpdate();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
