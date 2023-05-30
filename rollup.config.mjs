/* eslint-disable @typescript-eslint/explicit-function-return-type */
import terser from "@rollup/plugin-terser"
import typescript from "@rollup/plugin-typescript"
import { sync } from "rimraf"

function config({ format, minify, input, ext = "js" }) {
  const dir = `dist/${format}/`
  const minifierSuffix = minify ? ".min" : ""
  return {
    input: `./src/${input}.ts`,
    output: {
      name: "TangoRPC",
      file: `${dir}/${input}${minifierSuffix}.${ext}`,
      format,
      sourcemap: true,
    },
    plugins: [
      typescript({
        tsconfig: "./tsconfig.build.json",
        compilerOptions: {
          declaration: true,
          declarationDir: ".",
          sourceMap: true,
          outDir: "dist",
        },
      }),
      minify
        ? terser({
            compress: true,
            mangle: true,
          })
        : undefined,
    ].filter(Boolean),
  }
}

sync("dist")

export default [
  { input: "tango-rpc", format: "esm", minify: false, ext: "mjs" },
  { input: "tango-rpc", format: "esm", minify: true, ext: "mjs" },
  { input: "tango-rpc", format: "esm", minify: false },
  { input: "tango-rpc", format: "esm", minify: true },
  { input: "tango-rpc", format: "umd", minify: false },
  { input: "tango-rpc", format: "umd", minify: true },
].map(config)
