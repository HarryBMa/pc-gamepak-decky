import { defineConfig } from "@decky/rollup";

// The Decky preset does the whole build: bundles src/index.tsx to
// dist/index.js, externalises react and @decky/*, and emits the shape the
// loader expects. There is nothing project-specific to add.
export default defineConfig();
