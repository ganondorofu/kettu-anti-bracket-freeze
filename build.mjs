import { build } from "esbuild";

// The Kettu plugin loader wraps the bundled code as:
//   (bunny, definePlugin) => { <this output>; return plugin?.default ?? plugin; }
// so the IIFE just needs to assign its export to the global `plugin` var.
await build({
    entryPoints: ["index.ts"],
    outfile: "index.js",
    bundle: true,
    format: "iife",
    globalName: "plugin",
    target: "esnext",
    minify: true,
});
