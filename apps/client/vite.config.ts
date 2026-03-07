import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

export const envPath = path.resolve(process.cwd(), "..", "..");

const manualChunkGroups = [
  {
    name: "react-vendor",
    matchers: [
      "/node_modules/react/",
      "/node_modules/react-dom/",
      "/node_modules/scheduler/",
    ],
  },
  {
    name: "mantine-vendor",
    matchers: [
      "/@mantine/core/",
      "/@mantine/hooks/",
      "/@mantine/spotlight/",
      "/@floating-ui/",
    ],
  },
];

function resolveManualChunk(id: string) {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  for (const group of manualChunkGroups) {
    if (group.matchers.some((matcher) => id.includes(matcher))) {
      return group.name;
    }
  }

  return undefined;
}

export default defineConfig(({ mode }) => {
  const {
    APP_URL,
    VITE_PROXY_TARGET,
    FILE_UPLOAD_SIZE_LIMIT,
    FILE_IMPORT_SIZE_LIMIT,
    DRAWIO_URL,
    CLOUD,
    SUBDOMAIN_HOST,
    COLLAB_URL,
    BILLING_TRIAL_DAYS,
    POSTHOG_HOST,
    POSTHOG_KEY,
  } = loadEnv(mode, envPath, "");

  const proxyTarget = VITE_PROXY_TARGET || APP_URL;

  return {
    define: {
      "process.env": {
        APP_URL,
        FILE_UPLOAD_SIZE_LIMIT,
        FILE_IMPORT_SIZE_LIMIT,
        DRAWIO_URL,
        CLOUD,
        SUBDOMAIN_HOST,
        COLLAB_URL,
        BILLING_TRIAL_DAYS,
        POSTHOG_HOST,
        POSTHOG_KEY,
      },
      APP_VERSION: JSON.stringify(process.env.npm_package_version),
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    server: {
      host: process.env.VITE_DEV_HOST === "true" ? "0.0.0.0" : false,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: false,
        },
        "/socket.io": {
          target: proxyTarget,
          ws: true,
          rewriteWsOrigin: true,
        },
        "/collab": {
          target: proxyTarget,
          ws: true,
          rewriteWsOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: resolveManualChunk,
        },
      },
    },
  };
});
