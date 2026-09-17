import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

const envPath = path.resolve(process.cwd(), "..", "..");

const prosemirrorPackageEntries = [
  ["changeset", "prosemirror-changeset", "dist/index.js"],
  ["collab", "prosemirror-collab", "dist/index.js"],
  ["commands", "prosemirror-commands", "dist/index.js"],
  ["dropcursor", "prosemirror-dropcursor", "dist/index.js"],
  ["gapcursor", "prosemirror-gapcursor", "dist/index.js"],
  ["history", "prosemirror-history", "dist/index.js"],
  ["inputrules", "prosemirror-inputrules", "dist/index.js"],
  ["keymap", "prosemirror-keymap", "dist/index.js"],
  ["markdown", "prosemirror-markdown", "dist/index.js"],
  ["menu", "prosemirror-menu", "dist/index.js"],
  ["model", "prosemirror-model", "dist/index.js"],
  ["schema-basic", "prosemirror-schema-basic", "dist/index.js"],
  ["schema-list", "prosemirror-schema-list", "dist/index.js"],
  ["state", "prosemirror-state", "dist/index.js"],
  ["tables", "prosemirror-tables", "dist/index.js"],
  [
    "trailing-node",
    "prosemirror-trailing-node",
    "dist/prosemirror-trailing-node.js",
  ],
  ["transform", "prosemirror-transform", "dist/index.js"],
  ["view", "prosemirror-view", "dist/index.js"],
] as const;

const prosemirrorAliases = prosemirrorPackageEntries.flatMap(
  ([tiptapName, packageName, entryPoint]) => {
    const replacement = path.resolve(
      envPath,
      "node_modules",
      packageName,
      entryPoint,
    );

    return [
      { find: `@tiptap/pm/${tiptapName}`, replacement },
      { find: packageName, replacement },
    ];
  },
);

const prosemirrorPackageNames = prosemirrorPackageEntries.map(
  ([, packageName]) => packageName,
);

export default defineConfig(({ mode }) => {
  const {
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
  } = loadEnv(mode, envPath, "");

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
    build: {
      rolldownOptions: {
        output: {
          advancedChunks: {
            groups: [
              {
                name: "vendor-mantine",
                test: /[\\/]node_modules[\\/]@mantine[\\/]/,
              },
              { name: "vendor-mermaid", test: /mermaid|cytoscape|elkjs/ },
              { name: "vendor-excalidraw", test: /excalidraw/ },
              { name: "vendor-katex", test: /katex/ },
            ],
          },
        },
      },
    },
    resolve: {
      alias: [...prosemirrorAliases, { find: "@", replacement: "/src" }],
      dedupe: prosemirrorPackageNames,
    },
    server: {
      proxy: {
        "/api": {
          target: APP_URL,
          changeOrigin: false,
        },
        "/socket.io": {
          target: APP_URL,
          ws: true,
          rewriteWsOrigin: true,
        },
        "/collab": {
          target: APP_URL,
          ws: true,
          rewriteWsOrigin: true,
        },
      },
    },
  };
});
