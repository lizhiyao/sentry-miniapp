import { defineConfig } from "tsup";
import minimist from 'minimist';
import pkg from "./package.json";


const argv = minimist(process.argv.slice(2))
console.log('argv', argv);

const defaultConfig = {
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: `// ${pkg.name} v${pkg.version}`,
  },
}

export default defineConfig([
  {
    entry: {
      "sentry-miniapp": "src/index.ts",
    },
    dts: true,
    sourcemap: true,
    watch: !!argv.watch,
    // minify: argv.watch ? false : "terser",
    target: "esnext",
    format: ["cjs", "esm"],
    ...defaultConfig,
  },
]);
