# Sight Cap — SketchUp Tutorial

**Component:** ESP32-CAM-MB Dual-Board (40×27mm)
**Connection:** 4-pin JST XH (UART: VCC, GND, TX, RX)
**Socket Position:** 30° (high visibility, clear line of sight)
**Print Count:** 2 (socket side + camera head — separate prints)
**Material:** PETG (mandatory — ESP32-CAM generates heat)

---

## What You're Building

An articulated camera head using a ball joint. The sled side holds the socket; the camera head holds the ball. This allows manual aiming (~25° range) after plugging in. Two-part print.

---

## Part 1: Socket Side (Sled + Ball Socket)

### Step 1: Male Sled Base

1. Draw 23.6mm × 15.6mm rectangle
2. Push/Pull 10mm deep
3. Apply 1° draft on outer walls
4. Subtract 18×8mm wire channel
5. Add +3mm flange per side
6. Group as `Sled-Sight`

### Step 2: Ball Socket Housing

On the sled front face:
1. Draw a cylinder extending ~8mm forward
2. At the front of this cylinder, carve a spherical socket:
   - Sphere diameter: ~15mm (matches the ball on the head)
   - Socket depth: ~8mm (half-sphere concavity)
3. Use **Arc** tool to draw the concave profile, then **Follow Me** to sweep it
4. Add a circular lip (1mm rim) around the socket opening to retain the ball
5. Group as `Socket-Sight`

### Step 3: Union Part 1

1. Select `Sled-Sight` and `Socket-Sight`
2. Solid Tools → Union
3. Solid Inspector²
4. Export as `housing_sight_socket.stl`

---

## Part 2: Camera Head (Ball + Lens Housing)

### Step 1: Ball Joint

1. Draw a sphere: 15mm diameter (matches socket concavity)
2. This sphere clicks into the socket and allows rotation
3. Print the ball at slightly reduced size (14.8mm) for smooth rotation, OR sand to fit

### Step 2: Camera Housing

On the ball's forward face:
1. Draw a rectangular box: 42mm wide × 29mm tall × 15mm deep (fits 40×27mm ESP32-CAM board)
2. Shell to 1.5mm walls
3. On the front face, draw a 15.5mm diameter circle for the OV2640 lens cutout
4. Push/Pull through (cutout)
5. The lens protrudes slightly through this opening

### Step 3: Antenna Wall (CRITICAL)

The ESP32-CAM has an onboard WiFi antenna trace. The wall near the antenna MUST be <1.5mm:

1. Identify which end of the housing has the antenna (typically the end opposite the lens)
2. Measure wall thickness: must be ≤1.5mm in the antenna zone
3. If the wall is too thick, use Push/Pull to thin it from inside
4. Mark this zone with a guide line so you don't accidentally thicken it during cleanup

### Step 4: Board Mounting

Inside the housing:
1. Add 2× M2 standoff positions matching the ESP32-CAM mounting holes (2.4mm holes)
2. Board sits with lens aligned to front cutout
3. USB port on the ESP32-CAM-MB should face the ball joint side (for programming access if needed)

### Step 5: Wire Exit

1. Route wires from the ESP32-CAM through the ball joint center and into the socket
2. This means drilling a 4mm hole through the ball center after printing
3. OR model the hole in SketchUp: draw a 4mm circle on the ball rear face, Push/Pull through

### Step 6: Union Part 2

1. Select ball and camera housing
2. Solid Tools → Union
3. Solid Inspector²
4. Export as `housing_sight_head.stl`

---

## Assembly Checklist

- [ ] Socket side printed and plugged into hub 30° socket
- [ ] Camera head printed separately
- [ ] Ball joint clicks into socket — test rotation range (~25°)
- [ ] ESP32-CAM board mounted with 2× M2 screws
- [ ] 4-pin JST pigtail (UART2: VCC, GND, GPIO2, GPIO12)
- [ ] OV2640 lens centered in front cutout
- [ ] Antenna wall ≤1.5mm thick (verify with calipers)
- [ ] UART2 wiring: ESP-CAM GPIO2 → NodeBase GPIO16, GPIO12 → GPIO17
- [ ] Wire routed through ball joint center hole

---

## SketchUip Tips for Ball Joints

- The ball-socket fit must be tight enough to hold position but loose enough to adjust by hand
- **Test print** the ball and socket first at 100% scale before committing to the full housing
- If the ball is too tight: sand the ball or scale the socket to 101%
- If the ball is too loose: add a thin shim or scale the socket to 99%
- The 1mm lip around the socket opening is what retains the ball — don't skip it