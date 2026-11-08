import { defineConfig, devices } from "@playwright/test";

/* The effects' shader pages on a GPU (effect-gpu.spec.ts): Chromium alone, no server of the site's, WebGL by ANGLE on
   SwiftShader and WebGPU on SwiftShader's Vulkan where the machine has no GPU, so every machine compiles and runs the
   same shader code. `pnpm --filter web e2e:gpu`. */
export default defineConfig({
  testDir: ".",
  testMatch: /effect-gpu\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: true,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: [
        "--enable-unsafe-webgpu",
        "--use-webgpu-adapter=swiftshader",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader"
      ]
    }
  }
});
