import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const outDir = join(root, "release");

const version = (await readFile(join(dist, "VERSION"), "utf8")).trim();
const zipPath = join(outDir, `aside-${version}.zip`);

await mkdir(outDir, { recursive: true });
await rm(zipPath, { force: true });

// 用系统 zip 打包：只收 dist 内的文件，不带上层目录名。
const result = spawnSync("zip", ["-r", "-q", zipPath, "."], { cwd: dist });

if (result.error ?? result.status !== 0) {
  console.error("打包失败。请确认已安装 zip，或在文件管理器里手动压缩 extension/dist。");
  process.exit(1);
}

const { size } = await stat(zipPath);
console.log(`Packed: ${zipPath} (${(size / 1024).toFixed(1)} KB)`);
