import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const watch = process.argv.includes("--watch");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(projectRoot, "dist");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp(resolve(projectRoot, "manifest.json"), resolve(outdir, "manifest.json"));

const sharedOptions = {
  bundle: true,
  outdir,
  absWorkingDir: projectRoot,
  target: "chrome120",
  sourcemap: true,
  logLevel: "info"
};

// The background service worker is declared "type": "module" in manifest.json,
// so it can be loaded as an ES module.
const backgroundOptions = {
  ...sharedOptions,
  entryPoints: {
    background: resolve(projectRoot, "src/background/service-worker.ts")
  },
  format: "esm"
};

// Content scripts (isolated- and main-world) are always injected as classic
// scripts by Manifest V3 — there is no module option for content_scripts
// entries — so they must not contain a top-level `export`. IIFE avoids that.
const contentOptions = {
  ...sharedOptions,
  entryPoints: {
    content: resolve(projectRoot, "src/content/steam-market-content.ts"),
    "inventory-content": resolve(projectRoot, "src/content/steam-inventory-content.ts"),
    "inventory-page": resolve(projectRoot, "src/page/steam-inventory-selection-entry.ts")
  },
  format: "iife"
};

if (watch) {
  const backgroundContext = await context(backgroundOptions);
  const contentContext = await context(contentOptions);
  await Promise.all([backgroundContext.watch(), contentContext.watch()]);
  console.log("Watching extension sources...");
} else {
  await Promise.all([build(backgroundOptions), build(contentOptions)]);
}
