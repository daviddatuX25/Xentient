# NodeBase Interior Plates — SketchUp Tutorial

**Components:** Rail Guides, Keyway Strips, Landing Pads, Reference Markers, Zone A/B/C Plates
**Print Count:** 6+3+4+10+1+1+1 = 26 prints total
**Material:** PETG

---

## Overview

All interior components are **separate prints** that glue into the NodeBase shell. The shell provides reference positions; you print and stick these in place.

Two assembly paths:
- **Path A:** Print plates, slide into rail guides, screw onto bosses
- **Path B:** Skip plates, glue physical standoffs onto landing pads

---

## Rail Guide Strips (6 prints)

### Dimensions
- Width: 3.5mm
- Height: 2mm (protrudes from wall)
- Length: 9mm (Z=3 to Z=12, collar zone only)

### SketchUp Steps
1. Draw 3.5mm × 2mm rectangle
2. Push/Pull 9mm long
3. Add 1° draft on the long edges (Move tool: offset top edge ~0.08mm per side)
4. Group as `Rail-Guide`, make Component
5. Export 6 copies

### Glue Position
- Inner wall at each hex vertex: 0°, 60°, 120°, 180°, 240°, 300°
- Z=3 to Z=12 (collar zone only, where wall is ≥3mm thick)
- Scuff wall, apply cyanoacrylate, press flat back of guide against wall

---

## Keyway Strips (3 prints)

### Dimensions
- Width: 3mm
- Height: 1.5mm (protrudes from wall)
- Length: 84mm (Z=3 to Z=87, full interior height)

### SketchUp Steps
1. Draw 3mm × 1.5mm rectangle
2. Push/Pull 84mm
3. Group as `Keyway-Strip`, make Component
4. Export 3 copies

### Glue Position
- Inner wall at 0°, 120°, 240°
- Full interior height Z=3 to Z=87
- These are subtractive grooves conceptually — the strip creates a ridge that plates notch around

---

## Landing Pads (4 prints, Path B only)

### Dimensions
- Diameter: 8mm
- Thickness: 0.5mm raised disc

### SketchUp Steps
1. Draw 8mm diameter circle
2. Push/Pull 0.5mm thick
3. Group as `Landing-Pad`, make Component
4. Export 4 copies

### Glue Position
- (±57, ±37) at Z=20 on inner cavity wall
- These are glue targets for physical M3 standoffs (Zone B master board)
- Scuff pad back + wall with 120-grit, apply cyanoacrylate, seat standoff on top

---

## Reference Markers (10 prints)

### Dimensions
- Diameter: 1.5mm
- Depth: 0.5mm (subtractive pit — modeled as a bump for drilling reference)

### SketchUp Steps
1. Draw 1.5mm diameter circle
2. Push/Pull 0.5mm
3. Group as `Ref-Marker`, make Component
4. Export 10 copies

### Positions

| Zone | Count | Coordinates (X, Y, Z) | Marks |
|------|-------|----------------------|-------|
| A | 3 | (0, -25, 3), (15, 30, 3), (-15, 30, 3) | Battery center, TP4056, MT3608 |
| B | 4 | (±57, ±37, 20) | Master board M3 standoff corners |
| C | 3 | (±11, 42, 45), (0, 18, 45) | ESP32 M2 standoff positions |

---

## Zone A Tray (1 print)

### Dimensions
- Fits within hex F2F at Z=3 (≈142mm)
- 2mm thick hex-shaped plate
- Central 30×30mm wire chimney cutout
- Notches around port sleeve intrusions

### Contains
- 18650 battery clip-in pocket (~78×22×19mm)
- TP4056 clip pocket (25×19mm)
- MT3608 clip pocket (37×22mm)
- LDO clip pocket (12×8mm)
- Wire chimney (30×30mm)

### SketchUp Steps
1. Draw a hex plate matching the inner F2F at Z=3 (≈142mm)
2. Push/Pull 2mm thick
3. Subtract 30×30mm central chimney (Push/Pull through)
4. Subtract notches where port sleeves intrude (measure from shell interior)
5. Add clip-in pockets on top surface for each component (Push/Pull downward, add retaining lips with Line tool)
6. Group as `Zone-A-Tray`

### Mount
- Slides into rail guide channels at Z=3
- OR glue directly to floor with cyanoacrylate
- Secure with M3×6 screws into bosses (Path A)

---

## Zone B Plate (1 print)

### Dimensions
- 120×80mm with 15mm chamfered corners (must clear hex apothem at Z=20)
- Fits within hex F2F at Z=20 (≈133mm)
- 2mm thick with honeycomb infill pattern
- Central 30×30mm wire chimney
- 4× M3 standoff positions (110×70mm span)

### SketchUp Steps
1. Draw 120×80mm rectangle
2. Chamfer all 4 corners at 15mm (Line tool to cut corners at 45°)
3. Push/Pull 2mm thick
4. Subtract 30×30mm central chimney
5. Subtract notches for port sleeves
6. Draw honeycomb infill pattern (hexagonal holes) across non-structural areas
7. Add 4× M3 standoff cylinders (5mm boss, 4.2mm hole) at (±55, ±35)
8. Group as `Zone-B-Plate`

### Mount
- Slides into rail guides at Z=20 (Path A)
- OR rests on glued standoffs at landing pads (Path B)
- Secure with M3×8 screws

---

## Zone C Plate (1 print)

### Dimensions
- Fits within hex F2F at Z=45 (≈106mm)
- ESP32 mount: 22×48mm standoff span
- 2mm thick with honeycomb infill
- Central 30×30mm wire chimney
- Anti-rotation nub

### SketchUp Steps
1. Draw plate to fit Z=45 inner hex (≈106mm F2F)
2. Push/Pull 2mm thick
3. Subtract 30×30mm chimney
4. Add 4× M2 standoff cylinders (4mm boss, 2.4mm hole) at positions matching ESP32 dev board (55×28mm board, 22×48mm span)
5. Add anti-rotation nub (small 2×2×2mm cube) to prevent board from rotating
6. Add honeycomb infill cutouts
7. Group as `Zone-C-Plate`

### Mount
- Slides into rail guides at Z=45
- OR rests on glued M2 standoffs at Zone C reference marker positions
- Secure with M2×6 screws

---

## Export Checklist

Before exporting each plate:
1. Run **Solid Inspector²** — must be solid
2. Verify dimensions with **Tape Measure** (`T`)
3. Export as STL (binary, mm units)
4. Name files descriptively: `zone_a_tray.stl`, `zone_b_plate.stl`, etc.

---

## Glue Quick Reference

| Adhesive | Use For | Prep | Cure | Notes |
|----------|---------|------|------|-------|
| Cyanoacrylate | Landing pads, rail guides, keyways | Scuff both surfaces with 120-grit | 30s | Strongest for PETG+PETG |
| Hot glue | Temporary holds, wire tacking | Clean surface | 60s | Removable, softens >80°C |
| PETG cement | Permanent bonds only | Clean surface | 24h | Weld-On 3, irreversible |