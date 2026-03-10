const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found");
}

const isShareRoute = window.location.pathname.startsWith("/share/");
const shareDebug =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("debug") === "1";

function shareDebugLog(msg: string) {
  if (!shareDebug || typeof (window as any).__shareDebug !== "function") return;
  (window as any).__shareDebug(msg);
}

if (isShareRoute) {
  if (shareDebug) {
    const debugEl = document.createElement("div");
    debugEl.id = "share-debug";
    debugEl.setAttribute(
      "style",
      "position:fixed;bottom:0;left:0;right:0;max-height:40%;overflow:auto;background:#1e1e1e;color:#0f0;font:12px monospace;padding:8px;z-index:99999;white-space:pre-wrap;word-break:break-all;border-top:1px solid #333;",
    );
    document.body.appendChild(debugEl);
    (window as any).__shareDebug = (msg: string) => {
      debugEl.textContent += msg + "\n";
      debugEl.scrollTop = debugEl.scrollHeight;
    };
    const origOnError = window.onerror;
    window.onerror = (msg, src, line, col, err) => {
      shareDebugLog(`[onerror] ${String(msg)} @ ${String(src)}:${line}`);
      return origOnError ? origOnError(msg, src, line, col, err) : false;
    };
    window.addEventListener("unhandledrejection", (e) => {
      shareDebugLog(
        `[unhandledrejection] ${e.reason?.message ?? String(e.reason)}`,
      );
    });
  }

  rootEl.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;background:#f7f8fa;">
      <div style="width:min(900px,100%);margin:0 auto;padding:80px 24px;">
        <div style="display:flex;flex-direction:column;gap:24px;">
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="height:16px;width:18%;border-radius:999px;background:#eceff3;"></div>
            <div style="height:40px;width:58%;border-radius:12px;background:#eceff3;"></div>
            <div style="height:18px;width:42%;border-radius:10px;background:#eceff3;"></div>
          </div>
          <div style="height:220px;border-radius:16px;background:#eceff3;"></div>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="height:16px;width:100%;border-radius:999px;background:#eceff3;"></div>
            <div style="height:16px;width:96%;border-radius:999px;background:#eceff3;"></div>
            <div style="height:16px;width:92%;border-radius:999px;background:#eceff3;"></div>
            <div style="height:16px;width:88%;border-radius:999px;background:#eceff3;"></div>
            <div style="height:16px;width:84%;border-radius:999px;background:#eceff3;"></div>
            <div style="height:16px;width:79%;border-radius:999px;background:#eceff3;"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

const renderBootstrapError = () => {
  rootEl.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f6f7f9;color:#495057;font-family:system-ui,sans-serif;text-align:center;">
      <div>
        <p style="margin:0 0 16px;">页面加载出错</p>
        <button type="button" style="padding:8px 16px;cursor:pointer;background:#228be6;color:#fff;border:none;border-radius:4px;" onclick="window.location.reload()">
          重新加载
        </button>
      </div>
    </div>
  `;
};

const SHARE_LOAD_TIMEOUT_MS = 25000;

if (isShareRoute) {
  shareDebugLog("Bootstrap: loading chunk...");
  const loadPromise = import("./bootstrap-share.tsx");
  const timeoutId = setTimeout(() => {
    if (rootEl.hasAttribute("data-share-bootstrap-mounted")) return;
    shareDebugLog("Bootstrap: timeout (chunk did not load in time)");
    rootEl.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f7f8fa;color:#495057;font-family:system-ui,sans-serif;text-align:center;">
        <div>
          <p style="margin:0 0 8px;font-size:1rem;">加载超时</p>
          <p style="margin:0 0 20px;font-size:0.875rem;color:#6c757d;">请检查网络后重试</p>
          <button type="button" style="padding:10px 20px;cursor:pointer;background:#228be6;color:#fff;border:none;border-radius:8px;font-size:0.95rem;" onclick="window.location.reload()">
            重新加载
          </button>
        </div>
      </div>
    `;
  }, SHARE_LOAD_TIMEOUT_MS);
  loadPromise
    .then(() => {
      clearTimeout(timeoutId);
      shareDebugLog("Bootstrap: chunk loaded");
    })
    .catch((err) => {
      shareDebugLog(`Bootstrap: failed - ${err?.message ?? String(err)}`);
      renderBootstrapError();
    });
} else {
  void import("./bootstrap-app.tsx").catch(renderBootstrapError);
}
