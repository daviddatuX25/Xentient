# Xentient Peripheral Caps — Specification Sheet

**Date:** 2026-04-25  
**Framework Reference:** §4 (Peripheral Cap Specifications)  
**Mating Protocol:** §2 (Universal Sled & Socket)

---

## Universal Sled Parameters

All caps share the same base dimensions per Framework §2:

| Parameter | Value | Notes |
|-----------|-------|-------|
| Male width | 23.6mm | 0.4mm clearance in 24.0mm female socket |
| Male height | 15.6mm | 0.4mm clearance in 16.0mm female socket |
| Insertion depth | 10.0mm | Matches female pocket depth |
| Draft angle | 1° | Wedge fit, no binding |
| Wire channel | 18×8mm | Passes JST XH 2.54mm 6-pin connector |
| Flange | +3mm each side | Sits flush against hub exterior (increased from +2mm for bearing strength) |
| Material | PETG | Mandatory for Speak (amp heat), recommended for all |

---

## Housing 1: Listen (INMP441 MEMS Mic)

| Parameter | Value | Status |
|-----------|-------|--------|
| File | `caps/housing_listen.scad` | ✅ Draft |
| Component | INMP441 MEMS mic (8×8mm PCB) | — |
| Connection | 6-pin JST XH (I2S: VCC, GND, WS, SCK, SD, L/R) | — |
| Socket | 270° (opposite speaker, no feedback) | — |
| Extension | ~10mm from hub face | — |
| Form | Low-profile dome | — |
| Features | 3×3 pinhole array (1mm holes), internal PCB slot | — |
| Print notes | No supports needed (dome < 45°) | ⬜ Verify |

### Assembly Checklist
- [ ] INMP441 board slides into internal slot
- [ ] 6-pin JST pigtail routed through wire channel
- [ ] L/R select pin configured (GND = left channel per validation 1xi)
- [ ] 100nF decoupling cap soldered on VCC line

---

## Housing 2: Speak (MAX98357A + 3W Speaker)

| Parameter | Value | Status |
|-----------|-------|--------|
| File | `caps/housing_speak.scad` | ✅ Draft |
| Component | MAX98357A (7×7mm) + 3W 8Ω speaker (40mm dia) | — |
| Connection | 6-pin JST XH (I2S: VCC, GND, DIN, BCLK, LRC, GAIN) | — |
| Socket | 90° (near USB-C, ventilation access) | — |
| Extension | ~22mm from hub face (speaker flare) | — |
| Form | Trapezoidal flare (40mm speaker > 24mm sled) | — |
| Features | Speaker grille, thermal divider, top/bottom vents, asymmetric offset | — |
| Print notes | Supports likely for overhanging flare | ⬜ Verify |

### Critical Design Notes
- **Speaker (40mm) > Sled (24mm)**: Housing flares outward asymmetrically
- **Thermal divider**: Separates MAX98357A heat zone from speaker magnet
- **Ventilation slits**: Top and bottom for amp heat dissipation
- **Offset**: 3mm shift to avoid blocking neighboring caps

### Assembly Checklist
- [ ] MAX98357A placed behind thermal divider
- [ ] 40mm speaker seated in cutout with grille facing out
- [ ] 6-pin JST pigtail routed through wire channel
- [ ] GAIN pin configuration (SD_MODE: pull to VCC for 15W, GND for mute)

---

## Housing 3: Climate (BME280)

| Parameter | Value | Status |
|-----------|-------|--------|
| File | `caps/housing_climate.scad` | ✅ Draft |
| Component | BME280 breakout (13×10mm) + 100nF cap | — |
| Connection | 6-pin JST XH (I2C: VCC, GND, SDA, SCL, NC, NC) — 4 active | — |
| Socket | 150° (away from heat sources) | — |
| Extension | 15mm minimum from hub face | — |
| Form | Standoff vented box | — |
| Features | 4-sided louvered gills (4 slits/side), BME shelf, 15mm standoff | — |
| Print notes | No supports for gills (horizontal slits) | ⬜ Verify |

### Critical Design Notes
- **15mm standoff MANDATORY**: BME280 must be far from hub heat (ESP32/battery)
- **4-sided ventilation**: Maximum passive airflow for accurate readings
- **6-pin JST with 2 NC pins**: BOM only has 4-pin and 6-pin JST; use 6-pin, leave 2 unused

### Assembly Checklist
- [ ] BME280 board seated on internal shelf
- [ ] 6-pin JST pigtail (4 active wires + 2 empty)
- [ ] 100nF decoupling cap on VCC line
- [ ] Verify I2C address 0x76 per validation 1xi

---

## Housing 4: Motion (HC-SR501 PIR)

| Parameter | Value | Status |
|-----------|-------|--------|
| File | `caps/housing_motion.scad` | ✅ Draft |
| Component | HC-SR501 PIR (23×23mm board, 15mm dome) | — |
| Connection | 4-pin JST XH (VCC, GND, OUT, NC) — 3 active + 1 NC | — |
| Socket | 210° (human detection height) | — |
| Extension | ~18mm from hub face | — |
| Form | Recessed shroud | — |
| Features | 15.5mm Fresnel lens cutout, 2× 3mm adjustment holes | — |
| Print notes | No supports needed | ⬜ Verify |

### Critical Design Notes
- **3-pin JST not in BOM**: Using 4-pin JST with 1 NC pin (4th pin unused/floats)
- **PIR NOT wired in firmware yet** (per validation audit 2026-04-25) — hardware only for now
- **Adjustment holes**: Allow screwdriver access to Sensitivity and Delay potentiometers without disassembly

### Assembly Checklist
- [ ] HC-SR501 board seated in recessed shelf
- [ ] Fresnel lens dome protrudes through 15.5mm cutout
- [ ] 4-pin JST pigtail (3 active: VCC, GND, OUT + 1 NC)
- [ ] Potentiometer access holes aligned with PIR trimmers
- [ ] **FIRMWARE TODO**: Wire PIR interrupt on GPIO13 (bead 2ux pending)

---

## Housing 5: Sight (ESP32-CAM)

| Parameter | Value | Status |
|-----------|-------|--------|
| File | `caps/housing_sight.scad` | ✅ Draft |
| Component | ESP32-CAM-MB dual-board (40×27mm) | — |
| Connection | 4-pin JST XH (UART: VCC, GND, TX, RX) | — |
| Socket | 30° (high visibility, clear LOS) | — |
| Extension | Ball joint + articulated head | — |
| Form | Ball joint head (separate print) | — |
| Features | 15.5mm lens cutout, thin wall near antenna (<1.5mm), M2 board mounts | — |
| Print notes | **Two-part print**: socket side (sled+socket) and head (ball+lens) | ⬜ Verify |

### Critical Design Notes
- **UART2 remap**: GPIO2(TX)/GPIO12(RX) — NOT GPIO1/3 (conflict with UART0)
- **Antenna wall**: Must be <1.5mm thick near WiFi antenna trace
- **Ball joint**: Socket on sled side, ball on head side, ~25° articulation range
- **Camera level**: Level 1 (snapshot feed) per camera architecture decision

### Assembly Checklist
- [ ] Socket side printed and attached to sled
- [ ] Camera head printed separately (ball joint on back)
- [ ] ESP32-CAM board mounted with 2× M2 screws
- [ ] 4-pin JST pigtail (UART2: VCC, GND, GPIO2, GPIO12)
- [ ] OV2640 lens centered in front cutout
- [ ] UART2 wiring: ESP-CAM GPIO2 → NodeBase GPIO16, GPIO12 → GPIO17

---

## Housing 6: Display (LCD 16×2 + PCF8574)

| Parameter | Value | Status |
|-----------|-------|--------|
| File | `caps/housing_display.scad` | ✅ Draft |
| Component | LCD 16×2 + PCF8574 backpack (71×26×15mm) | — |
| Connection | 4-pin JST XH (I2C: VCC, GND, SDA, SCL) | — |
| Socket | CENTER FRONT (dedicated, not side port) | — |
| Extension | ~18mm flare from sled to bezel | — |
| Form | Flared monitor (24mm sled → 75×30mm bezel) | — |
| Features | 71×27mm window, 4× M3 standoffs for backpack, snap-fit backplate | — |
| Print notes | Supports for overhanging flare | ⬜ Verify |

### Critical Design Notes
- **EXCLUSIVE**: Only fits center front socket (per Framework §2)
- **Rapid flare**: 24×16mm sled expands to 75×30mm bezel
- **Separate backplate**: Snap-fit enclosure, M3 screws into heat-set inserts

### Assembly Checklist
- [ ] LCD + PCF8574 backpack mounted on M3 standoffs
- [ ] 4-pin JST pigtail (I2C: VCC, GND, SDA, SCL)
- [ ] Verify I2C address (0x27 default for PCF8574)
- [ ] Snap-fit backplate installed
- [ ] LCD contrast pot accessible through backplate opening

---

## Anchor 1: Wall Plate Adapter

| Parameter | Value | Status |
|-----------|-------|--------|
| File | `anchors/anchor_wall_plate.scad` | ✅ Draft |
| Socket | Rear universal anchor (40mm dia, 6mm deep) | — |
| Plate | 60×60mm flat plate, 6mm thick | — |
| Features | Cross-keys (anti-rotation), 4× M3 countersunk holes, 15mm cable hole | — |
| Print notes | No supports needed | ⬜ Verify |

### Assembly Checklist
- [ ] Male cylinder seats fully in hub rear anchor
- [ ] Cross-keys engage anti-rotation channels
- [ ] 4× M3 screws into wall anchors
- [ ] USB-C cable routed through 15mm center hole (optional)

---

## Anchor 2: Desk Pedestal

| Parameter | Value | Status |
|-----------|-------|--------|
| File | `anchors/anchor_desk_pedestal.scad` | ✅ Draft |
| Socket | Rear universal anchor (40mm dia, 6mm deep) | — |
| Base | 80×70mm weighted wedge, 15° upward tilt | — |
| Features | Cross-keys, hollow cable routing channel, weight fill pocket | — |
| Print notes | No supports, fill pocket with sand/metal for stability | ⬜ Verify |

### Assembly Checklist
- [ ] Male cylinder seats in hub rear anchor
- [ ] Weight fill pocket loaded (sand, BBs, or metal plate)
- [ ] USB-C cable routed through internal channel
- [ ] Hub angled 15° upward for optimal viewing/mic pickup