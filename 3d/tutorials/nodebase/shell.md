# NodeBase Shell — SketchUp Tutorial

**Component:** Main Hub Shell (Truncated Hex-Pyramid)
**Print Count:** 1
**Material:** PETG (mandatory)
**Estimated Print Time:** 8–12 hours

---

## What You're Building

A hollow truncated hex-pyramid with 7 port pockets, ventilation gills, a USB-C cutout, a rear anchor pocket, collar ribs, and breakout PCB flanges. Nothing else is in this print — all interior features are separate prints.

---

## Step 1: Base Hexagon

1. Select **Polygon** tool (shortcut: `C` then type `6s` for 6 sides)
2. Click origin, drag outward, type `86.6mm` for radius — this gives 150mm flat-to-flat
3. Immediately **Push/Pull** upward: type `12mm` — this is the collar (straight section)
4. Triple-click → **Make Group** → rename to `NodeBase-Collar`

## Step 2: Front Hexagon (Top of Pyramid)

1. On the top face of the collar, draw another 6-sided polygon
2. Radius: `34.6mm` — this gives 60mm flat-to-flat
3. Do NOT extrude yet — this is just the target profile

## Step 3: Connect the Taper

1. Use the **Line** tool (`L`) to connect each vertex of the small hex to the corresponding vertex on the large hex
2. This creates 6 trapezoidal faces
3. Delete the top face of the small hex (it will be open)
4. Select all taper geometry → **Make Group** → rename to `NodeBase-Taper`
5. Verify with **Solid Inspector²** — must show "Solid"

## Step 4: Shell the Solid (3mm Walls)

**Method A — Solid Subtract (recommended):**
1. Copy the entire outer shell
2. Scale the copy down uniformly: subtract 3mm from each dimension (or model inner profile manually using F2F reduced by 6mm)
3. Use **Solid Tools → Subtract** (outer minus inner) to hollow the shell
4. Check with Solid Inspector²

**Method B — Manual Push/Pull:**
1. Enter the group (double-click)
2. Push/Pull each inner face inward by 3mm
3. Connect all inner faces to form a closed inner cavity
4. Verify solid

## Step 5: Port Pockets (7x)

For each port face (6 sides + 1 front center):

1. **Draw the pocket rectangle** on the outer face: 24.4mm wide × 16.4mm tall
2. **Push/Pull inward** 10mm — this creates the pocket
3. **Draw the sleeve behind the pocket:** On the pocket floor, draw a 24.0mm × 16.0mm rectangle (the inner sleeve opening)
4. **Push/Pull the sleeve** inward another 10mm through the 3mm wall — this creates the internal sleeve tube
5. **Draw the wire channel:** 18mm wide × 8mm tall rectangle on the sleeve floor, Push/Pull through to the interior

**Port positions by face angle:**
- 30° = Sight (side 1)
- 90° = Speak (side 2)
- 150° = Climate (side 3)
- 210° = Motion (side 4)
- 270° = Listen (side 5)
- 330° = Reserved (side 6)
- Front center = Display

**Tip:** Create one pocket+sleeve as a Component named `Port-Pocket`, then copy and rotate to each face using **Rotate** tool (`Q`). The front center pocket is vertical, not angled.

## Step 6: Breakout PCB Flange

Around each port sleeve interior:
1. Draw a 2mm flange extending outward from the sleeve perimeter
2. Add 2× M2 mounting holes (2.4mm diameter) on opposite sides of the flange
3. Group as `Flange-[port-name]`

## Step 7: USB-C Cutout

1. On the 90° collar face (same face as Speak port, but in the collar zone)
2. Draw 12mm × 6mm rectangle
3. Push/Pull through the wall (cutout)
4. Add 1mm floor overcut below the cutout (extends 1mm below rectangle) for thick cable plug housings

## Step 8: Ventilation Gills

On 3 alternating faces (0°, 120°, 240° — between port faces):
1. Draw 4 horizontal slits per face, each 2mm wide
2. Space them evenly across the face height
3. Chamfer top and bottom edges at 45° using the **Move** tool on slit edges
4. Push/Pull through the wall (cutout)
5. Repeat for collar zone and mid-body zone (2 rows)

## Step 9: Rear Anchor Pocket

1. On the rear (bottom) face, draw a circle: radius 20mm (40mm diameter)
2. Push/Pull inward 6mm
3. Add 2 perpendicular cross-key channels (3mm wide × 2mm deep) across the pocket floor for anti-rotation

## Step 10: Collar Aesthetic Ribs

On the collar exterior at 0°, 60°, 120°, 180°, 240°, 300°:
1. Draw a 2mm wide × 1mm tall rectangular profile along the collar height
2. Push/Pull outward 0.5mm from the face
3. These are purely decorative — they break up the flat collar surface

## Step 11: Final Checks

1. Run **Solid Inspector²** — fix all leaks and internal faces
2. Verify all pocket dimensions with the **Tape Measure** tool (`T`)
3. Verify wall thickness is 3mm minimum (Tape Measure inner-to-outer face)
4. Export as STL: Right-click group → **Export STL** (binary, mm)
5. Open in slicer — verify dimensions match before printing

---

## Common SketchUp Gotchas

- **Flipped normals:** If faces appear dark/gray, right-click → **Reverse Faces**. All outward-facing surfaces should be white.
- **Internal faces:** After Solid Subtract, delete any leftover internal partition faces. Solid Inspector² catches these.
- **Coplanar edges:** SketchUp sometimes leaves extra edges on coplanar faces. Use **Erase** (`E`) to clean them — they confuse slicers.
- **Export units:** Always verify STL export units are millimeters. SketchUp sometimes defaults to inches.