import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Rollup/rolldown advancedChunks groups that pull heavy lazy libraries
 * (mermaid / @excalidraw / katex) into a manual vendor group must not exist.
 * Grouping such libraries splits them into a group chunk plus sub-chunks;
 * server (Rust) builds can produce mismatched cross-chunk imports or cyclic
 * splits (prod <-> index) whose re-exported values are not initialized when
 * the sub-chunk runs -> "TypeError: x is not a function" on page load.
 * Natural chunking keeps these libraries lazy and guarantees consistent
 * exports; see apps/client/vite.config.ts comments.
 */
const noHeavyVendorGroups = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Do not manually group mermaid/excalidraw/katex via advancedChunks (server builds can emit broken cross-chunk interfaces).",
    },
    messages: {
      noGroup:
        "Do not manually group '{{name}}' (test '{{test}}') in advancedChunks: grouping mermaid/excalidraw/katex causes intermittent server-build crashes (cross-chunk import mismatch / cyclic split). Let rolldown chunk them naturally.",
    },
  },
  create(context) {
    const HEAVY_LIB_RE = /@excalidraw|mermaid|katex/i;

    function regexSource(node) {
      // test: /pattern/  (RegexLiteral)
      if (node.type === "Literal" && node.regex) return node.regex.pattern;
      // test: new RegExp("pattern", ...)
      if (
        node.type === "NewExpression" &&
        node.callee &&
        node.callee.type === "Identifier" &&
        node.callee.name === "RegExp" &&
        node.arguments &&
        node.arguments[0] &&
        node.arguments[0].type === "Literal"
      ) {
        return String(node.arguments[0].value);
      }
      return null;
    }

    return {
      Property(node) {
        if (
          node.key.type !== "Identifier" ||
          node.key.name !== "advancedChunks" ||
          node.value.type !== "ObjectExpression"
        ) {
          return;
        }
        const groupsProp = node.value.properties.find(
          (p) =>
            p.type === "Property" &&
            p.key.type === "Identifier" &&
            p.key.name === "groups",
        );
        if (
          !groupsProp ||
          groupsProp.value.type !== "ArrayExpression"
        ) {
          return;
        }
        for (const element of groupsProp.value.elements) {
          if (!element || element.type !== "ObjectExpression") continue;
          const nameProp = element.properties.find(
            (p) =>
              p.type === "Property" &&
              p.key.type === "Identifier" &&
              p.key.name === "name",
          );
          const testProp = element.properties.find(
            (p) =>
              p.type === "Property" &&
              p.key.type === "Identifier" &&
              p.key.name === "test",
          );
          const testSource = testProp
            ? regexSource(testProp.value)
            : null;
          if (testSource && HEAVY_LIB_RE.test(testSource)) {
            const name =
              nameProp && nameProp.value.type === "Literal"
                ? String(nameProp.value.value)
                : "(unnamed)";
            context.report({
              node: element,
              messageId: "noGroup",
              data: { name, test: testSource },
            });
          }
        }
      },
    };
  },
};

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      local: { rules: { "no-heavy-vendor-groups": noHeavyVendorGroups } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "local/no-heavy-vendor-groups": "error",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-useless-escape": "off",
    },
  },
);
