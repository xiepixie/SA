# WASM Build Setup

## Prerequisites

This package requires `wasm-pack` to build the Rust markdown parser into WebAssembly.

## Installation

### Windows
```powershell
# Install Rust if not already installed
# Visit https://www.rust-lang.org/tools/install and run rustup-init.exe

# Install wasm-pack
cargo install wasm-pack
```

### macOS/Linux
```bash
# Install Rust if not already installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
cargo install wasm-pack
```

### Alternative: Pre-built binaries
Download from: https://rustwasm.github.io/wasm-pack/installer/

## Build Commands

```bash
# Development build (faster, larger file)
bun run build:dev

# Production build (optimized for size and speed)
bun run build

# Clean build artifacts
bun run clean
```

## Verification

After installation, verify wasm-pack is available:
```bash
wasm-pack --version
# Should output: wasm-pack 0.x.x
```

## Troubleshooting

**Issue:** `command not found: wasm-pack` after installation

**Solution:**
1. Restart your terminal
2. Check if `~/.cargo/bin` (macOS/Linux) or `%USERPROFILE%\.cargo\bin` (Windows) is in your PATH
3. Add to PATH if missing:
   ```powershell
   # Windows PowerShell
   $env:Path += ";$env:USERPROFILE\.cargo\bin"
   ```

**Issue:** Build fails with "rustc not found"

**Solution:**
1. Install Rust toolchain first: https://rustup.rs/
2. Restart terminal and retry

## CI/CD Integration

For automated builds, add this step before `bun install`:
```yaml
- name: Install wasm-pack
  run: cargo install wasm-pack

- name: Build WASM
  working-directory: packages/markdown-parser
  run: bun run build
```
