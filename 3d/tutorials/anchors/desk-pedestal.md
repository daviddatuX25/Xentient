# Desk Pedestal Anchor — SketchUp Tutorial

**Component:** Hub-to-Desk Mounting Adapter
**Socket:** Rear Universal Anchor (40mm diameter, 6mm deep)
**Print Count:** 1
**Material:** PETG

---

## What You're Building

A weighted wedge-shaped stand. Holds the hub at a 15° upward angle for optimal desk viewing and mic pickup. Features a hollow cable routing channel and a weight-fill pocket.

---

## Step 1: Male Cylinder

1. Draw a 40mm diameter circle
2. Push/Pull 6mm tall
3. Add anti-rotation cross-keys (same as wall plate: 3mm × 2mm channels)
4. Group as `Cylinder-DeskPed`

## Step 2: Wedge Base

1. On the cylinder's rear face, draw a trapezoidal wedge profile:
   - Bottom edge: 80mm wide
   - Top edge: 40mm (matches cylinder diameter)
   - Height: 70mm (depth of the base from front to back)
   - The wedge angle creates a 15° upward tilt when the hub is mounted
2. Use **Push/Pull** or **Follow Me** to create the 3D wedge
3. Shell to 3mm walls (structural anchor plane requires 3mm minimum)
4. Group as `Wedge-DeskPed`

## Step 3: 15° Tilt Verification

1. Use the **Protractor** tool to verify the top surface is at 15° from horizontal
2. When the hub is mounted, the front face should tilt 15° upward
3. This optimizes: LCD viewing angle, PIR detection zone, mic pickup pattern

## Step 4: Cable Routing Channel

Through the center of the wedge:
1. Draw a 13mm diameter channel (8mm cable channel + 2.5mm wall each side, increased from original 8mm per audit)
2. Route from the cylinder base to the wedge rear bottom
3. Push/Pull through the wedge body (subtractive cutout)
4. USB-C cable feeds through this channel

## Step 5: Weight Fill Pocket

At the bottom of the wedge:
1. Draw a rectangular pocket: 60mm × 50mm × 15mm deep
2. Push/Pull to carve into the wedge bottom
3. This pocket is filled with sand, BBs, or a metal plate for stability
4. The added weight prevents the hub from tipping forward
5. Add a slide-in cover or use tape to seal the pocket after filling

## Step 6: Anti-Slip Feet

On the wedge bottom (outside the fill pocket):
1. Add 4× small rubber foot recesses (8mm diameter × 2mm deep)
2. After printing, glue rubber bumpers into these recesses
3. Prevents the pedestal from sliding on smooth desk surfaces

## Step 7: Union & Export

1. Select `Cylinder-DeskPed` and `Wedge-DeskPed`
2. Solid Tools → Union
3. Run Solid Inspector²
4. Export as `anchor_desk_pedestal.stl`

---

## Assembly Checklist

- [ ] Male cylinder seats in hub rear anchor (40mm × 6mm)
- [ ] Cross-keys engage anti-rotation channels
- [ ] Weight fill pocket loaded with sand/BBs/metal
- [ ] Fill pocket sealed (tape or slide cover)
- [ ] USB-C cable routed through internal channel
- [ ] Hub angled 15° upward for optimal viewing/mic pickup
- [ ] Anti-slip feet installed on bottom

---

## Weight Fill Recommendations

| Material | Approx. Weight | Notes |
|----------|---------------|-------|
| Sand | ~150g (fills pocket) | Cheap, easy to pour |
| Steel BBs | ~200g | Denser, rattles slightly |
| Metal plate | ~250g | Heaviest, no rattle — best stability |
| Unused PETG scraps | ~100g | Free, but lighter than alternatives |