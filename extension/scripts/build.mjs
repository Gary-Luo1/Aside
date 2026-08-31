import { build, context } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

/** --prod 走发布配置（压缩、无 sourcemap），默认走开发配置（可读、带 sourcemap）。 */
const prod = process.argv.includes("--prod");
const watch = process.argv.includes("--watch");

if (watch && prod) {
  throw new Error("--watch 与 --prod 不能同时使用：开发需要 sourcemap。");
}

const common = {
  bundle: true,
  sourcemap: prod ? false : "linked",
  minify: prod,
  target: ["chrome116"],
  logLevel: "info",
  loader: { ".css": "text", ".woff2": "dataurl" },
  ...(prod ? { drop: ["debugger"] } : {}),
};

const entries = [
  { entry: "src/background/index.ts", out: "background.js", format: "esm" },
  { entry: "src/content/index.ts", out: "content.js", format: "iife" },
  { entry: "src/options/index.ts", out: "options.js", format: "iife" },
];

const optionsFor = (item) => ({
  ...common,
  entryPoints: [join(root, item.entry)],
  outfile: join(dist, item.out),
  format: item.format,
});

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

if (watch) {
  const contexts = await Promise.all(entries.map((item) => context(optionsFor(item))));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("Watching for changes (Ctrl+C to stop):", root);
} else {
  await Promise.all(entries.map((item) => build(optionsFor(item))));
}

await Promise.all([
  cp(join(root, "manifest.json"), join(dist, "manifest.json")),
  cp(join(root, "src/options/index.html"), join(dist, "options.html")),
  cp(join(root, "src/options/styles.css"), join(dist, "options.css")),
  cp(join(root, "public"), join(dist, "public"), { recursive: true }),
]);

// 版本落盘，便于排查线上问题与打包命名。
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
await writeFile(join(dist, "VERSION"), `${manifest.version}\n`, "utf8");

console.log(`Build complete (${prod ? "prod" : "dev"}):`, dist);
