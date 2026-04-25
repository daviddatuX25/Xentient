# Motion Cap — SketchUp Tutorial

**Component:** HC-SR501 PIR (23×23mm board, 15mm dome)
**Connection:** 4-pin JST XH (VCC, GND, OUT, NC — 3 active + 1 NC)
**Socket Position:** 210° (human detection height)
**Print Count:** 1
**Material:** PETG or PLA

---

## What You're Building

A recessed shroud housing the PIR sensor. The Fresnel lens dome protrudes through a 15.5mm circular front cutout. Two 3mm side holes allow screwdriver access to the potentiometers without disassembly.

---

## Step 1: Male Sled Base

1. Draw 23.6mm × 15.6mm rectangle
2. Push/Pull 10mm deep
3. Apply 1° draft on outer walls
4. Subtract 18×8mm wire channel
5. Add +3mm flange per side
6. Group as `Sled-Motion`

## Step 2: Shroud Body

1. On the sled front face, draw a rectangle slightly larger than the PIR board: 25mm × 25mm
2. Push/Pull forward ~18mm (enough to enclose the 23mm board + 15mm dome)
3. Shell to 1.5mm walls (Solid Subtract)
4. The interior should be a recessed pocket that the PIR board sits inside
5. Group as `Shroud-Motion`

## Step 3: Fresnel Lens Cutout

On the front face:
1. Draw a 15.5mm diameter circle (matches the Fresnel dome exactly)
2. Push/Pull through the front wall (cutout)
3. The PIR dome protrudes slightly through this hole when assembled

## Step 4: PIR Board Shelf

Inside the shroud:
1. Draw a 23mm × 23mm shelf (matching the PIR board)
2. Position it so the Fresnel dome aligns with the front cutout when the board is seated
3. The dome center should be at the front face — the dome protrudes ~0.5mm past the face
4. Add 0.5mm retaining clips on the shelf corners to hold the board in place

## Step 5: Potentiometer Access Holes

On one side face of the shroud:
1. Draw 2× circles, each 3mm diameter
2. Position them to align with the two potentiometers on the HC-SR501:
   - **Sensitivity trimmer** (left side of PIR board)
   - **Time-delay trimmer** (right side of PIR board)
3. Push/Pull through the wall (cutout)
4. These allow a small jeweler's screwdriver to reach the trimmers without removing the cap

## Step 6: Wire Routing

1. Verify the 18×8mm wire channel connects from sled rear to the PIR board shelf
2. The 4-pin JST pigtail (VCC, GND, OUT, NC) passes through this channel

## Step 7: Union & Export

1. Select `Sled-Motion` and `Shroud-Motion`
2. Solid Tools → Union
3. Run Solid Inspector²
4. Export as `housing_motion.stl`

---

## Assembly Checklist

- [ ] HC-SR501 board seated in recessed shelf
- [ ] Fresnel lens dome protrudes through 15.5mm cutout
- [ ] 4-pin JST pigtail (3 active: VCC, GND, OUT + 1 NC — 3-pin JST not in BOM)
- [ ] Potentiometer access holes aligned with PIR trimmers
- [ ] Test screwdriver access through side holes
- [ ] **FIRMWARE TODO:** PIR not wired yet (bead 2ux pending — GPIO13 interrupt)