// how-to-play.js (ES module) — v2
// Tweaks requested:
// - ? icon uses the SAME grey->white hover behavior as live stats
// - Close X button has NO background by default; ONLY shows background on hover
// Everything else stays the same.

const STYLE_ID = "how-to-play-styles-v2";
const BTN_ID = "howToPlayBtn-v2";
const MODAL_ID = "howToPlayModal-v2";

const HELP_SVG = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M12 19H12.01M8.21704 7.69689C8.75753 6.12753 10.2471 5 12 5C14.2091 5 16 6.79086 16 9C16 10.6565 14.9931 12.0778 13.558 12.6852C12.8172 12.9988 12.4468 13.1556 12.3172 13.2767C12.1629 13.4209 12.1336 13.4651 12.061 13.6634C12 13.8299 12 14.0866 12 14.6L12 16"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
</svg>
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    /* Match Live Stats icon behavior: greyed, turns white on hover */
    .htpBtn{
      position:absolute;
      left: 46px;     /* next to stats icon */
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
    .htpBtn:hover{ color: rgba(255,255,255,.98); }
    .htpBtn:active{ transform: translateY(1px); }
    .htpBtn svg{ width: 22px; height: 22px; display:block; }

    /* Modal */
    .htpModal{
      position: fixed;
      inset: 0;
      z-index: 99999;
      display:none;
      align-items:center;
      justify-content:center;
      padding: 18px;
    }
    .htpModal.show{ display:flex; }

    .htpBackdrop{
      position:absolute;
      inset:0;
      background: rgba(0,0,0,.55);
    }

    .htpCard{
      position: relative;
      width: min(560px, calc(100vw - 36px));
      border-radius: 16px;
      background: #1a2f3a;
      box-shadow: 0 18px 60px rgba(0,0,0,.45);
      padding: 18px 18px 16px;
      z-index: 1;
    }

    .htpTop{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap: 12px;
      margin-bottom: 10px;
    }

    .htpTitle{
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-weight: 700;
      font-size: 16px;
      color: rgba(182,210,227,.98);
      letter-spacing: .2px;
      line-height: 1.2;
    }

    /* X: NO background by default; background only on hover */
    .htpClose{
      width: 36px;
      height: 36px;
      border-radius: 10px;
      border: 0;
      background: transparent;      /* <-- requested */
      color: rgba(255,255,255,.92);
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:center;
      transition: background .12s ease, transform .12s ease, color .12s ease;
    }
    .htpClose:hover{
      background: rgba(255,255,255,.08); /* <-- only on hover */
      color: rgba(255,255,255,.98);
    }
    .htpClose:active{ transform: translateY(1px); }
    .htpClose svg{ width: 18px; height: 18px; display:block; }

    .htpBody{
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color: rgba(182,210,227,.92);
      font-size: 13px;
      line-height: 1.55;
    }

    .htpSteps{
      margin: 10px 0 0;
      padding: 0;
      list-style: none;
      display:flex;
      flex-direction:column;
      gap: 10px;
    }

    .htpStep{
      background: #203a47;
      border-radius: 12px;
      padding: 10px 12px;
    }
    .htpStep b{
      color: rgba(255,255,255,.95);
      font-weight: 700;
    }

    .htpHint{
      margin-top: 12px;
      color: rgba(159,190,208,.92);
      font-size: 12px;
    }
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
  modal.className = "htpModal";
  modal.innerHTML = `
    <div class="htpBackdrop" id="htpBackdrop" aria-hidden="true"></div>

    <div class="htpCard" role="dialog" aria-modal="true" aria-label="How to play">
      <div class="htpTop">
        <div class="htpTitle">How to play</div>
        <button class="htpClose" id="htpClose" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="htpBody">
        Spin the wheel to try win a multiplier. If you win, your bet is multiplied.
        If you lose, you get 0x.

        <ul class="htpSteps">
          <li class="htpStep"><b>1)</b> Type your <b>Bet Amount</b> on the left.</li>
          <li class="htpStep"><b>2)</b> Pick <b>Difficulty</b> (Hard = bigger wins, but harder to hit).</li>
          <li class="htpStep"><b>3)</b> Pick <b>Segments</b> (more segments = more variety).</li>
          <li class="htpStep"><b>4)</b> Press <b>Place Bet</b> to spin.</li>
          <li class="htpStep"><b>5)</b> If the wheel lands on a color, you <b>win</b> that multiplier. If it lands on 0x, you <b>lose</b>.</li>
        </ul>

        <div class="htpHint">
          Tip: Hover the colored pills at the bottom to see the chance and profit preview.
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const backdrop = modal.querySelector("#htpBackdrop");
  const closeBtn = modal.querySelector("#htpClose");

  function close() {
    modal.classList.remove("show");
  }
  function open() {
    modal.classList.add("show");
  }

  // close on backdrop click
  backdrop.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    close();
  });

  // close on X
  closeBtn.addEventListener("click", close);

  // close on ESC
  document.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("show")) return;
    if (e.key === "Escape") close();
  });

  // prevent clicks inside card from closing
  modal.querySelector(".htpCard").addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });

  modal.__open = open;
  modal.__close = close;

  return modal;
}

function buildButton(leftPanel) {
  let btn = document.getElementById(BTN_ID);
  if (btn) return btn;

  btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.className = "htpBtn";
  btn.type = "button";
  btn.innerHTML = HELP_SVG;
  leftPanel.appendChild(btn);
  return btn;
}

function boot() {
  injectStyles();
  const leftPanel = ensureLeftPanelPositioned();
  if (!leftPanel) return;

  const modal = buildModal();
  const btn = buildButton(leftPanel);

  btn.addEventListener("click", () => {
    modal.__open();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
