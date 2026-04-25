# Xentient NodeBase V3.1 — Update Log

**Date:** 2026-04-25  
**Changes from V3 → V3.1**

---

## Restored Shell Features (V3.1)

The following features were stripped from V3 to create a "clean atrium" shell, but are **required** for assembly and have been added back in V3.1:

### 1. Rail Slots (6× at hex vertices)
- **Spec:** 3.5mm wide × 2mm deep grooves at each hex vertex (0°, 60°, 120°, 180°, 240°, 300°)
- **Zone:** Collar only (Z=3 to Z=12) where wall is ≥3mm thick
- **Purpose:** Path A plates slide into these for angular alignment
- **Implementation:** Subtractive cuts into inner wall surface

### 2. Alignment Keyways (3×)
- **Spec:** 1.6mm wide × 1.6mm deep grooves at 0°, 120°, 240°
- **Zone:** Full depth (Z=Shell_T to Z=Total_Depth-Shell_T)
- **Purpose:** Angular orientation for all plates, regardless of assembly path
- **Implementation:** Subtractive grooves on inner cavity wall

### 3. Reference Pits (Zone A/B/C)
- **Spec:** 0.5mm deep × 1.5mm diameter subtractive dimples
- **Zone A:** Battery holder center (0, -25), TP4056 (15, 30), MT3608 (-15, 30) — all at Z=3
- **Zone B:** Master board standoff coordinates (±57, ±37) at Z=2
- **Zone C:** ESP32 standoff coordinates (±11, ±24) at Z=45
- **Purpose:** Easier to locate with drill bit or glue tip than additive bumps
- **Implementation:** Subtractive cylinders on inner wall surface

### 4. Landing Pads (Zone B, Path B)
- **Spec:** 8mm diameter × 0.5mm raised circles at Zone B standoff coordinates
- **Location:** (±57, ±37) at Z=20, projected onto inner hex wall
- **Purpose:** Flat glue surfaces for physical M3 standoffs (Path B builders)
- **Implementation:** Additive cylinders on inner cavity wall

---

## Still Separate Modules (NOT in shell)

These remain as separate .scad files:

| Module | File | Why Separate |
|--------|------|-------------|
| Zone A tray | `zone_a_tray.scad` | Clip-in battery/power module pockets |
| Zone B plate | `zone_b_plate.scad` | 120×80mm board mount, needs flat surface |
| Zone C plate | `zone_c_tray.scad` | ESP32 board mount |
| Display cap | `caps/housing_display.scad` | Separate cap per §4 |
| All 6 peripheral caps | `caps/housing_*.scad` | Plug into side sockets |
| Both anchors | `anchors/anchor_*.scad` | Plug into rear anchor |