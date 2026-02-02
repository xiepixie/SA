#!/usr/bin/env bun
/**
 * Build script for FSRS Engine
 *
 * Usage:
 *   bun run build.ts          # Release build
 *   bun run build.ts --debug  # Debug build
 *   bun run build.ts --test   # Build and run tests
 */

import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const isDebug = args.includes("--debug") || process.env.FSRS_DEBUG === "1";
const runTests = args.includes("--test");
const enableDebugFeature = args.includes("--debug-feature") || isDebug;

const cwd = import.meta.dir;

async function main() {
  console.log("🦀 Building FSRS Engine...\n");

  // Check for Cargo
  try {
    await $`cargo --version`.quiet();
  } catch {
    console.error("❌ Cargo not found. Please install Rust: https://rustup.rs/");
    process.exit(1);
  }

  // Build Rust library
  const buildMode = isDebug ? "" : "--release";
  const featureFlags = enableDebugFeature ? ["--features", "debug"] : [];
  console.log(`📦 Building Rust library (${isDebug ? "debug" : "release"})...`);
  if (enableDebugFeature) {
    console.log("   With debug logging feature enabled");
  }

  try {
    await $`cargo build ${buildMode} ${featureFlags}`.cwd(cwd);
    console.log("✅ Rust build complete\n");
  } catch (e) {
    console.error("❌ Rust build failed");
    process.exit(1);
  }

  // Check library exists
  const targetDir = isDebug ? "debug" : "release";
  const libName =
    process.platform === "win32"
      ? "fsrs_engine.dll"
      : process.platform === "darwin"
        ? "libfsrs_engine.dylib"
        : "libfsrs_engine.so";

  const libPath = join(cwd, "target", targetDir, libName);

  if (!existsSync(libPath)) {
    console.error(`❌ Library not found at: ${libPath}`);
    process.exit(1);
  }

  console.log(`📍 Library built at: ${libPath}`);

  // Run Rust tests
  if (runTests) {
    console.log("\n🧪 Running Rust tests...");
    try {
      await $`cargo test`.cwd(cwd);
      console.log("✅ Rust tests passed\n");
    } catch {
      console.error("❌ Rust tests failed");
      process.exit(1);
    }

    // Run TypeScript tests
    console.log("🧪 Running TypeScript tests...");
    try {
      await $`bun test`.cwd(cwd);
      console.log("✅ TypeScript tests passed\n");
    } catch {
      console.error("❌ TypeScript tests failed");
      process.exit(1);
    }
  }

  console.log("\n🎉 Build complete!");
  console.log(`
Usage in TypeScript:
  import fsrs from '@v2/fsrs-engine'
  
  const card = fsrs.createCard()
  const updated = fsrs.processReview(card, fsrs.Rating.Good)

Debug mode:
  Set FSRS_DEBUG environment variable to enable logging:
  FSRS_DEBUG=debug bun run your-script.ts
  
  Or use debug build:
  bun run build.ts --debug --debug-feature
`);
}

main().catch(console.error);
