Xentient Framework: Master Mechanical & 3D Printing Specification V3
Architecture: Distributed Hub-and-Spoke Edge AI (Truncated Hex-Pyramid Base)
Core Pivot: 16x2 LCD is now classified as an independent, pluggable peripheral cap.

1. Global 3D Printing & Manufacturing Guidelines
To ensure the modularity works and the electronics survive, all parts must adhere to these physical constraints.

Material: PETG is mandatory for the Main Node, Speak Cap (Amp heat), and Sight Cap (ESP32-CAM heat). PLA will warp.

Structural Wall Thickness: Minimum 3.0mm for the main hub shell and anchor planes. Peripherals can use 1.5mm–2.0mm walls to save weight.

Tolerances: * Friction Fits (Sleds/Plugs): Male parts must be designed exactly 0.4mm smaller (0.2mm offset on all sides) than their female receivers.

Screw Holes: Add 0.2mm to the diameter of screw bodies (e.g., M3 body = 3.2mm hole).

Fasteners: Use Brass Heat-Set Inserts (M2 for PCBs, M3 for structural anchors) instead of tapping plastic.

Overhangs/Bridging: Design internal cavities with 45° chamfers to eliminate the need for internal supports (which are difficult to remove from the enclosed Hub).

2. The Universal Mating Protocol (The Sled & Socket)
This is the standardized mechanical interface connecting every Cap to the Hub.

The Female Socket (Carved into the Hub):

Width: 24.0mm

Height: 16.0mm

Depth: 10.0mm (Port_D in SCAD; recessed sleeve behind wall provides pocket depth)

Internal Wire Channel: 18.0mm W x 8.0mm H (Sized precisely to allow a 6-pin JST XH2.54 connector to pass through during assembly).

The Male Sled (The base of every Peripheral Cap):

Width: 23.6mm

Height: 15.6mm

Depth: 10.0mm

Feature: A 1-degree draft angle on the outer walls to allow it to wedge tightly into the female socket without snapping.

Hollow Core: 18.0mm x 8.0mm pass-through for the pigtail wiring.

3. Main Node Module (The Hex-Core Base)
The Conduit Entity. It does not process AI; it powers the system and routes telemetry.

Geometry: Truncated Hexagonal Pyramid.

Dimensions: * Base Width (Wall-side): 150mm flat-to-flat (Radius ~86.6mm).

Front Width: 60mm flat-to-flat (Radius ~34.6mm).

Total Depth: 90mm.

Port Matrix: * 1x Center Front (Dedicated to the wide Display Cap).

6x Angled Perimeter Faces (For sensors).

1x Rear Anchor Pocket (40mm diameter, 6mm deep, with anti-rotation cross-keys).

Perimeter Port Assignments (recommended for optimal sensor placement):
30°  = Sight (ESP32-CAM) — high visibility, clear line of sight
90°  = Speak (MAX98357A) — near USB-C cutout and ventilation
150° = Climate (BME280) — away from heat sources
210° = Motion (PIR HC-SR501) — human detection height
270° = Listen (INMP441) — opposite speaker to avoid feedback
330° = Reserved (future peripheral)

Ventilation: 4 slits per face (2mm wide, 45° chamfered) on 3 alternating collar faces (0°, 120°, 240° — between port faces). Critical for MAX98357A amp heat dissipation.

Internal Zoning & Mounts:

Zone A (Rear/Floor, Z=3–15): Battery holder (18650 clip-in, ~78×22×19mm) glued to hub floor at Y=−25mm. Power modules: TP4056 (25×19mm, near USB-C at 90° face), MT3608 boost (37×22mm, adjacent to TP4056), and 3.3V LDO (12×8mm) — all glued to floor or optional Zone A tray plate. See §7 for assembly paths.

Zone B (Middle, Z=20–37): 120×80mm master solder board on M3 standoffs (110×70mm span). Board corners chamfered 15mm to fit hex boundary at Z=20 (inner apothem ≈64mm, diagonal corners exceed without 15mm chamfer). 4× M3 heat-set bosses in hub shell for screw-mount (Path A only), or 4× flat landing pads for glue-in standoffs (Path B).

Zone C (Upper, Z=45–65): ESP32-WROOM-32 dev board (55×28mm) on M2 standoffs (22×48mm span), Y-offset +18mm. 4× M2 heat-set bosses or landing pads at Zone C coordinates.

Front (Z=75–87): LCD 16×2 display (71×26mm) mounted as Display Cap per §4 Housing 6.

See §6 for cavity taper constraints and §7 for modular/glue-ready assembly protocol.

Wiring: Female JST XH headers will sit loose or be hot-glued directly behind each of the 7 female sockets inside the cavity.

4. Peripheral Cap Specifications
Each Cap is a standalone 3D print that begins with the Universal Male Sled and blossoms into its specific housing.

Housing 1: Listen (Microphone)
Component: INMP441 MEMS mic (8x8mm) + 100nF cap.

Connection: 6-pin JST pigtail (I2S).

3D Form Factor: Low-profile dome extending ~10mm from the sled.

Features: A micro-pinhole array (1mm holes) on the front face for acoustic transparency. Internal slot to slide the 8x8mm PCB securely without screws.

Housing 2: Speak (Amplifier + Speaker)
Component: MAX98357A (7x7mm) + 3W 8Ω Speaker (40mm).

Connection: 6-pin JST pigtail (I2S).

3D Form Factor: Heavy trapezoidal box. Since the 40mm speaker is wider than the 24mm plug, the housing must flare outward.

Features: Heavy structural grille. Internal thermal divider to separate the MAX98357A (which generates heat) from the speaker magnet. Top/bottom ventilation slits for the amp.

Mounting Rule: Due to size, must be designed with an asymmetrical offset so it doesn't block neighboring Caps.

Housing 3: Climate (Environmental)
Component: BME280 (13x10mm) + 100nF cap.

Connection: 6-pin JST pigtail (4 active: VCC, GND, SDA, SCL).

3D Form Factor: Standoff vented box.

Features: Must extend at least 15mm away from the hub before housing the sensor to avoid reading the heat generated by the Hub's ESP32/battery. Heavily louvered sides (gill slits) for maximum passive airflow.

Housing 4: Motion (Presence)
Component: HC-SR501 PIR (23x23mm board, 15mm dome).

Connection: 4-pin JST pigtail (VCC, GND, OUT, NC). 4th pin unused/floats — 3-pin JST not in BOM.

3D Form Factor: Recessed shroud.

Features: A precise 15.5mm circular front cutout allowing the Fresnel lens dome to protrude. Two small 3mm access holes on the side wall to allow a screwdriver to adjust the Sensitivity and Delay potentiometers without disassembling the housing.

Housing 5: Sight (Camera)
Component: ESP32-CAM-MB dual-board (40x27mm).

Connection: 4-pin JST pigtail (UART: VCC, GND, TX, RX).

3D Form Factor: Articulated Head.

Features: The Male Sled terminates in a Ball Joint. The Camera housing features the socket. This allows the camera to be manually aimed up/down/left/right after plugging it in. Front face features an exact cutout for the OV2640 lens. Ensure plastic is kept thin (<1.5mm) near the onboard WiFi antenna trace to prevent signal blocking.

Housing 6: Display (The Monitor) - NEW
Component: LCD 16x2 + PCF8574 backpack (71x26x15mm).

Connection: 4-pin JST pigtail (I2C: VCC, GND, SDA, SCL).

3D Form Factor: Flared Monitor. The base is the 24x16mm sled, which rapidly flares outward to a 75x30mm rectangular bezel.

Features: An exact 71x27mm window on the front. Internal M3 standoffs to bolt the LCD backpack in place. A snap-fit backplate to enclose it.

Mounting Rule: Exclusively designed to plug into the Center Front socket of the Hub.

5. Anchor Ecosystem (The Mounts)
These adapters plug into the Rear Universal Anchor (40mm circular recess) of the Main Hub.

Wall Plate Adapter: A 40x6mm male cylinder with cross-keys that fits the hub. It flares out to a flat 60x60mm plate with four M3 countersunk holes for wall mounting. Includes a central 15mm hole if routing USB power directly through the drywall.

Desk Pedestal Adapter: A weighted, wedge-shaped stand. It holds the Hub at a 15-degree upward angle for optimal desk viewing and mic pickup. Features a hollow routing channel to feed the USB-C power cable out the back of the base.

6. Internal Spatial Layout Protocol
All component placement inside the Main Node Module must respect the truncated hex-pyramid geometry. The cavity tapers from 150mm F2F (rear) to 60mm F2F (front) over 90mm depth. Components that fit at Z=0 may NOT fit at Z=45.

Cavity Taper Awareness: At any Z-height, the flat-to-flat (F2F) width is: F2F(Z) = Base_F2F - (Base_F2F - Front_F2F) * (Z - Collar_H) / Pyr_H. For Z < Collar_H, F2F = Base_F2F.

Hex Boundary Constraint: A rectangular component of width W and height H fits inside a hex with circumradius R only if all four corners lie inside the hex. The critical constraint is: H/2 ≤ −√3·(W/2) + √3·R. Components wider than the inscribed rectangle must have corners chamfered.

Minimum Clearance Rule: No component or standoff may have less than 3mm clearance from the cavity wall on any side. If clearance falls below 2mm, increase Total_Depth or relocate the component to a wider zone.

Z-Stack Zoning (90mm depth):
Zone A (Z=3–15): Battery holder + power modules (TP4056, MT3608, LDO) on floor plate.
Gap (Z=15–20): Wire routing.
Zone B (Z=20–37): Master solder board (120×80mm, chamfered corners) on M3 standoffs.
Gap (Z=37–45): Wire routing.
Zone C (Z=45–65): ESP32-WROOM-32 dev board (55×28mm) on M2 standoffs, Y-offset +18mm.
Gap (Z=65–75): Wire routing to LCD.
Front (Z=75–87): LCD 16×2 display (71×26mm), mounted as a Display Cap.

Floor Plan: Power modules (TP4056, MT3608) cluster near USB-C wall (Y=+30mm). Battery holder centered at Y=−25mm. Master board centered on X-axis. ESP32 offset Y=+18mm for USB-C access.

7. Modular Internal Design Protocol
Rationale: The hub shell is a complex, enclosed hex-pyramid. Printing internal plates, standoffs, and component mounts as part of the shell creates impossible overhangs and makes assembly difficult. The modular approach separates internal structure into independent, 3D-printable plates that screw or glue into mounting bosses printed on the hub shell interior.

Assembly Philosophy — Glue-Ready / Open Atrium:
The interior follows a "Volume Reservation" approach: the hub shell provides the hollow atrium with reference mounting points, and the builder decides how to populate it. You have two valid paths:

Path A (Printed Plates): Print separate Zone A/B/C plates as modular sleds that slide into internal rail slots and screw onto bosses. Best for reproducible builds and future serviceability.

Path B (Glue-In Standoffs): If you have physical nylon or brass standoffs on hand, skip printing plates entirely. Use the flat "Landing Pads" on the hub interior as glue surfaces. Just scuff the pad with sandpaper, apply cyanoacrylate (super glue) or hot glue, and seat your standoff. Faster for one-off prototypes.

Both paths are valid. The hub shell provides the geometry to support either. Plates are RECOMMENDED but NOT MANDATORY — the landing pads alone give you a working chassis.

Hub Shell Scope (what stays in v3.scad):
- Outer shell (truncated hex pyramid + collar)
- Socket pockets (7 faces) + sleeves (MANDATORY — Universal Mating depends on these)
- Ventilation gills
- Rear anchor
- USB-C cutout (MANDATORY — TP4056 charging access, includes 1mm floor overcut for thick cable plug housing)
- Collar aesthetic ribs (6×, collar zone only — taper ribs removed, replaced by subtractive rail slots)
- 6× Subtractive rail slots at hex vertices (3.5mm wide × 2mm deep, collar zone only Z=3–12) for plate insertion
- Mounting bosses with M3 heat-set inserts at Zone A (battery/power). Zone B/C bosses are Path A only — omitted in Path B builds for cleaner wiring atrium
- Flat "Landing Pads" (8mm diameter, 0.5mm raised circles) at Zone B standoff coordinates on cavity walls — glue targets for physical standoffs
- 3× Vertical alignment keyways (subtractive grooves) at 0°, 120°, 240° on cavity walls
- 0.5mm deep × 1.5mm diameter subtractive reference pits at Zone A/B/C mounting coordinates (easier to locate with drill bit or glue tip than additive bumps). Zone B includes Path B standoff markers at (±57, ±37) for manual glue placement.

Module Definitions (separate .scad files, OPTIONAL for Path A builds):

Zone A Tray (zone_a_tray.scad): Battery cradle floor plate with clip-in pockets for TP4056, MT3608, LDO. 2mm thick hex-shaped plate with central 30×30mm wire chimney cutout. Notches around port sleeve intrusions. Screws onto 4× M3 bosses at Z=3. Slides into rail slots at 0° and 120° corners. Must fit within hex F2F at Z=3 (≈142mm).

Zone B Plate (zone_b_plate.scad): Master solder board mounting plate with 4× M3 standoffs (110×70mm span), cross-bracing, 30×30mm wire chimney, 15mm chamfered corners (must clear hex apothem at Z=20), hex-grid infill for airflow. Notches around port sleeve intrusions. Screws onto 4× M3 bosses at Z=20 (Path A) or rests on glued standoffs at landing pads (Path B). Must fit within hex F2F at Z=20 (≈133mm).

Zone C Plate (zone_c_plate.scad): ESP32-WROOM-32 mounting plate with 4× M2 standoffs (22×48mm span), anti-rotation nub, 30×30mm wire chimney, hex-grid infill. Screws onto 4× M2 bosses at Z=45. Must fit within hex F2F at Z=45 (≈106mm).

Display Cap (display_cap.scad): LCD 16×2 housing with bezel, M3 standoffs for backpack, snap-fit backplate. Plugs into front center socket per Universal Mating Protocol.

Mandatory Plate Design Flags:
All printed internal plates MUST include:
1. Wire Chimney: Central 30×30mm cutout per plate. Allows JST pigtails from floor (battery/power) to reach top (ESP32/LCD) without being pinched between plates.
2. Socket Clearance Notches: Plates must use difference() to subtract port_sleeve volumes. A plate at Z=15 must not collide with a port sleeve at Z=15. Notch the plate around the sleeve.
3. Hex-Grid Infill: Non-structural plate areas should use honeycomb pattern (not solid fill). Allows the ventilation gills to move air across all layers. Prevents heat stagnation near MAX98357A amp.

Internal Rail System:
6 subtractive rail slots at each hex vertex (0°, 60°, 120°, 180°, 240°, 300°) cut INTO the inner wall surface. Rails are 3.5mm wide × 2mm deep grooves, active ONLY in the collar zone (Z=3 to Z=12) where the wall is a full 3mm thick. Above the collar, the tapering wall is too thin (<2mm) for rail grooves — plates above the collar rest on bosses/landing pads for Z positioning. The collar-zone rails align Zone A tray and provide angular lock for all plates. 3 alignment keyways (subtractive grooves, not ridges) at 0°, 120°, 240° provide additional angular orientation.

Assembly Method (Path A — Printed Plates):
1. Print hub shell (v3.scad) with ribs, bosses, keyways, landing pads.
2. Heat-set M3/M2 brass inserts into bosses.
3. Print Zone A tray, test-fit battery + power modules.
4. Slide Zone A tray into rail slots at Z=3, secure with M3×6 screws.
5. Wire battery leads to TP4056, then TP4056 to MT3608/LDO.
6. Print Zone B plate, mount solder board with M3×4 screws.
7. Slide Zone B plate into rail slots at Z=20, secure with M3×8 screws.
8. Route wires through wire chimney and gap (Z=15–20).
9. Print Zone C plate, mount ESP32 with M2×4 screws.
10. Slide Zone C plate into rail slots at Z=45, secure with M2×6 screws.
11. Wire JST connectors to board pads.
12. Plug peripheral caps into side/front sockets.

Assembly Method (Path B — Glue-In Standoffs):
1. Print hub shell (v3.scad) with landing pads and reference dimples.
2. Scuff landing pads at Zone B (±57, ±37 at Z=20) with sandpaper.
3. Apply cyanoacrylate to pads, seat 4× physical M3 standoffs.
4. Glue battery holder to hub floor at Y=−25mm.
5. Glue TP4056/MT3608/LDO near USB-C wall (Y=+30mm).
6. Mount solder board onto glued standoffs with M3 screws.
7. Glue ESP32 standoffs at Zone C coordinates (reference dimples guide placement).
8. Wire and assemble as usual.

Adhesive Note: PETG is chemically resistant. For super glue (cyanoacrylate), scuff the landing pad with 120-grit sandpaper first for mechanical bond. Hot glue (removable) works but softens above 80°C — avoid near MT3608 amp. For permanent bonds, use PETG-specific plastic cement (e.g., Weld-On 3).

Fastener Standards: M3 heat-set insert (4.2mm hole, 5mm boss) for structural mounts. M2 heat-set insert (2.4mm hole, 4mm boss) for PCB mounts. Screw lengths: M3×6 (tray), M3×8 (plate), M2×4 (PCB), M2×6 (plate).