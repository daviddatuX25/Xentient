# Wall Plate Anchor — SketchUp Tutorial

**Component:** Hub-to-Wall Mounting Adapter
**Socket:** Rear Universal Anchor (40mm diameter, 6mm deep)
**Print Count:** 1
**Material:** PETG

---

## What You're Building

A 40mm male cylinder with anti-rotation cross-keys that fits the hub's rear anchor pocket. It flares out to a 60×60mm flat plate with 4× M3 countersunk holes for wall mounting. Central 15mm hole for optional USB-C cable routing through drywall.

---

## Step 1: Male Cylinder

1. Draw a 40mm diameter circle (matches hub anchor pocket)
2. Push/Pull 6mm tall (matches pocket depth)
3. Add anti-rotation cross-keys:
   - Draw 2 perpendicular rectangular channels on the cylinder exterior (3mm wide × 2mm deep)
   - These engage matching channels in the hub anchor pocket
   - Use Push/Pull to carve them into the cylinder wall
4. Group as `Cylinder-WallPlate`

## Step 2: Transition Flange

1. On the cylinder's rear face, draw a 60×60mm square centered on the cylinder
2. Connect the cylinder edge to the square corners with the **Line** tool
3. This creates 4 triangular transition faces
4. Push/Pull the square profile 6mm rearward (total plate thickness = 6mm at center, tapering to 4mm at edges)
5. Group as `Flange-WallPlate`

## Step 3: M3 Mounting Holes

On the plate face:
1. Draw 4× M3 countersunk holes at the plate corners (3.2mm body + 6mm countersink head)
2. Position: 10mm inset from each corner (50×50mm bolt pattern)
3. Push/Pull through the plate (cutout)
4. For the countersink: draw a 6mm circle on the outer face, then chamfer it to the 3.2mm hole

## Step 4: Central Cable Hole (Optional)

1. Draw a 15mm diameter circle at the plate center
2. Push/Pull through the plate and cylinder (cutout)
3. This allows routing the USB-C power cable through the drywall directly to the hub

## Step 5: Union & Export

1. Select `Cylinder-WallPlate` and `Flange-WallPlate`
2. Solid Tools → Union
3. Run Solid Inspector²
4. Export as `anchor_wall_plate.stl`

---

## Assembly Checklist

- [ ] Male cylinder seats fully in hub rear anchor (40mm × 6mm)
- [ ] Cross-keys engage anti-rotation channels in hub
- [ ] 4× M3 screws into wall anchors
- [ ] USB-C cable routed through 15mm center hole (if routing through drywall)
- [ ] Plate sits flush against wall surface