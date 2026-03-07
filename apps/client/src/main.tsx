const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found");
}

const isShareRoute = window.location.pathname.startsWith("/share/");

if (isShareRoute) {
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

if (isShareRoute) {
  void import("./bootstrap-share.tsx").catch(renderBootstrapError);
} else {
  void import("./bootstrap-app.tsx").catch(renderBootstrapError);
}
