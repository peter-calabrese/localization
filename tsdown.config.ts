import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  platform: "node",
  format: ["esm"],
  target: "node22",
  deps: {
    alwaysBundle: [/.*/],
  },
  sourcemap: true,
  clean: true,
  dts: false,
});
