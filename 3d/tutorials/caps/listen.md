# Listen Cap — SketchUp Tutorial

**Component:** INMP441 MEMS Microphone (8×8mm PCB)
**Connection:** 6-pin JST XH (I2S: VCC, GND, WS, SCK, SD, L/R)
**Socket Position:** 270° (opposite speaker, avoids feedback)
**Print Count:** 1
**Material:** PETG (recommended) or PLA

---

## What You're Building

A low-profile dome housing extending ~10mm from the sled, with a 3×3 pinhole array on the front face for acoustic transparency and an internal slot for the INMP441 PCB.

---

## Step 1: Male Sled Base

1. Draw 23.6mm × 15.6mm rectangle (0.4mm clearance in 24.0×16.0mm socket)
2. Push/Pull 10mm deep
3. Apply 1° draft on outer walls: Move top edges inward ~0.17mm per side
4. Subtract 18×8mm wire channel from center (Push/Pull through)
5. Add +3mm flange on each side (total width 29.6mm) that sits flush against hub exterior
6. Group as `Sled-Listen`

## Step 2: Dome Body

1. On the sled front face, draw the dome profile: start at sled width (23.6mm), extend ~10mm forward
2. Use **Arc** tool (`A`) to draw a gentle dome curve from the top of the sled face to ~10mm forward
3. **Push/Pull** the dome profile to match sled height (15.6mm)
4. **Follow Me** tool: Select the dome face path, then use Follow Me to sweep the dome shape — OR manually draw the dome as a half-cylinder with filleted top
5. Group as `Dome-Listen`

## Step 3: Pinhole Array

On the dome front face:
1. Draw a 3×3 grid of 1mm diameter circles
2. Space them 4mm apart (center-to-center)
3. Push/Pull each circle through the dome wall (cutout)
4. These allow sound to reach the MEMS mic while protecting the PCB

## Step 4: Internal PCB Slot

Inside the dome:
1. Draw an 8mm × 8mm rectangle (INMP441 PCB size)
2. Push/Pull to create a slot 1mm deep — the PCB slides in horizontally
3. Add a 0.5mm retaining lip on the top edge (Line tool, Push/Pull 0.5mm) to keep the PCB from falling out

## Step 5: Wire Routing

1. The 18×8mm wire channel from the sled must connect to the PCB slot interior
2. Verify the channel is continuous from the sled rear to the PCB slot
3. The 6-pin JST connector must pass through this channel during assembly

## Step 6: Union & Export

1. Select `Sled-Listen` and `Dome-Listen`
2. Use **Solid Tools → Union** to merge into one solid
3. Run **Solid Inspector²** — fix any leaks
4. Export as `housing_listen.stl` (binary, mm)

---

## Assembly Checklist

- [ ] INMP441 board slides into internal slot
- [ ] 6-pin JST pigtail routed through wire channel
- [ ] L/R select pin configured: **GND = left channel** (per validation bead 1xi)
- [ ] 100nF decoupling cap soldered on VCC line
- [ ] Pinholes face outward (away from hub body)
- [ ] Mic orientation: sound enters through pinholes → MEMS diaphragm