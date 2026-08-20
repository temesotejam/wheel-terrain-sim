# Changelog

## v1.0.0 — 2026-08-20

First complete baseline of `wheel-terrain-sim`.

### Added

- Browser-based Bekker–Wong + Janosi–Hanamoto wheel/terrain simulation
- Animated wheel, contact forces, sinkage, rut and soil-flow visualization
- Slip sweep and multi-wheel comparison
- Custom wheel geometry editor
- Custom soil parameter editor with browser profiles
- Repeated-pass / compaction model
- Granular RFT proxy and Bekker–Wong comparison
- Editable `αx(β,γ)` / `αz(β,γ)` RFT calibration maps
- RFT alpha CSV import/export and browser profiles
- 8-second WebM capture of the simulation canvas
- GitHub Pages workflow
- Consolidated dependency-free `npm test` suite
- Site-integrity checks for local JS/CSS references

### Validation scope

- Syntax checks for all JavaScript modules
- Unit checks for wheel geometry, soil, repeated-pass, RFT and alpha-map models
- UI wiring checks
- RFT alpha-map CSV round-trip and solver integration checks

### Known limits

The v1 models are intended for qualitative comparison and visualization until the relevant soil, lug, repeated-pass and RFT coefficients are calibrated from experiments. This release is not a DEM/MPM solver and should not be treated as an absolute design predictor without validation.
