# RFT α-map calibration

The browser simulator can now replace the synthetic RFT proxy with an editable or measured 2D traction-per-depth map.

## Model

For each surface element below the free surface,

```text
sigma_x = alpha_x(beta, gamma) * |z|
sigma_z = alpha_z(beta, gamma) * |z|
```

and the wheel force/moment is obtained by integrating these local tractions over the engaged wheel surface.

The implementation uses the leading-edge hypothesis by default: only elements whose outward normal has a positive dot product with the local velocity vector contribute.

## Angle convention used by this tool

This project fixes one explicit 2D convention so imported experimental data are unambiguous:

- `x`: forward, horizontal.
- `z`: upward.
- `beta`: local plate/tangent orientation measured counter-clockwise from +x.
- `gamma`: local surface velocity-vector angle measured counter-clockwise from +x.
- beta grid: -90 to +90 deg in 15 deg increments.
- gamma grid: -180 to +150 deg in 30 deg increments (periodic over 360 deg).

If a plate-test data set uses a different beta/gamma convention, transform its angles/signs before import.

## CSV format

The editor imports/exports a long-form CSV with one row per map cell:

```csv
beta_deg,gamma_deg,alpha_x_N_m3,alpha_z_N_m3
-90,-180,0,0
-90,-150,123000,-42000
...
```

`alpha_x` and `alpha_z` are signed traction-per-depth components in `N/m^3` (`Pa/m`). Positive values point in +x / +z.

The standard grid contains 13 x 12 = 156 rows. Import requires every standard-grid cell to be present.

## Workflow

1. Choose the target wheel and soil.
2. Use **現在地盤からproxy生成** to seed a map from the selected soil's pressure-sinkage scale.
3. Click cells in the alpha_x / alpha_z heatmaps and edit values, or import measured CSV.
4. The Bekker-Wong vs RFT comparison refreshes immediately.
5. Use the calibration gain only as an overall scale adjustment; a measured alpha map is preferable.
6. Save named maps in browser localStorage or export CSV for version control / external processing.

## Current limitations

- The editor is 2D and uses a rigid-wheel surface.
- Lugs are not discretized as independent plate faces in the alpha-map RFT solver; the existing lightweight lug traction factor is still applied.
- The proxy seed is not measured RFT data.
- Cohesive/wet soils may require an extended RFT model with rate/depth terms.
- Absolute predictions require consistent angle conventions and experimental calibration.
