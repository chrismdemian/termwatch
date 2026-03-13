# ADR-003: Use @lydell/node-pty with Prebuilt Binaries

## Status
Accepted

## Context
TermWatch spawns pseudo-terminal (PTY) processes to provide real shell sessions (bash, PowerShell, etc.) inside xterm.js. The standard `node-pty` package requires native compilation at install time.

On Windows, `node-pty` depends on winpty, which has a broken `GetCommitHash.bat` script that fails during compilation. The newer beta versions of node-pty (1.2.x) drop winpty in favor of ConPTY but require Spectre-mitigated MSVC libraries, which are not installed by default and add significant CI/local setup burden.

On macOS, native compilation requires Xcode command-line tools, and cross-compilation for different architectures (x64 vs arm64) adds further complexity.

`@lydell/node-pty` is a fork maintained by Simon Lydell that distributes prebuilt native binaries for Windows, macOS, and Linux. It has the same API as standard node-pty but eliminates the compilation step entirely.

## Decision
Use `@lydell/node-pty` as the PTY implementation. It provides prebuilt binaries that work without any native compilation toolchain.

## Consequences

**Positive:**
- No native compilation needed on any platform. `npm install` just works.
- CI pipelines do not need MSVC, Xcode, or other build tools installed.
- Consistent behavior across developer machines regardless of local toolchain configuration.
- Same API as standard node-pty — switching back is a one-line dependency change.

**Negative:**
- Dependent on Simon Lydell continuing to maintain and publish prebuilt binaries.
- New platform or architecture support depends on the fork's release schedule.
- Prebuilt binaries may lag behind upstream node-pty features or bug fixes.
