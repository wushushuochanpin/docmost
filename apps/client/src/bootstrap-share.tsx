import "./styles/ui-refresh.css";
import "./styles/share-theme.css";
import "./styles/theme-palettes.css";

import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import ShareApp from "./ShareApp.tsx";
import {
  getStoredPalette,
  syncPaletteToDocument,
} from "@/features/theme/theme-palette.ts";
import { syncShareColorSchemeToDocument } from "@/features/share/share-color-scheme.ts";
import { ShareErrorBoundary } from "@/features/share/components/share-error-boundary.tsx";
import { useShareTranslation } from "@/features/share/share-translations.ts";
import { queryClient } from "@/query-client.ts";

syncPaletteToDocument(getStoredPalette());
syncShareColorSchemeToDocument();

function ShareErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  const { t } = useShareTranslation();
  const errorSummary = [error.name, error.message]
    .filter(Boolean)
    .join(": ")
    .slice(0, 240);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 24,
        background: "#f6f7f9",
        color: "#495057",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <p style={{ marginBottom: 16 }}>{t("Page failed to load")}</p>
      {errorSummary && (
        <p
          style={{
            margin: "0 0 16px",
            maxWidth: 560,
            color: "#6c757d",
            fontSize: 13,
            lineHeight: 1.5,
            wordBreak: "break-word",
          }}
        >
          {errorSummary}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          resetErrorBoundary();
          window.location.reload();
        }}
        style={{
          padding: "8px 16px",
          cursor: "pointer",
          background: "#228be6",
          color: "#fff",
          border: "none",
          borderRadius: 4,
        }}
      >
        {t("Reload")}
      </button>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(rootEl).render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <ShareErrorBoundary
        renderFallback={(props) => <ShareErrorFallback {...props} />}
      >
        <ShareApp />
      </ShareErrorBoundary>
    </QueryClientProvider>
  </BrowserRouter>,
);
