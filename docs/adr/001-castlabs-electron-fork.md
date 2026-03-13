# ADR-001: Use CastLabs Electron Fork for Widevine DRM

## Status
Accepted

## Context
TermWatch displays streaming video (Netflix, Disney+, etc.) behind transparent terminal panels. These services require Widevine DRM to play protected content. Standard Electron does not include a Widevine Content Decryption Module (CDM) and cannot obtain one — Google restricts Widevine licensing to approved vendors.

CastLabs maintains an Electron fork (`electron-cdk`) that bundles a licensed Widevine CDM. It tracks upstream Electron releases and adds the DRM integration on top. This is the only practical way to get Widevine working in an Electron app without going through Google's lengthy licensing process directly.

## Decision
Use the CastLabs Electron fork (`electron-cdk`) instead of standard Electron. Install it via the CastLabs npm registry, which provides pre-built binaries with Widevine baked in.

## Consequences

**Positive:**
- DRM-protected content plays on Windows and macOS without additional plugins or user setup.
- CastLabs handles Widevine license compliance and CDM updates.
- API-compatible with standard Electron — no code changes needed beyond the dependency swap.

**Negative:**
- Tied to CastLabs' release cadence. New Electron versions are available only after CastLabs publishes a corresponding fork release.
- Must use their npm registry (`@aspect-build/aspect-configure-nvm` style override) for Electron builds.
- If CastLabs discontinues the fork, migration back to standard Electron would lose DRM support.
- VMP (Verified Media Path) signing is required for macOS builds, adding a build step.
