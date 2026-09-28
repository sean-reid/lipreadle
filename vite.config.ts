import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

// Inlines the single stylesheet into the HTML so first paint needs one request,
// and stamps the inline theme script's hash into the CSP in _headers.
function inlineCritical(): Plugin {
  let outDir = "dist";
  let scriptHash = "";
  let styleHash = "";
  return {
    name: "lipreadle:inline-critical",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const inline = /<script>([\s\S]*?)<\/script>/.exec(html);
        if (inline) {
          scriptHash = createHash("sha256")
            .update(inline[1] ?? "")
            .digest("base64");
        }
        const bundle = ctx.bundle;
        if (!bundle) return html;
        let out = html;
        for (const [name, asset] of Object.entries(bundle)) {
          if (asset.type !== "asset" || !name.endsWith(".css")) continue;
          const tag = new RegExp(
            `<link[^>]+href="/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`,
          );
          if (tag.test(out)) {
            const css = String(asset.source);
            styleHash = createHash("sha256").update(css).digest("base64");
            out = out.replace(tag, `<style>${css}</style>`);
            delete bundle[name];
          }
        }
        return out;
      },
    },
    closeBundle() {
      const path = resolve(outDir, "_headers");
      const headers = readFileSync(path, "utf8")
        .replace("__THEME_SCRIPT_HASH__", scriptHash)
        .replace("__STYLE_HASH__", styleHash);
      writeFileSync(path, headers);
    },
  };
}

export default defineConfig({
  plugins: [inlineCritical()],
  build: {
    target: "es2022",
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
  server: {
    proxy: { "/api": "http://localhost:8787", "/clip": "http://localhost:8787" },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
