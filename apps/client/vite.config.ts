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
          strictExecutionOrder: true,
          advancedChunks: {
            // Only the matched packages go into a group chunk; their
            // dependencies (DOMPurify, jotai, floating-ui, mermaid, ...) are
            // left to natural chunking. Rolldown defaults this to `true`, which
            // recursively drags every transitive dependency into the group
            // chunk — e.g. @excalidraw/excalidraw -> @excalidraw/
            // mermaid-to-excalidraw -> mermaid, plus shared DOMPurify/jotai —
            // and then any eager chunk that needs one of those shared modules
            // statically imports the whole 5MB vendor chunk on every page load.
            includeDependenciesRecursively: false,
            groups: [
              {
                name: "vendor-mantine",
                test: /[\\/]node_modules[\\/]@mantine[\\/]/,
              },
              {
                // The shared `__vitePreload` module. Rolldown hosts it in ONE
                // chunk and every chunk that dynamically imports with preload
                // deps statically imports that chunk. If it lands in a heavy
                // vendor chunk (mermaid/excalidraw), the whole library becomes
                // an eager dependency of index/layout on every page load. Give
                // it its own tiny high-priority chunk instead.
                name: "vendor-preload-helper",
                test: new RegExp("\\0vite/preload-helper\\.js$"),
                priority: 100,
              },
              {
                // DOMPurify is a shared dependency: the page editor sanitizes
                // rendered HTML with it directly, and @excalidraw/excalidraw
                // pulls it in too. With `includeDependenciesRecursively`,
                // rolldown merges it into the excalidraw group chunk, so
                // layout/page end up statically importing the 5MB excalidraw
                // chunk just to reach DOMPurify. Keep it in its own small
                // eager chunk instead.
                name: "vendor-dompurify",
                test: /[\\/]node_modules[\\/](dompurify|isomorphic-dompurify)([\\/]|$)/,
                priority: 90,
              },
              // Mermaid is intentionally NOT manually grouped. Grouping it with
              // advancedChunks makes rolldown split mermaid into a group chunk
              // plus separate sub-chunks (architectureDiagram etc.), and in
              // server builds the sub-chunk's import names do not match the
              // group chunk's re-exported names (`ut as a` vs importing `ut`)
              // -> "TypeError: n is not a function" on every page render.
              // Let rolldown chunk mermaid naturally (its dynamic import chain
              // keeps it lazy); natural chunking guarantees consistent exports
              // between chunks.
              // Excalidraw and katex are intentionally NOT manually grouped
              // for the same reason: grouping @excalidraw/excalidraw split it
              // into vendor-excalidraw plus a `prod` sub-chunk that imports the
              // group chunk's re-exports, and server builds produced a cyclic
              // split (prod <-> index) whose re-exported value is not yet
              // initialized when prod runs -> "TypeError: b is not a function"
              // in prod-*.js whenever an excalidraw node renders. Natural
              // chunking keeps excalidraw lazy via its dynamic import chain
              // (excalidraw-view/excalidraw-menu) and guarantees consistent
              // exports between chunks.
              // Group only third-party packages. Our own source files under
              // .../excalidraw/, .../mermaid-view.tsx etc. must NOT match these
              // tests: matching them pulls the lazy wrappers into the vendor
              // chunk and makes the heavy libs a static (eager) dependency of
              // the layout/page chunks on every page load.
              // (vendor-mermaid / vendor-excalidraw / vendor-katex groups were
              // removed — see the two comments above.)
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
