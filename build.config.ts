import { defineBuildConfig } from "obuild/config";

export default defineBuildConfig({
  entries: [
    {
      type: "bundle",
      input: ["./src/index.ts"],
      dts: false,
    },
  ],
  hooks: {
    // Emit a single self-contained dist/index.mjs with no vendor code-splitting.
    // obuild's default chunk naming is path-separator sensitive and produces
    // different chunk files on Windows vs Linux, which breaks the committed-dist
    // sync check in CI. A single inlined file is reproducible across platforms.
    rolldownOutput(output) {
      const out = output as Record<string, unknown>;
      out.inlineDynamicImports = true;
      delete out.codeSplitting;
    },
  },
});
