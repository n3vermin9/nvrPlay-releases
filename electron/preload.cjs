const { ipcRenderer } = require("electron");

let state = { status: "idle" };
let host;
let shadow;

function ensureUpdateUI() {
  if (host || !document.documentElement) return;

  host = document.createElement("div");
  host.id = "nvrpllst-windows-update";
  host.style.position = "fixed";
  host.style.inset = "auto 20px 20px auto";
  host.style.zIndex = "2147483647";
  host.style.pointerEvents = "none";
  shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { color-scheme: dark; }
      * { box-sizing: border-box; }
      .update {
        width: min(380px, calc(100vw - 40px));
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, .14);
        border-radius: 18px;
        background: rgba(29, 29, 31, .96);
        color: #fff;
        font: 600 15px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 18px 55px rgba(0, 0, 0, .42);
        opacity: 0;
        transform: translateY(14px) scale(.97);
        transition: opacity .22s ease, transform .28s cubic-bezier(.2, .8, .2, 1);
        pointer-events: none;
      }
      .update.visible { opacity: 1; transform: none; pointer-events: auto; }
      button {
        display: grid;
        grid-template-columns: 42px 1fr auto;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-height: 72px;
        padding: 11px 14px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      button:focus-visible { outline: 2px solid #fff; outline-offset: -4px; border-radius: 18px; }
      button:disabled { cursor: default; }
      .icon {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border-radius: 50%;
        background: #f5f5f7;
        color: #111;
        font-size: 23px;
        font-weight: 500;
      }
      .copy { min-width: 0; }
      .title { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .detail { display: block; margin-top: 4px; color: #a1a1a6; font-size: 12px; font-weight: 500; }
      .action { color: #fff; font-size: 13px; }
      .progress { height: 3px; background: rgba(255, 255, 255, .1); }
      .progress > i { display: block; height: 100%; background: #fff; transition: width .15s linear; }
    </style>
    <section class="update" role="status" aria-live="polite">
      <button type="button">
        <span class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 7v5h-5"/><path d="M4 17v-5h5"/>
            <path d="M18.1 9A7 7 0 0 0 6.4 6.4L4 9M20 15l-2.4 2.6A7 7 0 0 1 5.9 15"/>
          </svg>
        </span>
        <span class="copy"><span class="title"></span><span class="detail"></span></span>
        <span class="action"></span>
      </button>
      <div class="progress" hidden><i></i></div>
    </section>
  `;

  shadow.querySelector("button").addEventListener("click", () => {
    if (state.status === "available") void ipcRenderer.invoke("nvrpllst:update-download");
    if (state.status === "downloaded") ipcRenderer.send("nvrpllst:update-install");
    if (state.status === "error" || state.status === "development") {
      void ipcRenderer.invoke("nvrpllst:update-check");
    }
  });

  document.documentElement.appendChild(host);
}

function render(nextState) {
  state = nextState || state;
  ensureUpdateUI();
  if (!shadow) return;

  const panel = shadow.querySelector(".update");
  const button = shadow.querySelector("button");
  const title = shadow.querySelector(".title");
  const detail = shadow.querySelector(".detail");
  const action = shadow.querySelector(".action");
  const progress = shadow.querySelector(".progress");
  const progressBar = shadow.querySelector(".progress i");
  const visible = ["available", "downloading", "downloaded", "development"].includes(state.status)
    || (state.status === "error" && state.userInitiated);

  panel.classList.toggle("visible", visible);
  progress.hidden = state.status !== "downloading";
  progressBar.style.width = `${state.percent || 0}%`;
  button.disabled = state.status === "downloading";

  if (state.status === "available") {
    title.textContent = "Update NvrPllst";
    detail.textContent = `Version ${state.availableVersion} is available`;
    action.textContent = "Download";
  } else if (state.status === "downloading") {
    title.textContent = "Downloading update";
    detail.textContent = `${state.percent || 0}% complete`;
    action.textContent = "";
  } else if (state.status === "downloaded") {
    title.textContent = "Update ready";
    detail.textContent = `Version ${state.availableVersion} has been downloaded`;
    action.textContent = "Restart";
  } else if (state.status === "error" || state.status === "development") {
    title.textContent = "Update unavailable";
    detail.textContent = state.message || "Check your connection and try again";
    action.textContent = "Retry";
  }
}

ipcRenderer.on("nvrpllst:update-state", (_event, nextState) => render(nextState));

window.addEventListener("DOMContentLoaded", async () => {
  ensureUpdateUI();
  render(await ipcRenderer.invoke("nvrpllst:update-get-state"));
});
