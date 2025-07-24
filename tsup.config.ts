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
    entry: [
      './src/index.ts', // 确保这个路径指向你的源码入口
    ],
    dts: true,
    // sourcemap: true,
    // watch: !!argv.watch,
    clean: true,
    treeshake: true,
    minify: argv.watch ? false : "terser",
    target: "esnext",
    noExternal: [/^@sentry\//],
    format: [/* "cjs",  */"esm"],
    ...defaultConfig,
  },
]);
