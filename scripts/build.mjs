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

const options = {
  entryPoints: {
    background: resolve(projectRoot, "src/background/service-worker.ts"),
    content: resolve(projectRoot, "src/content/steam-market-content.ts")
  },
  bundle: true,
  outdir,
  absWorkingDir: projectRoot,
  format: "esm",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info"
};

if (watch) {
  const buildContext = await context(options);
  await buildContext.watch();
  console.log("Watching extension sources...");
} else {
  await build(options);
}
