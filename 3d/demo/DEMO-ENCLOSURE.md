# Xentient Demo Enclosure — Cardboard & Folder Build Guide

> **Scope:** Demo prototype using off-the-shelf materials. NOT for production 3D printing.
> **Materials:** Cardboard, white folder stock, glue stick, glue gun, tape, craft knife.
> **Goal:** Visually appealing, functional, holds all components, buildable in 1-2 hours.
> **Reference:** The production PETG design lives in `3d/_archive/` and `3d/tutorials/`.

---

## Materials List

| Material | What to Get | Use |
|----------|-------------|-----|
| Corrugated cardboard | Shipping box, ~3mm thick | Structural walls, internal shelves |
| White folder stock | Standard office folder, ~0.3-0.5mm | Outer skin (clean white finish) |
| Glue stick | Standard school glue stick | Paper-to-paper, folder-to-cardboard bonds |
| Glue gun + sticks | Mini glue gun | Structural joints, component mounting, wire anchors |
| Craft knife (X-Acto) | With fresh blade | Cutouts, slots, precise trimming |
| Ruler + pencil | Metal ruler preferred | Measure and mark |
| Double-sided tape | 12mm width | Quick-mount flat components (LCD, PCB) |
| Zip ties (small) | 100mm nylon | Wire management, cable routing |
| Brass standoffs + screws | M2×4mm (from 3D print kit) | Mount ESP32 and master board |
| Clear tape | Scotch tape | Temporary holds, window cover |

---

## Component Inventory & Dimensions

| Component | Size (mm) | Port/Position | Notes |
|-----------|-----------|---------------|-------|
| ESP32-WROOM-32 | 55 × 28 | Interior, Zone C | Brain, needs ventilation |
| Master solder board | ~120 × 80 | Interior, Zone B | Protoboard for all JST headers |
| TP4056 charge module | ~25 × 18 | Interior, Zone A | USB-C charging |
| MT3608 boost converter | ~22 × 12 | Interior, Zone A | 3.7V→5V boost |
| 18650 battery holder | 53 × 25 × 19 | Interior, Zone A | Single cell clip-in |
| INMP441 mic | 8 × 8 PCB | Listen port (270°) | Pinholes for sound |
| MAX98357A amp | 7 × 7 PCB | Speak port (90°) | Needs 5V, generates heat |
| 3W 8Ω speaker | 40 dia × 20 | Speak port | Grille cutout needed |
| BME280 breakout | 13 × 10 | Climate port (150°) | MUST have airflow, away from heat |
| HC-SR501 PIR | 23 × 23 + 15mm dome | Motion port (210°) | Fresnel lens must protrude |
| ESP32-CAM-MB | 40 × 27 | Sight port (30°) | Needs thin wall for WiFi antenna |
| LCD 16x2 + PCF8574 | 80 × 36 × 15 | Center front | Window cutout 71×27mm |
| 3.3V LDO regulator | ~10 × 8 | Interior, Zone A | Small, mount on master board |

---

## Form Factor: Simplified Hex Prism

The production design is a truncated hex-pyramid. For cardboard, we simplify to a **hexagonal prism** (straight walls, no taper). This is far easier to construct with flat panels and keeps the hex identity.

### Why Hex Prism (not rectangular box)

1. **Identity:** The hex shape IS the Xentient identity — rectangular box says "generic project"
2. **Construction:** 6 flat panels = 6 cardboard pieces + fold/score lines = straightforward
3. **Port spacing:** 6 faces map naturally to the 6 peripheral ports
4. **LCD front:** Dedicated center front face, no awkward mounting

### Dimensions (Simplified from Production)

| Dimension | Production (PETG) | Demo (Cardboard) | Why |
|-----------|-------------------|-------------------|-----|
| Base flat-to-flat | 150mm | **130mm** | Slightly smaller = less cardboard, easier to handle |
| Front flat-to-flat | 60mm | **70mm** | Straight prism = same 130mm top and bottom |
| Depth/Height | 90mm | **100mm** | Extra 10mm for wire routing headroom |
| Wall thickness | 3mm PETG | **3mm cardboard** (single corrugated) or 6mm (double-layer) |
| Collar | 12mm separate | **Not needed** — straight prism simplification |

### Net Layout (Hex Prism Unfolded)

```
          ┌─────────────┐
          │   Face 6     │  210° Motion
          │  (Motion)    │
          ├─────────────┤
 ┌────────┤             ├────────┐
 │ Face 5 │   Face 1    │ Face 2 │
 │(Listen)│   (Front)   │(Speak) │
 │ 270°   │  LCD here   │  90°   │
 └────────┤             ├────────┘
          ├─────────────┤
          │   Face 3     │  150° Climate
          │  (Climate)   │
          ├─────────────┤
          │   Face 4     │  330° Reserved
          │ (Reserved)  │
          └─────────────┘
```

Wait — a hexagonal prism has 6 side faces, plus top and bottom. The layout should account for all 6 perimeter faces plus the front face (LCD) being a distinct panel.

**Revised: The LCD is on Face 1 (center front).** The 6 side faces are the 6 hex sides. Each side gets one port.

### Face Assignments (Clockwise from Front)

```
          Front (LCD)
         ╱            ╲
    Face 1: LCD Display (center front, wider panel)
   ╱                      ╲
  Face 6: Reserved    Face 2: Speak (MAX98357A + Speaker)
  ╱                          ╲
 Face 5: Listen       Face 3: Climate (BME280)
  ╲                          ╱
   Face 4: Motion (PIR)
         ╲            ╱
          Back panel (USB-C, power)
```

**Face widths:** Each hex face = 130mm / √3 ≈ **75mm wide** (flat-to-flat / tan(30°) ≈ flat width).

Actually for a regular hexagon with flat-to-flat = 130mm:
- Each side width = 130mm / √3 ≈ 75mm

So each face panel is approximately **75mm wide × 100mm tall**.

---

## Step-by-Step Build Instructions

### Step 1: Cut the 6 Side Panels

From corrugated cardboard, cut 6 identical panels:

- **Size:** 75mm wide × 100mm tall
- **Grain direction:** Corrugation runs VERTICALLY (stronger for stacking)
- **Score fold lines:** Score lightly on the inside face at each edge (2mm from edge) for clean folding

Label each panel with its face assignment:
1. Front (LCD) — will have a large window cutout
2. Speak — speaker grille + amp ventilation
3. Climate — louvered slits for BME280 airflow
4. Motion — PIR Fresnel lens circle
5. Listen — mic pinhole array
6. Reserved — plain, future use

### Step 2: Cut Face Features

#### Front Panel (LCD)
- Cut a **71mm × 27mm** rectangular window in the center
- Cut window 30mm from top edge (leaves room for wiring above)
- Cover window with **clear tape** on the inside (acts as protective lens)

#### Speak Panel
- Cut a **40mm diameter circle** for the speaker (centered, 25mm from top)
- Below the circle, cut 4 horizontal slits (2mm × 15mm each) for amp ventilation
- The MAX98357A mounts behind the speaker on the inside

#### Climate Panel
- Cut **8 horizontal slits** (2mm × 20mm each, 4mm apart) across the face
- These are louvered vents for the BME280 — CRITICAL for accurate readings
- Slits centered vertically, spanning most of the panel width

#### Motion Panel
- Cut a **15.5mm diameter circle** for the PIR Fresnel lens (centered, 40mm from top)
- Below the circle, cut **2 small circles** (3mm each) for potentiometer adjustment access

#### Listen Panel
- Cut a **3×3 grid of 1mm pinholes** (use a push pin) centered on the panel
- Space them 5mm apart
- These face the INMP441 mic on the inside

#### Reserved Panel
- No cutouts needed (or add ventilation slits if desired)

### Step 3: Cut Top and Bottom Panels

#### Bottom Panel (Base)
- Regular hexagon, **130mm flat-to-flat**
- Cut a **12mm × 6mm rectangle** near one edge for USB-C cable exit
- Cut 6 small notches (2mm each) at each vertex for cable routing if needed
- This panel stays FLAT — all components mount on top of it

#### Top Panel
- Regular hexagon, **130mm flat-to-flat**
- Cut a **20mm × 20mm square** in center for LCD wire routing
- Alternatively, leave it OPEN (no top panel) for easy access during demo

### Step 4: Internal Shelves (Zones A, B, C)

From cardboard, cut 3 shelf panels that sit inside the hex prism:

#### Zone A Shelf (Power, 15mm from bottom)
- Hex shape, **124mm flat-to-flat** (6mm smaller for wall clearance)
- Cut center cutout for battery: **55mm × 27mm**
- Glue gun: anchor TP4056, MT3608, LDO to this shelf
- Slots near edge for USB-C cable routing to the bottom panel

#### Zone B Shelf (Master Board, 30mm from bottom)
- Hex shape, **124mm flat-to-flat**
- Large center cutout (30×30mm) for wire chimney
- Mount the master solder board with M2 standoffs glued to the cardboard

#### Zone C Shelf (ESP32, 55mm from bottom)
- Hex shape, **124mm flat-to-flat**
- Cutout for ESP32: **60mm × 30mm**
- ESP32 sits on this shelf, USB-C port faces down toward Zone A

### Step 5: Assemble the Hex Prism

1. **Tape the edges:** Line up the 6 side panels in a row, inside faces up
2. **Tape joints:** Use packing tape on the inside to create hinges between panels
3. **Fold into hex:** Bring Face 6 edge to meet Face 1 edge — forms the hex prism
4. **Tape the seam:** Tape the final joint (Face 6 ↔ Face 1) from inside
5. **Glue bottom:** Glue gun the bottom panel to all 6 faces
6. **Insert shelves:** Glue gun the 3 shelf panels at their Z positions
7. **Top panel:** Rest on top (no glue — removable for access) or leave open

### Step 6: Mount Components

Glue gun and double-sided tape mounting:

| Component | Mount Method | Location |
|-----------|-------------|----------|
| ESP32-WROOM-32 | Hot glue + zip tie | Zone C shelf, centered |
| Master solder board | Hot glue + standoffs | Zone B shelf |
| TP4056 | Hot glue | Zone A shelf, near USB-C exit |
| MT3608 | Hot glue | Zone A shelf, adjacent to TP4056 |
| 18650 holder | Hot glue + zip tie | Zone A shelf, center |
| LCD 16×2 | Double-sided tape | Inside front panel, visible through window |
| INMP441 | Hot glue | Inside listen panel, pinholes aligned |
| MAX98357A | Hot glue | Inside speak panel, behind speaker |
| 3W speaker | Hot glue rim | Inside speak panel, aligned with circle cutout |
| BME280 | Hot glue (minimal) | Inside climate panel, centered on slits |
| PIR HC-SR501 | Hot glue board, dome protrudes | Inside motion panel, dome through hole |
| ESP32-CAM-MB | Hot glue + zip tie | Inside sight panel (make separate housing — see below) |
| 3.3V LDO | Hot glue | Zone A shelf, on master board or separate |

### Step 7: Apply White Folder Skin

1. **Measure each face** of the assembled hex prism
2. **Cut white folder panels** 2mm larger than each face (for overlap/trim)
3. **Apply glue stick** to the cardboard face, press folder panel on
4. **Trim excess** with craft knife for clean edges
5. **For cutout windows:** Cut the folder to match the cardboard cutout, fold edges inside
6. **For speaker grille:** Leave the folder open over the speaker hole (or cut a matching circle)
7. **For PIR dome:** Cut the folder around the dome, fold edges flat

### Step 8: Wire Routing

1. **JST pigtails** route from master board (Zone B) through wire chimney to each face
2. **Glue gun anchors** at each face where the pigtail exits — prevents pull-out
3. **Zip tie bundles** every 30mm to keep wiring neat
4. **Power wires** (5V, 3.3V, GND) on Zone A shelf, route up through chimney
5. **USB-C cable** exits through bottom panel cutout

### Step 9: Camera Housing (Special Case)

The ESP32-CAM needs a separate small housing because:
- It needs line-of-sight for the camera
- The WiFi antenna needs a thin wall (<1.5mm) — cardboard is too thick
- It connects via UART2 (4-wire) to the Node Base

**Simple camera mount:**
1. Cut a **45mm × 30mm** cardboard rectangle
2. Fold the bottom 10mm to create a stand
3. Hot glue the ESP32-CAM to the cardboard
4. Cut a small window for the lens (15mm circle)
5. **Thin the wall** over the WiFi antenna: cut away the cardboard in the antenna zone (10mm × 20mm) and cover with a single layer of white folder stock
6. Attach to the sight face (30°) with glue gun or double-sided tape
7. Route 4-wire UART cable through the face into the hex prism

---

## Visual Finishing Touches

### LCD Face Details
- Print a small Xentient logo on paper, glue above the LCD window
- The LCD faces `(^_^) Xentient` on idle — this IS the demo star
- Cut a tiny slit below the LCD for contrast potentiometer adjustment (if needed)

### Panel Labels
- Use a fine marker to label each face on the inside (Listen, Speak, Climate, Motion, Sight)
- Or print small labels on paper and glue them

### Power Indicator
- Hot glue a small LED (from ESP32 or TP4056) to show power status
- Route it to the front face near the LCD

### Cable Exit
- The USB-C cable exits through the bottom — keep it clean with a small notch
- Hot glue a cable strain relief at the exit point

---

## Assembly Checklist

- [ ] All 6 side panels cut and labeled
- [ ] Face features cut (LCD window, speaker circle, ventilation slits, PIR hole, mic pinholes)
- [ ] Bottom panel cut with USB-C notch
- [ ] 3 internal shelves cut
- [ ] Hex prism assembled and bottom glued
- [ ] Shelves glued at correct Z heights
- [ ] All components mounted
- [ ] Wire routing complete with anchors
- [ ] White folder skin applied
- [ ] Camera housing attached
- [ ] LCD shows `(^_^) Xentient` on power-up
- [ ] All JST connectors plugged in
- [ ] USB-C cable connected and strain-relieved
- [ ] BME280 reads reasonable values (verify airflow)
- [ ] PIR detects motion
- [ ] Microphone captures audio
- [ ] Speaker outputs TTS audio
- [ ] ESP32-CAM streams frames via UART2

---

## What Happens After Demo

This cardboard prototype validates:
1. Component placement (does everything fit?)
2. Wire routing (are pigtails long enough?)
3. Thermal behavior (does BME280 read accurately? Does MAX98357A stay cool?)
4. User-facing layout (can judges see the LCD? hear the speaker? trigger the PIR?)
5. Form factor preference (hex prism vs rectangular vs other)

After demo, the `3d/_archive/` PETG design gets updated based on what we learn:
- Adjust port positions if the cardboard layout reveals issues
- Confirm Z-stack heights
- Validate thermal and airflow assumptions
- Refine the sled/socket protocol dimensions

Then the SketchUp tutorials in `3d/tutorials/` become the production path.