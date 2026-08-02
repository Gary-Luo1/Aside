import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const common = {
  bundle: true,
  sourcemap: false,
  minify: false,
  target: ["chrome116"],
  logLevel: "info",
  loader: { ".css": "text" },
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all([
  build({
    ...common,
    entryPoints: [join(root, "src/background/index.ts")],
    outfile: join(dist, "background.js"),
    format: "esm",
  }),
  build({
    ...common,
    entryPoints: [join(root, "src/content/index.ts")],
    outfile: join(dist, "content.js"),
    format: "iife",
  }),
  build({
    ...common,
    entryPoints: [join(root, "src/options/index.ts")],
    outfile: join(dist, "options.js"),
    format: "iife",
  }),
]);

await Promise.all([
  cp(join(root, "manifest.json"), join(dist, "manifest.json")),
  cp(join(root, "src/options/index.html"), join(dist, "options.html")),
  cp(join(root, "src/options/styles.css"), join(dist, "options.css")),
  cp(join(root, "public"), join(dist, "public"), { recursive: true }),
]);

console.log("Build complete:", dist);
