# Display Cap — SketchUp Tutorial

**Component:** LCD 16×2 + PCF8574 Backpack (71×26×15mm)
**Connection:** 4-pin JST XH (I2C: VCC, GND, SDA, SCL)
**Socket Position:** CENTER FRONT (dedicated — not a side port)
**Print Count:** 1 (housing) + 1 (backplate)
**Material:** PETG or PLA

---

## What You're Building

A flared monitor housing. The base is the standard 24×16mm sled, which rapidly flares outward to a 75×30mm rectangular bezel. The LCD sits behind an exact window, mounted on M3 standoffs, with a snap-fit backplate.

---

## Step 1: Male Sled Base

1. Draw 23.6mm × 15.6mm rectangle
2. Push/Pull 10mm deep
3. Apply 1° draft on outer walls
4. Subtract 18×8mm wire channel
5. Add +3mm flange per side
6. Group as `Sled-Display`

**Note:** This is the CENTER FRONT socket, which is vertically oriented. The sled inserts upward (Z-axis) rather than at an angle like the side ports.

## Step 2: Flared Transition

The housing must expand from 23.6×15.6mm (sled) to 75×30mm (bezel):

1. On the sled front face, draw the target bezel: 75mm wide × 30mm tall
2. Connect the sled corners to the bezel corners with the **Line** tool
3. This creates 4 trapezoidal transition faces
4. The flare extends ~18mm forward from the sled
5. Use **Push/Pull** or **Follow Me** to create the solid volume
6. Shell to 2mm walls
7. Group as `Flare-Display`

## Step 3: LCD Window

On the front bezel face:
1. Draw a rectangle: 71mm × 27mm (matches LCD visible area exactly — the 26mm height + 1mm tolerance for the glass)
2. Push/Pull through the front wall (cutout)
3. This creates the viewing window — the LCD glass sits just behind this opening

## Step 4: Internal M3 Standoffs

Inside the housing, mount the LCD + PCF8574 backpack:
1. Add 4× M3 standoff cylinders (5mm boss, 4.2mm hole)
2. Position at corners matching the LCD backpack mounting holes
3. Standoff height: positions the LCD glass flush with the front window (or 0.5mm behind for protection)
4. The PCF8574 backpack sits behind the LCD — both share the same standoffs

## Step 5: Snap-Fit Backplate

The backplate encloses the rear of the housing:

1. Draw a 75mm × 30mm rectangle (matches bezel outer dimensions)
2. Push/Pull 2mm thick (thin plate)
3. Add snap-fit features:
   - 4× small tabs on the top and bottom edges (1mm × 3mm, protruding 1mm inward)
   - These snap into corresponding slots on the housing interior
4. Add a small rectangular opening (~5mm × 5mm) for LCD contrast potentiometer access
5. Group as `Backplate-Display`
6. Export as a **separate** STL: `housing_display_backplate.stl`

## Step 6: Snap-Fit Slots on Housing

On the housing interior (where the backplate meets):
1. Draw 4× rectangular slots matching the backplate tab positions
2. Each slot: 1.2mm × 3.2mm (0.2mm clearance on each side)
3. Push/Pull 1.5mm deep into the housing wall
4. The backplate tabs click into these slots

## Step 7: Union & Export

1. Select `Sled-Display` and `Flare-Display`
2. Solid Tools → Union
3. Run Solid Inspector²
4. Export housing as `housing_display.stl`
5. Export backplate separately as `housing_display_backplate.stl`

---

## Assembly Checklist

- [ ] LCD + PCF8574 backpack mounted on M3 standoffs inside housing
- [ ] LCD glass aligned with front window (71×27mm opening)
- [ ] 4-pin JST pigtail (I2C: VCC, GND, SDA, SCL)
- [ ] Verify I2C address (0x27 default for PCF8574)
- [ ] Snap-fit backplate clicks into place
- [ ] LCD contrast pot accessible through backplate opening
- [ ] Cap plugs into CENTER FRONT socket only (not a side port)

---

## SketchUp Tips for Flared Shapes

- The rapid flare (24mm → 75mm) can create thin walls at the transition point — verify minimum 2mm thickness throughout
- Use **Section Plane** tool to inspect internal geometry at various depths
- The snap-fit tabs are small features — zoom in to 1mm precision when drawing them
- Test the snap-fit by printing just the backplate and housing rim before the full print