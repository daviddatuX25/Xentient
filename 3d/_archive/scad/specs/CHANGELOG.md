# Xentient NodeBase V3 — Changelog

**Date:** 2026-04-25

---

## V3 → V3.1 (then reverted back to V3)

**V3.1 attempted:** Added rail slots, keyways, reference pits, and landing pads directly into `v3.scad` as shell features.

**Reverted to V3:** All interior features moved to **separate printable .scad files** in `interior/`. The shell (`v3.scad`) is now completely clean — just the hex pyramid, pockets, sleeves, ventilation, USB-C, rear anchor, and collar ribs. Everything else glues in.

### Why Separate Prints?

- Shell is simpler to print (no interior overhangs, no tiny features)
- Each interior piece can be printed independently and test-fitted
- Glue positions documented in `SPEC-v3.md` — no guesswork
- Can mix-and-match Path A (printed plates) and Path B (glued standoffs)

### Interior Module Files

| File | Prints | Purpose |
|------|--------|---------|
| `interior/rail_guides.scad` | 6 | Glue-on rail strips for plate sliding |
| `interior/keyway_strips.scad` | 3 | Glue-on alignment ridges |
| `interior/landing_pads.scad` | 4 | Glue-on discs for M3 standoff targets |
| `interior/reference_markers.scad` | 10 | Glue-on markers at mounting coordinates |
| `interior/zone_a_tray.scad` | 1 | Battery + power module tray |
| `interior/zone_b_plate.scad` | 1 | Master solder board mount |
| `interior/zone_c_plate.scad` | 1 | ESP32 dev board mount |

### Peripheral Cap Files

| File | Purpose |
|------|---------|
| `caps/sleds.scad` | Universal male sled module (shared base) |
| `caps/housing_listen.scad` | INMP441 MEMS mic housing |
| `caps/housing_speak.scad` | MAX98357A + 3W speaker housing |
| `caps/housing_climate.scad` | BME280 vented housing |
| `caps/housing_motion.scad` | HC-SR501 PIR shroud |
| `caps/housing_sight.scad` | ESP32-CAM ball joint head |
| `caps/housing_display.scad` | LCD 16×2 flared monitor |

### Anchor Files

| File | Purpose |
|------|---------|
| `anchors/anchor_wall_plate.scad` | Wall mount adapter |
| `anchors/anchor_desk_pedestal.scad` | Desk stand adapter |