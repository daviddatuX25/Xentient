# Xentient NodeBase V3 — Specification Sheet

**Version:** 3.0 (Clean Atrium)  
**File:** `v3.scad`  
**Date:** 2026-04-25  
**Status:** Shell is a clean hollow — NO interior features printed. Everything interior is a separate print glued in.

---

## 1. What V3 Is

A **clean hollow shell** — the truncated hex-pyramid hub with port pockets, sleeves, ventilation, USB-C cutout, rear anchor, and collar ribs. **Nothing else is in the print.** All interior structure (rail guides, keyways, landing pads, zone plates, reference markers) are **separate .scad files** that you print and glue in.

### Design Intent

The shell is just the body. Every interior feature is a separate print you glue into position. The spec tells you:
- **What to print** (which files, how many copies)
- **Where to glue** (position on inner wall, Z-height)

---

## 2. What Is IN the Shell Print

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

**That's it. 11 features. Nothing else is in v3.scad.**

---

## 3. Interior Prints — What to Print and Where to Glue

### 3.1 Rail Guide Strips

| | |
|---|---|
| **File** | `interior/rail_guides.scad` |
| **Print count** | **6** (one per hex vertex) |
| **Glue position** | Inner wall at 0°, 60°, 120°, 180°, 240°, 300° |
| **Glue zone** | Z=3 to Z=12 (collar only, wall ≥ 3mm thick) |
| **Adhesive** | Cyanoacrylate on flat back, scuff wall first |
| **Purpose** | Creates channel for Zone A/B/C plate edges to slide into |

### 3.2 Alignment Keyway Strips

| | |
|---|---|
| **File** | `interior/keyway_strips.scad` |
| **Print count** | **3** |
| **Glue position** | Inner wall at 0°, 120°, 240° |
| **Glue zone** | Z=3 to Z=87 (full interior height) |
| **Adhesive** | Cyanoacrylate on flat back, scuff wall first |
| **Purpose** | Angular orientation — plates have matching grooves |

### 3.3 Landing Pads (Path B only)

| | |
|---|---|
| **File** | `interior/landing_pads.scad` |
| **Print count** | **4** |
| **Glue position** | (±57, ±37) at Z=20 on inner cavity wall |
| **Adhesive** | Cyanoacrylate, scuff pad back + wall, then glue M3 standoff on top |
| **Purpose** | Flat glue surface for physical M3 standoffs (Zone B master board) |

### 3.4 Reference Markers

| | |
|---|---|
| **File** | `interior/reference_markers.scad` |
| **Print count** | **10** (3 Zone A + 4 Zone B + 3 Zone C) |
| **Glue positions** | See table below |
| **Adhesive** | Small dab of cyanoacrylate |
| **Purpose** | Marks exact mounting coordinates — pilot hole guides for drill/glue |

**Reference Marker Glue Positions:**

| Zone | Count | Coordinates (X, Y, Z) | What It Marks |
|------|-------|----------------------|--------------|
| A | 3 | (0, -25, 3), (15, 30, 3), (-15, 30, 3) | Battery center, TP4056, MT3608 |
| B | 4 | (±57, ±37, 20) | Master board M3 standoff corners |
| C | 3 | (±11, 42, 45), (0, 18, 45) | ESP32 M2 standoff positions |

### 3.5 Zone A Tray (Battery + Power)

| | |
|---|---|
| **File** | `interior/zone_a_tray.scad` |
| **Print count** | **1** |
| **Mount** | Slides into rail guide channels at Z=3, or glue directly to floor |
| **Purpose** | Battery cradle (18650) + TP4056/MT3608/LDO clips + wire chimney |
| **Cannot replace with glued standoffs** | Needs clip-in pockets with retaining lips |

### 3.6 Zone B Plate (Master Solder Board)

| | |
|---|---|
| **File** | `interior/zone_b_plate.scad` |
| **Print count** | **1** |
| **Mount** | Slides into rail guide channels at Z=20, or rests on glued standoffs at landing pads |
| **Purpose** | 120×80mm board mount, M3 standoffs, cross-bracing, wire chimney |
| **Cannot replace with glued standoffs** | Board too large (120×80mm) for standalone standoffs — needs plate connecting them |

### 3.7 Zone C Plate (ESP32)

| | |
|---|---|
| **File** | `interior/zone_c_plate.scad` |
| **Print count** | **1** |
| **Mount** | Slides into rail guides at Z=45, or rests on glued M2 standoffs |
| **Purpose** | ESP32-WROOM-32 dev board mount, M2 standoffs, anti-rotation nub, wire chimney |

---

## 4. Total Print List for NodeBase Interior

| File | Prints | Material | Time est. |
|------|--------|----------|-----------|
| `v3.scad` (shell) | 1 | PETG | ~8-12h |
| `interior/rail_guides.scad` | 6 | PETG | ~15min ea |
| `interior/keyway_strips.scad` | 3 | PETG | ~20min ea |
| `interior/landing_pads.scad` | 4 | PETG | ~5min ea |
| `interior/reference_markers.scad` | 10 | PETG | ~3min ea |
| `interior/zone_a_tray.scad` | 1 | PETG | ~1.5h |
| `interior/zone_b_plate.scad` | 1 | PETG | ~2h |
| `interior/zone_c_plate.scad` | 1 | PETG | ~1h |

---

## 5. Parts That CANNOT Be Replaced by Glued Standoffs

| Part | Why Printed, Not Glued |
|------|----------------------|
| **Zone B Plate** | 120×80mm board — too large for 4 standalone standoffs. Needs cross-bracing and flat mounting surface. |
| **Zone A Tray** | Battery holder needs clip-in pockets with retaining lips. Power modules need positioning clips. |
| **Zone C Plate** | Can technically use glued standoffs, but printed plate is more reliable. |

---

## 6. Hardware (Not Printed)

- [ ] 4× M3 heat-set brass inserts (Zone B plate standoffs)
- [ ] 4× M2 heat-set brass inserts (Zone C plate standoffs)
- [ ] 4× M2 heat-set brass inserts (LCD, in Display Cap)
- [ ] M3×6 screws (Zone A tray)
- [ ] M3×8 screws (Zone B plate)
- [ ] M2×4 screws (PCB mounts)
- [ ] M2×6 screws (Zone C plate)
- [ ] 7× JST XH 2.54mm female headers (6 side + 1 front)
- [ ] 18650 battery holder (clip-in, ~78×22×19mm)
- [ ] Nylon or brass M3 standoffs (Path B: 4× for Zone B)
- [ ] Nylon or brass M2 standoffs (Path B: 4× for Zone C)
- [ ] Cyanoacrylate + 120-grit sandpaper
- [ ] PETG-specific plastic cement (optional, permanent bonds)

---

## 7. Print Settings

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

## 8. Port Assignment Reference

| Face Angle | Peripheral | JST Pins | Notes |
|-----------|-----------|----------|-------|
| 30° | Sight (ESP32-CAM) | 4-pin (UART) | High visibility, clear LOS |
| 90° | Speak (MAX98357A) | 6-pin (I2S) | Near USB-C, ventilation |
| 150° | Climate (BME280) | 6-pin (I2C, 4 active) | Away from heat sources |
| 210° | Motion (HC-SR501) | 4-pin (1 active + NC) | Human detection height |
| 270° | Listen (INMP441) | 6-pin (I2S) | Opposite speaker, no feedback |
| 330° | Reserved (future) | — | Expansion slot |
| Front | Display (LCD 16×2) | 4-pin (I2C) | Dedicated center socket |