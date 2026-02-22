// reset-balance-modal.js (ES module) — v1
// Shows a Stake-style confirm popup when profile menu dispatches PROFILE:OPEN_RESET_BALANCE
// On confirm: calls PROFILE_API.setBalance(resetTo) (default 1000)

const STYLE_ID = "rbm-styles-v1";
const UI_ID = "rbm-root-v1";

function fmtMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    .rbmOverlay{
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }
    .rbmOverlay.show{ display:flex; }

    .rbmBackdrop{
      position:absolute;
      inset:0;
      background: rgba(0,0,0,.55);
    }

    .rbmCard{
      position: relative;
      width: min(640px, calc(100vw - 36px));
      border-radius: 16px;
      background: #1c3643;
      box-shadow: 0 22px 70px rgba(0,0,0,.55);
      overflow: hidden;
      z-index: 1;
      border: 1px solid rgba(255,255,255,.06);
    }

    .rbmTop{
      height: 56px;
      padding: 0 16px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      background: rgba(255,255,255,.03);
    }

    .rbmTitle{
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 800;
      font-size: 22px;
      color: rgba(240,250,255,.96);
      letter-spacing: .2px;
    }

    .rbmX{
      width: 40px;
      height: 40px;
      border-radius: 12px;
      border: 0;
      background: transparent;
      color: rgba(210,235,248,.82);
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:center;
      transition: background .12s ease, color .12s ease, transform .12s ease;
    }
    .rbmX:hover{ background: rgba(255,255,255,.08); color: rgba(255,255,255,.98); }
    .rbmX:active{ transform: translateY(1px); }
    .rbmX svg{ width: 18px; height: 18px; display:block; }

    .rbmBody{
      padding: 16px;
      display:flex;
      flex-direction:column;
      gap: 12px;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color: rgba(210,235,248,.90);
      font-weight: 700;
      letter-spacing: .1px;
      font-size: 16px;
      line-height: 1.25;
    }

    .rbmRow{ }
    .rbmEm{ color: rgba(255,255,255,.98); }
    .rbmRed{ color: rgba(255,77,109,.98); }

    .rbmBtn{
      margin-top: 10px;
      height: 52px;
      border: 0;
      border-radius: 10px;
      background: #1267c6;
      color: #fff;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 900;
      letter-spacing: .4px;
      font-size: 16px;
      cursor: pointer;
      transition: filter .12s ease, transform .12s ease;
    }
    .rbmBtn:hover{ filter: brightness(1.06); }
    .rbmBtn:active{ transform: translateY(1px); }

    .rbmBtn:disabled{
      opacity: .6;
      cursor: not-allowed;
      filter: none;
      transform: none;
    }
  `;
  document.head.appendChild(st);
}

function buildUI() {
  injectStyles();

  let root = document.getElementById(UI_ID);
  if (root) root.remove();

  root = document.createElement("div");
  root.id = UI_ID;
  root.className = "rbmOverlay";
  root.innerHTML = `
    <div class="rbmBackdrop" id="rbmBackdrop"></div>

    <div class="rbmCard" role="dialog" aria-modal="true" aria-label="Reset balance confirmation">
      <div class="rbmTop">
        <div class="rbmTitle">Are you sure?</div>
        <button class="rbmX" id="rbmClose" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="rbmBody">
        <div class="rbmRow">
          Resetting your <span class="rbmEm">balance</span> cannot be <span class="rbmRed">undone</span>
        </div>

        <div class="rbmRow" id="rbmLine2"></div>

        <div class="rbmRow">
          Click <span class="rbmEm">X</span> to <span class="rbmRed">cancel</span>
        </div>

        <div class="rbmRow" id="rbmCur"></div>

        <button class="rbmBtn" id="rbmConfirm" type="button">RESET BALANCE</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const backdrop = root.querySelector("#rbmBackdrop");
  const closeBtn = root.querySelector("#rbmClose");
  const line2 = root.querySelector("#rbmLine2");
  const cur = root.querySelector("#rbmCur");
  const confirmBtn = root.querySelector("#rbmConfirm");

  let curBalance = 0;
  let resetTo = 1000;

  function close() {
    root.classList.remove("show");
    confirmBtn.disabled = false;
  }

  function open(payload) {
    // prefer payload; fallback to PROFILE_API state
    const st =
      window.PROFILE_API && typeof window.PROFILE_API.getState === "function"
        ? window.PROFILE_API.getState()
        : null;

    curBalance = Math.max(
      0,
      Number(payload?.currentBalance ?? st?.balance ?? 0) || 0
    );
    resetTo = Math.max(
      0,
      Number(payload?.resetTo ?? st?.startBalance ?? 1000) || 1000
    );

    line2.textContent = `Resetting your balance will set your balance back to ${fmtMoney2(
      resetTo
    )}`;
    cur.textContent = `Current Balance: ${fmtMoney2(curBalance)}`;

    root.classList.add("show");
  }

  backdrop.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    close();
  });
  closeBtn.addEventListener("click", close);

  document.addEventListener("keydown", (e) => {
    if (!root.classList.contains("show")) return;
    if (e.key === "Escape") close();
  });

  confirmBtn.addEventListener("click", async () => {
    if (
      !window.PROFILE_API ||
      typeof window.PROFILE_API.setBalance !== "function"
    ) {
      close();
      return;
    }

    confirmBtn.disabled = true;

    // reset balance
    window.PROFILE_API.setBalance(resetTo);

    // optional: tell other widgets something big changed
    window.dispatchEvent(
      new CustomEvent("PROFILE:BALANCE_RESET", {
        detail: { resetTo },
      })
    );

    // close shortly after to feel snappy
    setTimeout(() => close(), 120);
  });

  // listen for open event from profile menu
  window.addEventListener("PROFILE:OPEN_RESET_BALANCE", (ev) => {
    open(ev?.detail || null);
  });

  return { open, close };
}

function boot() {
  buildUI();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
