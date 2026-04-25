# Xentient NodeBase V3.1 — Specification Sheet

**Version:** 3.1 (Atrium + Shell Features Restored)  
**File:** `v3.scad`  
**Date:** 2026-04-25  
**Status:** Shell geometry complete with rail slots, keyways, pits, and landing pads. Interior modules and peripherals in progress.

---

## 1. What V3.1 Is

A **hollow shell with essential mounting features** — the truncated hex-pyramid hub with port pockets, sleeves, ventilation, USB-C cutout, rear anchor, PLUS rail slots, alignment keyways, reference pits, and landing pads. Interior plates (Zone A/B/C trays) remain separate module files.

### Design Intent

The shell provides the geometry for both assembly paths:
- **Path A (Printed Plates):** Print Zone A/B/C tray/plate modules that slide into rail slots and screw onto bosses. Keyways provide angular orientation.
- **Path B (Glue-In Standoffs):** Skip printed plates. Glue physical M3/M2 standoffs onto landing pads at reference pit locations. Faster for one-off prototypes.

Both paths require the shell to be printed first, then interior components installed.

---

## 2. What Is IN the Print (V3 Shell)

| Feature | Spec | Status |
|---------|------|--------|
| Outer hex pyramid body | 150mm base F2F → 60mm front F2F, 90mm depth | ✅ Done |
| Collar (straight section) | 12mm tall, full base radius, aesthetic ribs | ✅ Done |
| 6× Side port pockets | 24.4×16.4mm, 10mm depth, 1° draft | ✅ Done |
| 6× Pocket sleeves | 2mm wall, recessed 10mm inward | ✅ Done |
| 1× Front center pocket | Same socket spec, for Display Cap | ✅ Done |
| Front sleeve | Same sleeve spec, vertical orientation | ✅ Done |
| USB-C cutout | 12×6mm, collar face, floor overcut for thick plugs | ✅ Done |
| Ventilation gills | 4 slits/face, 3 alternate faces, 2 rows (collar + mid-body) | ✅ Done |
| Rear anchor pocket | 40mm dia, 6mm deep, anti-rotation cross-keys | ✅ Done |
| Collar aesthetic ribs | 6× at 0°,60°,120°,180°,240°,300° | ✅ Done |
| Breakout PCB mounting lips | 2mm flange, M2 holes in each pocket sleeve | ✅ Done |
| Rail slots (6× at hex vertices) | 3.5mm wide × 2mm deep, collar zone Z=3–12 | ✅ Done (V3.1) |
| Alignment keyways (3×) | 1.6mm grooves at 0°, 120°, 240° | ✅ Done (V3.1) |
| Reference pits (Zone A/B/C) | 0.5mm deep × 1.5mm dia dimples | ✅ Done (V3.1) |
| Landing pads (Zone B) | 8mm dia × 0.5mm raised, Path B glue targets | ✅ Done (V3.1) |

---

## 3. What Is NOT in the Print (Separate Modules)

These remain as **separate .scad files** — not printed as part of the shell.

| Feature | File | Why Separate | Status |
|---------|------|-------------|--------|
| Zone A tray (battery/power) | `zone_a_tray.scad` | Needs clip-in pockets, slides into rail slots | ⬜ Not started |
| Zone B plate (master board) | `zone_b_plate.scad` | 120×80mm flat mount, can't be glued standoffs | ⬜ Not started |
| Zone C plate (ESP32) | `zone_c_plate.scad` | Board mount + anti-rotation, slides into rail slots | ⬜ Not started |
| Battery cradle | Part of `zone_a_tray.scad` | Integrated into tray | ⬜ Not started |
| Power module clips | Part of `zone_a_tray.scad` | Integrated into tray | ⬜ Not started |
| Master board standoffs | Part of `zone_b_plate.scad` | Integrated into plate | ⬜ Not started |
| ESP32 standoffs | Part of `zone_c_plate.scad` | Integrated into plate | ⬜ Not started |
| LCD standoffs | `caps/housing_display.scad` | Part of Display Cap | ✅ Draft |
| Power module clips (TP4056, MT3608, LDO) | Part of `zone_a_tray.scad` | Integrated into tray | ⬜ Not started |

---

## 4. Shell Features Already Added Back (V3.1)

These subtractive/additive features were restored in V3.1. They must be IN the shell because plates slide into them or they serve as glue targets.

### 4.1 Rail Slots ✅ DONE
- **Location:** 6× hex vertices (0°, 60°, 120°, 180°, 240°, 300°)
- **Spec:** 3.5mm wide × 2mm deep grooves, collar zone only (Z=3 to Z=12)
- **Purpose:** Path A plates slide into these for angular alignment

### 4.2 Alignment Keyways ✅ DONE
- **Location:** 3× grooves at 0°, 120°, 240° on cavity walls
- **Spec:** 1.6mm wide × 1.6mm deep subtractive grooves
- **Purpose:** Angular orientation for all plates regardless of assembly path

### 4.3 Reference Pits ✅ DONE
- **Location:** Zone A/B/C mounting coordinates
- **Spec:** 0.5mm deep × 1.5mm diameter subtractive dimples
- **Purpose:** Easier to locate with drill/glue tip than additive bumps. Path B glue targets.

### 4.4 Landing Pads ✅ DONE (Path B)
- **Location:** Zone B standoff coordinates (±57, ±37) at Z=20
- **Spec:** 8mm diameter × 0.5mm raised circles on inner cavity wall
- **Purpose:** Flat glue surfaces for physical M3 standoffs

### 4.4 Landing Pads (Path B glue targets)

- **Location:** Zone B standoff coordinates (±57, ±37) at Z=20
- **Spec:** 8mm diameter, 0.5mm raised circles on cavity wall
- **Why in shell:** Flat glue surfaces for physical M3 standoffs
- **Priority:** P2 — Path B only; Path A uses printed bosses

---

## 5. Parts That CANNOT Be Replaced by Glued Standoffs

These components need **printed plates/trays**, not just glue-in standoffs:

| Part | Why Printed, Not Glued | Status |
|------|----------------------|--------|
| **Zone B Plate** (master board) | Board is 120×80mm — too large for 4 standalone standoffs to hold rigidly without a plate connecting them. Needs cross-bracing and a flat mounting surface with chamfered corners. | ⬜ Not started |
| **Zone A Tray** | Battery holder needs clip-in pockets with retaining lips. TP4056/MT3608/LDO need positioning clips. A flat plate is the only way to locate these precisely. | ⬜ Not started |
| **Zone C Plate** | ESP32 board needs precise 4× M2 standoff positions + anti-rotation nub. Could use glue-in standoffs for Path B, but printed plate is more reliable. | ⬜ Not started |

### Parts That CAN Use Glued Standoffs (Path B)

| Part | Path B Approach | Tradeoff |
|------|----------------|----------|
| ESP32 (Zone C) | Glue M2 standoffs at reference pit locations | Less precise alignment, but works |
| LCD (Display Cap) | Printed separately as a cap — not in shell | Same for both paths |

---

## 6. Fit-In Parts Checklist

### Hardware (Not Printed)

- [ ] 4× M3 heat-set brass inserts (Zone A bosses, if Path A)
- [ ] 4× M3 heat-set brass inserts (Zone B bosses, if Path A)
- [ ] 4× M2 heat-set brass inserts (Zone C, if Path A)
- [ ] 4× M2 heat-set brass inserts (LCD, in Display Cap)
- [ ] M3×6 screws (Zone A tray → shell)
- [ ] M3×8 screws (Zone B plate → shell)
- [ ] M2×4 screws (PCB mounts)
- [ ] M2×6 screws (Zone C plate → shell)
- [ ] 6× JST XH 2.54mm female headers (per socket)
- [ ] 1× JST XH 2.54mm female header (front display socket)
- [ ] 18650 battery holder (clip-in, ~78×22×19mm)
- [ ] Nylon or brass M3 standoffs (Path B: 4× for Zone B, glue-in)
- [ ] Nylon or brass M2 standoffs (Path B: 4× for Zone C, glue-in)
- [ ] Cyanoacrylate (super glue) + 120-grit sandpaper (Path B only)
- [ ] PETG-specific plastic cement (optional, for permanent bonds)

### Printed Modules (Separate .scad Files)

- [ ] `zone_a_tray.scad` — Battery cradle + power module clips + wire chimney
- [ ] `zone_b_plate.scad` — Master board mount + cross-brace + wire chimney + chamfered corners
- [ ] `zone_c_plate.scad` — ESP32 mount + anti-rotation nub + wire chimney
- [ ] `display_cap.scad` — LCD 16×2 housing + bezel + snap-fit backplate

### Peripheral Caps (Separate .scad Files — See §4 of Framework)

- [ ] `housing_listen.scad` — INMP441 MEMS mic (low-profile dome, pinhole array)
- [ ] `housing_speak.scad` — MAX98357A + 3W 8Ω speaker (trapezoidal flare, thermal divider)
- [ ] `housing_climate.scad` — BME280 (vented standoff box, 15mm extension, gill slits)
- [ ] `housing_motion.scad` — HC-SR501 PIR (recessed shroud, 15.5mm lens cutout, adjustment holes)
- [ ] `housing_sight.scad` — ESP32-CAM (articulated ball joint head, lens cutout, thin antenna wall)
- [ ] `housing_display.scad` — LCD 16×2 + PCF8574 (flared monitor, 75×30mm bezel, snap-fit)

### Anchor Adapters (Separate .scad Files — See §5 of Framework)

- [ ] `anchor_wall_plate.scad` — 40×6mm male cylinder → 60×60mm wall plate
- [ ] `anchor_desk_pedestal.scad` — Weighted wedge, 15° tilt, cable routing

---

## 7. Assembly Path Decision Matrix

| Step | Path A (Printed Plates) | Path B (Glue-In Standoffs) |
|------|------------------------|---------------------------|
| 1 | Print shell with rail slots, keyways, bosses | Print shell with landing pads, reference pits |
| 2 | Heat-set M3/M2 inserts into bosses | Scuff landing pads with sandpaper |
| 3 | Print Zone A tray, test-fit | Glue M3 standoffs at Zone B coords |
| 4 | Slide Zone A tray into rail slots at Z=3 | Glue battery holder to floor (Y=−25mm) |
| 5 | Wire battery → TP4056 → MT3608/LDO | Glue TP4056/MT3608 near USB-C wall |
| 6 | Print Zone B plate, mount board | Mount board on glued standoffs |
| 7 | Slide Zone B plate into rail slots at Z=20 | Glue M2 standoffs at Zone C coords |
| 8 | Route wires through chimney | Wire and assemble |
| 9 | Print Zone C plate, mount ESP32 | — |
| 10 | Slide Zone C plate, secure M2×6 | — |
| 11 | Wire JST connectors | — |

---

## 8. Print Settings

| Setting | Value |
|---------|-------|
| Material | **PETG** (mandatory — PLA will warp near amp heat) |
| Layer height | 0.2mm |
| Overhangs | 45° max (support-free design) |
| Wall count | 3+ (perimeters for 3mm shell) |
| Infill | 20% gyroid (structural shell) |
| Build plate adhesion | Brim recommended (large flat base) |
| Orientation | Base (150mm F2F) flat on bed, rear face down |
| Supports | **None required** — all overhangs ≤ 45° |

---

## 9. Port Assignment Reference

| Face Angle | Peripheral | JST Pins | Notes |
|-----------|-----------|----------|-------|
| 30° | Sight (ESP32-CAM) | 4-pin (UART) | High visibility, clear LOS |
| 90° | Speak (MAX98357A) | 6-pin (I2S) | Near USB-C, ventilation |
| 150° | Climate (BME280) | 6-pin (I2C, 4 active) | Away from heat sources |
| 210° | Motion (HC-SR501) | 4-pin (1 active + NC) | Human detection height |
| 270° | Listen (INMP441) | 6-pin (I2S) | Opposite speaker, no feedback |
| 330° | Reserved (future) | — | Expansion slot |
| Front | Display (LCD 16×2) | 4-pin (I2C) | Dedicated center socket |