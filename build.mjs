import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const PLUGIN_ID = "anti-bracket-freeze";

mkdirSync(`builds/${PLUGIN_ID}`, { recursive: true });

// The Kettu plugin loader wraps the bundled code as:
//   (bunny, definePlugin) => { <this output>; return plugin?.default ?? plugin; }
// so the IIFE just needs to assign its export to the global `plugin` var.
await build({
    entryPoints: ["index.ts"],
    outfile: `builds/${PLUGIN_ID}/index.js`,
    bundle: true,
    format: "iife",
    globalName: "plugin",
    target: "esnext",
    minify: true,
});

copyFileSync("manifest.json", `builds/${PLUGIN_ID}/manifest.json`);
