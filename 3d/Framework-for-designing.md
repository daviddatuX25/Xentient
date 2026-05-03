# Xentient Framework: SketchUp Design Guide V3

**Architecture:** Distributed Hub-and-Spoke Edge AI (Truncated Hex-Pyramid Base)
**Modeling Tool:** SketchUp (Free/Pro — web or desktop)
**Core Pivot:** 16x2 LCD is an independent, pluggable peripheral cap.
**Print Material:** PETG mandatory for Main Node, Speak Cap, and Sight Cap. PLA acceptable for low-heat peripherals.

---

## 1. SketchUp Setup & Modeling Conventions

### Tool Setup
- Use **SketchUp Make 2017** (free desktop) or **SketchUp Free** (web) — both work for this project
- Install **Solid Inspector²** extension to verify manifold geometry before export
- Install **Export STL** or **STL Exporter** extension for 3D printing output
- Set **model units to millimeters** (Window → Model Info → Units → Millimeters, precision 0.0mm)

### Modeling Rules
- **Everything must be a Solid Group or Component** — no loose geometry
- Name every group/component descriptively (e.g., `NodeBase-Shell`, `Sled-Male`, `Sleeve-30deg`)
- Use **Layers/Tags** to organize: `Shell`, `Ports`, `Interior`, `Caps`, `Anchors`
- Model at **1:1 real scale** (mm) — never scale up/down for printing
- **No zero-thickness faces** — every wall must have real volume (min 1.5mm, structural walls 3.0mm)
- Export each printable part as a **separate STL** — one file per print job
- Run **Solid Inspector²** before export — fix all leaks and internal faces

### SketchUp → STL Workflow
1. Model component as a solid group
2. Right-click → **Export STL** (select binary format, units: mm)
3. Open STL in slicer (Cura/PrusaSlicer)
4. Verify dimensions match spec before printing

---

## 2. Global 3D Printing & Manufacturing Guidelines

**Material:** PETG is mandatory for the Main Node, Speak Cap (amp heat), and Sight Cap (ESP32-CAM heat). PLA will warp near heat sources.

**Structural Wall Thickness:** Minimum 3.0mm for the main hub shell and anchor planes. Peripherals: 1.5mm–2.0mm walls.

**Tolerances:**
- Friction Fits (Sleds/Plugs): Male parts designed exactly **0.4mm smaller** (0.2mm offset per side) than female receivers
- Screw Holes: Add 0.2mm to screw body diameter (e.g., M3 body = 3.2mm hole)

**Fasteners:** Brass Heat-Set Inserts (M2 for PCBs, M3 for structural anchors) — do not tap plastic.

**Overhangs/Bridging:** Design internal cavities with **45° chamfers** to eliminate internal supports (hard to remove from enclosed Hub).

---

## 3. The Universal Mating Protocol (Sled & Socket)

The standardized mechanical interface connecting every Cap to the Hub.

### The Female Socket (Carved into the Hub)

| Parameter | Value |
|-----------|-------|
| Width | 24.0mm |
| Height | 16.0mm |
| Depth | 10.0mm (recessed sleeve behind wall) |
| Wire Channel | 18.0mm W × 8.0mm H (passes 6-pin JST XH2.54) |

**SketchUp How-To:** Use the **Push/Pull** tool to carve the pocket from the hub face. Start with a 24×16mm rectangle, push 10mm deep. Carve the wire channel as a separate 18×8mm rectangle pushed through the sleeve interior.

### The Male Sled (Base of Every Peripheral Cap)

| Parameter | Value |
|-----------|-------|
| Width | 23.6mm |
| Height | 15.6mm |
| Depth | 10.0mm |
| Draft Angle | 1° (outer walls taper inward for wedge fit) |
| Hollow Core | 18.0mm × 8.0mm (pigtail wiring pass-through) |

**SketchUp How-To:** Draw the sled profile as a 23.6×15.6mm rectangle. Extrude 10mm. Apply 1° taper using the **Move** tool on top edges (offset ~0.17mm per side). Subtract the 18×8mm wire channel with Push/Pull. Group as `Sled-Male` component.

---

## 4. Main Node Module (The Hex-Core Base)

The Conduit Entity — powers the system and routes telemetry. Does not process AI.

### Geometry: Truncated Hexagonal Pyramid

| Dimension | Value |
|-----------|-------|
| Base Width (Rear/Wall-side) | 150mm flat-to-flat (radius ~86.6mm) |
| Front Width | 60mm flat-to-flat (radius ~34.6mm) |
| Total Depth | 90mm |
| Collar Height | 12mm (straight section at base, full radius) |

### SketchUp Construction Steps

1. **Draw the base hexagon:** Use the **Polygon** tool (6 sides), radius 86.6mm. Center at origin.
2. **Draw the front hexagon:** Polygon tool, radius 34.6mm. Place at 90mm above base (Z=90).
3. **Connect the pyramids:** Select both hexagons, use **Loft** (if available via extension) or manually connect each vertex pair with the **Line** tool to form the 6 trapezoidal faces.
4. **Add collar:** Extrude the base hexagon downward 12mm (or model as a separate 12mm straight section below the pyramid taper).
5. **Make solid:** Select all faces, right-click → **Make Group** → check with Solid Inspector².
6. **Shell the solid:** Use **Erase** to remove the top face, then use **Push/Pull** on the inner faces to hollow the shell to 3mm wall thickness. Alternatively, model the inner cavity as a slightly smaller pyramid and subtract with **Solid Tools → Subtract**.

### Port Matrix

| Port | Position | Assignment |
|------|----------|------------|
| Center Front | Dedicated wide socket | Display Cap (LCD 16×2) |
| 30° face | Angled perimeter | Sight (ESP32-CAM) — high visibility, clear LOS |
| 90° face | Angled perimeter | Speak (MAX98357A) — near USB-C, ventilation |
| 150° face | Angled perimeter | Climate (BME280) — away from heat |
| 210° face | Angled perimeter | Motion (HC-SR501 PIR) — human detection height |
| 270° face | Angled perimeter | Listen (INMP441) — opposite speaker, no feedback |
| 330° face | Angled perimeter | Reserved (future peripheral) |
| Rear | Anchor pocket | 40mm diameter, 6mm deep, anti-rotation cross-keys |

### Key Shell Features

- **Ventilation:** 4 slits per face (2mm wide, 45° chamfered) on 3 alternating collar faces (0°, 120°, 240°)
- **USB-C Cutout:** 12×6mm on collar face, 1mm floor overcut for thick cable plug housings
- **Rear Anchor Pocket:** 40mm diameter, 6mm deep, with anti-rotation cross-key channels
- **Collar Aesthetic Ribs:** 6× ridges at 0°, 60°, 120°, 180°, 240°, 300° (collar zone only)
- **Breakout PCB Flange:** 2mm flange around each pocket sleeve interior with M2 mounting holes

---

## 5. Peripheral Cap Specifications

Each Cap is a standalone model/print that starts with the Universal Male Sled and extends into its specific housing. See `tutorials/caps/` for step-by-step SketchUp guides.

### Housing 1: Listen (Microphone)
- **Component:** INMP441 MEMS mic (8×8mm) + 100nF cap
- **Connection:** 6-pin JST pigtail (I2S)
- **Form:** Low-profile dome, ~10mm extension from sled
- **Features:** 3×3 pinhole array (1mm holes) on front face, internal PCB slot
- **Tutorial:** `tutorials/caps/listen.md`

### Housing 2: Speak (Amplifier + Speaker)
- **Component:** MAX98357A (7×7mm) + 3W 8Ω Speaker (40mm)
- **Connection:** 6-pin JST pigtail (I2S)
- **Form:** Heavy trapezoidal box with asymmetric flare (40mm speaker > 24mm sled)
- **Features:** Structural grille, thermal divider (amp ↔ speaker), top/bottom vents
- **Tutorial:** `tutorials/caps/speak.md`

### Housing 3: Climate (Environmental)
- **Component:** BME280 (13×10mm) + 100nF cap
- **Connection:** 6-pin JST pigtail (4 active: VCC, GND, SDA, SCL)
- **Form:** Standoff vented box, minimum 15mm from hub face
- **Features:** 4-sided louvered gills for passive airflow
- **Tutorial:** `tutorials/caps/climate.md`

### Housing 4: Motion (Presence)
- **Component:** HC-SR501 PIR (23×23mm board, 15mm dome)
- **Connection:** 4-pin JST pigtail (VCC, GND, OUT, NC)
- **Form:** Recessed shroud
- **Features:** 15.5mm Fresnel lens cutout, 2× 3mm adjustment holes for potentiometers
- **Tutorial:** `tutorials/caps/motion.md`

### Housing 5: Sight (Camera)
- **Component:** ESP32-CAM-MB dual-board (40×27mm)
- **Connection:** 4-pin JST pigtail (UART: VCC, GND, TX, RX)
- **Form:** Articulated ball-joint head (two-part print)
- **Features:** 15.5mm lens cutout, thin wall (<1.5mm) near WiFi antenna
- **Tutorial:** `tutorials/caps/sight.md`

### Housing 6: Display (The Monitor)
- **Component:** LCD 16×2 + PCF8574 backpack (71×26×15mm)
- **Connection:** 4-pin JST pigtail (I2C: VCC, GND, SDA, SCL)
- **Form:** Flared monitor (24mm sled → 75×30mm bezel)
- **Features:** 71×27mm window, M3 standoffs for backpack, snap-fit backplate
- **Socket:** Center Front ONLY
- **Tutorial:** `tutorials/caps/display.md`

---

## 6. Anchor Ecosystem

Adapters that plug into the Rear Universal Anchor (40mm circular recess). See `tutorials/anchors/` for SketchUp guides.

### Wall Plate Adapter
- 40×6mm male cylinder with cross-keys → 60×60mm flat plate
- 4× M3 countersunk holes + central 15mm cable hole
- **Tutorial:** `tutorials/anchors/wall-plate.md`

### Desk Pedestal Adapter
- Weighted wedge, 15° upward tilt for desk viewing
- Hollow cable routing channel + weight fill pocket
- **Tutorial:** `tutorials/anchors/desk-pedestal.md`

---

## 7. Internal Spatial Layout Protocol

All component placement must respect the truncated hex-pyramid geometry. The cavity tapers from 150mm F2F (rear) to 60mm F2F (front) over 90mm depth.

### Cavity Taper Formula

At any Z-height: `F2F(Z) = Base_F2F - (Base_F2F - Front_F2F) × (Z - Collar_H) / Pyr_H`

For Z < Collar_H (collar zone): `F2F = Base_F2F = 150mm`

### Hex Boundary Constraint

A rectangular component of width W and height H fits inside a hex with circumradius R only if: `H/2 ≤ −√3·(W/2) + √3·R`. Components wider than the inscribed rectangle must have corners chamfered.

### Z-Stack Layout (90mm depth)

| Zone | Z Range | Contents |
|------|---------|----------|
| A | 3–15mm | Battery holder (18650) + TP4056 + MT3608 + 3.3V LDO |
| Gap | 15–20mm | Wire routing |
| B | 20–37mm | 120×80mm master solder board on M3 standoffs |
| Gap | 37–45mm | Wire routing |
| C | 45–65mm | ESP32-WROOM-32 (55×28mm) on M2 standoffs, Y=+18mm offset |
| Gap | 65–75mm | Wire routing to LCD |
| Front | 75–87mm | LCD 16×2 display (as Display Cap) |

### Floor Plan
- Power modules (TP4056, MT3608) cluster near USB-C wall (Y=+30mm)
- Battery holder centered at Y=−25mm
- Master board centered on X-axis
- ESP32 offset Y=+18mm for USB-C access

### Minimum Clearance
No component or standoff may have less than 3mm clearance from the cavity wall. Below 2mm → increase Total_Depth or relocate to a wider zone.

---

## 8. Modular Assembly Protocol

### Two Valid Assembly Paths

**Path A (Printed Plates):** Print Zone A/B/C plates as modular sleds that slide into internal rail slots and screw onto bosses. Best for reproducible builds and serviceability. See `tutorials/nodebase/interior-plates.md`.

**Path B (Glue-In Standoffs):** Skip printing plates. Use flat landing pads on the hub interior as glue surfaces. Scuff with sandpaper, apply cyanoacrylate, seat standoff. Faster for one-off prototypes. See `tutorials/nodebase/interior-plates.md`.

Both paths are valid. Plates are RECOMMENDED but NOT MANDATORY.

### Interior Components (separate prints that glue in)

| Component | Count | Glue Position | Z Range | Purpose |
|-----------|-------|---------------|---------|---------|
| Rail Guides | 6 | Hex vertices (0°,60°,...300°) | 3–12mm | Channel for plate edges |
| Keyway Strips | 3 | 0°, 120°, 240° | 3–87mm | Angular orientation |
| Landing Pads | 4 | (±57, ±37) | Z=20 | Glue targets for M3 standoffs |
| Reference Markers | 10 | Zone A/B/C coords | Various | Drill/glue pilot guides |
| Zone A Tray | 1 | Floor, slides into rails | 3–15mm | Battery + power cradle |
| Zone B Plate | 1 | Z=20, rails or standoffs | 20–37mm | Master board mount |
| Zone C Plate | 1 | Z=45, rails or standoffs | 45–65mm | ESP32 mount |

### Mandatory Plate Design Rules
All printed interior plates MUST include:
1. **Wire Chimney:** Central 30×30mm cutout per plate
2. **Socket Clearance Notches:** Subtract port sleeve volumes from plates
3. **Hex-Grid Infill:** Honeycomb pattern for non-structural areas (airflow)

### Adhesive Notes
- PETG is chemically resistant → scuff landing pads with 120-grit sandpaper for mechanical bond
- Cyanoacrylate (super glue): good bond after scuffing
- Hot glue: removable, but softens above 80°C — avoid near MT3608
- PETG cement (Weld-On 3): permanent bond option

### Fastener Standards
- M3 heat-set insert: 4.2mm hole, 5mm boss diameter
- M2 heat-set insert: 2.4mm hole, 4mm boss diameter
- Screw lengths: M3×6 (tray), M3×8 (plate), M2×4 (PCB), M2×6 (plate)

---

## 9. Print Settings Reference

| Setting | Value |
|---------|-------|
| Material | PETG (mandatory for NodeBase, Speak, Sight) |
| Layer Height | 0.2mm |
| Wall Count | 3+ perimeters (3mm shell) |
| Infill | 20% gyroid |
| Build Plate | Brim recommended (large flat base) |
| Orientation | Base flat on bed, rear face down |
| Supports | None required (all overhangs ≤ 45° by design) |