---
status: planning
created: 2026-04-25
priority: critical
---

# Quick Task: Fix 10 SCAD Inconsistencies from Cross-Reference Audit

Cross-referencing SPEC-v3.md, SPEC-caps.md, and all .scad files revealed 10
issues. Three are CRITICAL showstoppers that will prevent parts from fitting.

## Tasks (ordered by severity)

### CRITICAL (showstoppers — parts won't fit or function)

1. **Anchor draft taper won't fit hub pocket**
   - Files: `3d/anchors/anchor_wall_plate.scad`, `3d/anchors/anchor_desk_pedestal.scad`
   - Both add a +1mm draft taper (40→41mm) at the cylinder tip
   - Hub `rear_anchor_negative()` is a straight 40mm cylinder with no taper
   - Fix: Remove the additive taper ring from both anchors (the `cylinder(h=1, d1=40, d2=41)` block)

2. **Speak thermal divider is a cutout, not a wall**
   - File: `3d/caps/housing_speak.scad`
   - Thermal divider `cube([Flare_W+10, Div_Wall_T, Flare_Depth*0.3])` is inside `difference()`
   - This creates a gap CONNECTING amp zone to speaker zone (opposite of thermal isolation)
   - Fix: Move thermal divider from difference() to an additive union() block within the housing body. The divider must be a solid wall separating two chambers.

3. **Listen pinholes face sideways instead of outward**
   - File: `3d/caps/housing_listen.scad`
   - Pinholes use `rotate([0, 90, 0])` drilling along X axis (sideways)
   - MEMS mic needs sound from the FRONT face (outward, Z direction)
   - Fix: Change pinhole rotation to drill through the front face. Remove the rotate or use a rotation that creates holes perpendicular to the housing's front surface.

### HIGH (functional issues)

4. **Front center pocket has no draft angle**
   - File: `3d/nodebase/v3.scad`
   - `front_port_negative()` uses plain `cube()` — no 1° draft angle
   - Side pockets use `hull()` with 1° draft for wedge-fit insertion
   - Fix: Add draft angle to front pocket matching `socket_pocket_negative()` pattern

5. **Marginal flange bearing surface**
   - File: `3d/caps/sleds.scad`
   - Default flange +2mm gives only 1.6mm bearing per side
   - Fix: Increase default `flange_w` and `flange_h` from 2.0 to 3.0 in `male_sled_with_flange()`

6. **Desk pedestal cable channel size mismatch**
   - File: `3d/anchors/anchor_desk_pedestal.scad`
   - Hub rear anchor has 15mm wire hole; pedestal uses 10mm (Cable_D+2)
   - Fix: Increase Cable_D from 8.0 to 13.0 so channel matches hub's 15mm hole (13+2=15)

### MEDIUM (documentation / cleanup)

7. **Dead code in v3.scad**
   - File: `3d/nodebase/v3.scad`
   - Modules `battery_cradle()`, `power_module_clip()`, `master_board_standoffs()`, `esp32_standoffs()`, `lcd_standoffs()` are defined but never called
   - Per SPEC-v3.md, interior features are separate prints
   - Fix: Remove these unused modules and their parameter blocks

8. **Document 3mm flange on speak/display in SPEC-caps.md**
   - File: `3d/caps/SPEC-caps.md`
   - Speak and Display use `flange_w=3.0, flange_h=3.0` instead of standard 2.0
   - Fix: Add note to SPEC-caps.md Universal Sled section documenting the +3mm flange for larger caps

9. **Camera antenna thin-wall geometry may create zero material**
   - File: `3d/caps/housing_sight.scad`
   - The offset cube in antenna zone difference() may cut away all material on the outer face
   - Fix: Adjust the antenna zone geometry so the thin wall is exactly Ant_Wall=1.2mm thick on the outer face

10. **Spec split note** — not a code fix, just awareness that SPEC-v3.md and SPEC-caps.md should be cross-referenced. No file change needed.

## Files Modified

- `3d/anchors/anchor_wall_plate.scad`
- `3d/anchors/anchor_desk_pedestal.scad`
- `3d/caps/housing_speak.scad`
- `3d/caps/housing_listen.scad`
- `3d/nodebase/v3.scad`
- `3d/caps/sleds.scad`
- `3d/caps/SPEC-caps.md`
- `3d/caps/housing_sight.scad`