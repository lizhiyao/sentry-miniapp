import Module from "module";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import pkg from "./package.json" 

const { builtinModules } = Module;
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const nodeBuiltIns = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const banner = `// ${pkg.name} v${pkg.version}`;

export default defineConfig({
  build: {
    target: "es2015",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"/* , "cjs" */],
    },
    outDir: "dist",
    emptyOutDir: true,
    // minify: "terser",
    rollupOptions: {
      external: (id) => nodeBuiltIns.has(id),
      treeshake: true,
      output: {
        banner,
      },
    },
  },
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    dts({
      entryRoot: "src",
      rollupTypes: true,
      outDir: "dist",
    }),
  ],
});
