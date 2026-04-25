# Climate Cap — SketchUp Tutorial

**Component:** BME280 Breakout (13×10mm) + 100nF decoupling cap
**Connection:** 6-pin JST XH (I2C: VCC, GND, SDA, SCL, NC, NC — 4 active + 2 NC)
**Socket Position:** 150° (away from heat sources)
**Print Count:** 1
**Material:** PETG (recommended) or PLA

---

## What You're Building

A standoff vented box that extends at least 15mm from the hub face before housing the sensor. The BME280 must be far from hub heat (ESP32, battery, amp). Heavily louvered sides for maximum passive airflow.

---

## Step 1: Male Sled Base

1. Draw 23.6mm × 15.6mm rectangle
2. Push/Pull 10mm deep
3. Apply 1° draft on outer walls
4. Subtract 18×8mm wire channel
5. Add +3mm flange per side
6. Group as `Sled-Climate`

## Step 2: Standoff Neck (15mm Minimum)

The 15mm standoff is **MANDATORY** — the BME280 must be away from hub heat:

1. On the sled front face, draw a rectangle matching sled outer dimensions (23.6mm × 15.6mm)
2. Push/Pull forward 15mm (minimum standoff length)
3. This creates a hollow neck connecting sled to the sensor housing
4. Maintain the 18×8mm wire channel continuity through the neck
5. Group as `Neck-Climate`

## Step 3: Sensor Housing Box

At the end of the neck:
1. Draw a box: 25mm wide × 20mm tall × 15mm deep (enough room for BME280 + air circulation)
2. Push/Pull 15mm deep
3. Shell to 1.5mm wall thickness (Solid Subtract)
4. Group as `Box-Climate`

## Step 4: Louvered Gills (4-Sided Ventilation)

This is the most important feature — maximum passive airflow for accurate readings:

On each of the 4 side faces:
1. Draw 4 horizontal slits per face
2. Each slit: 2mm tall × (face-width - 4mm) wide (2mm margin on each side)
3. Space slits evenly (roughly 4mm center-to-center)
4. Push/Pull each slit through the wall (cutout)
5. Chamfer top and bottom edges of each slit at 45°

**Total:** 4 faces × 4 slits = 16 ventilation openings

## Step 5: Internal BME280 Shelf

Inside the housing:
1. Draw a 13mm × 10mm rectangular shelf (matching BME280 PCB)
2. Push/Pull 1mm down from the top — the BME280 sits on this shelf
3. Position the shelf so the sensor faces outward (toward the front opening)
4. Leave at least 5mm clearance between sensor and front wall for airflow

## Step 6: Union & Export

1. Select `Sled-Climate`, `Neck-Climate`, `Box-Climate`
2. Solid Tools → Union
3. Run Solid Inspector²
4. Export as `housing_climate.stl`

---

## Assembly Checklist

- [ ] BME280 board seated on internal shelf, sensor facing outward
- [ ] 6-pin JST pigtail (4 active: VCC, GND, SDA, SCL + 2 NC)
- [ ] 100nF decoupling cap on VCC line
- [ ] Verify I2C address **0x76** (per validation bead 1xi)
- [ ] 15mm standoff intact — sensor is NOT near hub body
- [ ] All 16 gill slits unobstructed
- [ ] No supports needed for print (horizontal slits print cleanly at 0.2mm layer height)