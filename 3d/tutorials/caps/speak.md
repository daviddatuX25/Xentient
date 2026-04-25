# Speak Cap — SketchUp Tutorial

**Component:** MAX98357A (7×7mm) + 3W 8Ω Speaker (40mm diameter)
**Connection:** 6-pin JST XH (I2S: VCC, GND, DIN, BCLK, LRC, GAIN)
**Socket Position:** 90° (near USB-C, ventilation access)
**Print Count:** 1
**Material:** PETG (mandatory — amp generates heat)

---

## What You're Building

A heavy trapezoidal housing with asymmetric flare. The 40mm speaker is wider than the 24mm sled, so the housing must flare outward. Includes a thermal divider between the MAX98357A amp and the speaker magnet.

---

## Step 1: Male Sled Base

1. Draw 23.6mm × 15.6mm rectangle
2. Push/Pull 10mm deep
3. Apply 1° draft on outer walls
4. Subtract 18×8mm wire channel
5. Add +3mm flange per side
6. Group as `Sled-Speak`

## Step 2: Trapezoidal Flare

The housing must expand from 23.6mm (sled width) to at least 44mm (40mm speaker + 2mm wall each side):

1. On the sled front face, draw a 44mm wide × 40mm tall trapezoid
   - Bottom matches sled: 23.6mm
   - Top flares to: 44mm
   - Height: ~22mm (speaker depth + wall)
2. The flare is **asymmetric** — offset 3mm to one side to avoid blocking neighboring caps
3. Use **Line** tool to draw the trapezoid profile
4. **Push/Pull** the profile to the housing depth (~22mm)
5. Shell to 2mm wall thickness (Solid Subtract method)
6. Group as `Body-Speak`

## Step 3: Speaker Grille

On the front face of the housing:
1. Draw a 40mm diameter circle (speaker size)
2. Inside, draw a radial grille pattern:
   - 4–6 concentric rings (1mm thick, 2mm gap between)
   - OR horizontal bars (1mm wide, 2mm apart)
3. Push/Pull the open areas through the front wall (cutout)
4. Keep 2mm minimum wall between grille openings

## Step 4: Thermal Divider

This is critical — the MAX98357A generates heat that must not transfer to the speaker magnet:

1. Inside the housing, draw a horizontal shelf/wall dividing the interior into two chambers:
   - **Rear chamber** (near sled): MAX98357A amp zone, ~7mm tall
   - **Front chamber** (near grille): Speaker zone, ~33mm deep
2. The divider is a 2mm thick horizontal plate spanning the full width
3. Add ventilation openings on the divider: 2× 4mm diameter holes for wire pass-through + airflow

## Step 5: Amp Zone Details

In the rear chamber:
1. Draw 7×7mm pocket for MAX98357A (Push/Pull 2mm deep)
2. Add wire routing channel connecting to the 18×8mm sled channel

## Step 6: Ventilation

Top and bottom vents for amp heat dissipation:
1. Draw 3 horizontal slits (2mm wide) on the top face above the amp zone
2. Push/Pull through (cutout)
3. Repeat on the bottom face
4. Chamfer slit edges at 45°

## Step 7: Union & Export

1. Select `Sled-Speak` and `Body-Speak`
2. Solid Tools → Union
3. Run Solid Inspector²
4. Export as `housing_speak.stl`

---

## Assembly Checklist

- [ ] MAX98357A placed behind thermal divider in amp zone
- [ ] 40mm speaker seated in front cutout, grille facing out
- [ ] 6-pin JST pigtail routed through wire channel
- [ ] GAIN pin configured (SD_MODE: pull VCC = 15W, GND = mute, float = 9dB)
- [ ] Thermal divider intact — no direct contact between amp IC and speaker magnet
- [ ] Ventilation slits unobstructed
- [ ] Asymmetric offset positions housing away from neighboring caps