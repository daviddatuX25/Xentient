# Xentient Demo Enclosure — Constraints & Suggestions

> Companion to DEMO-ENCLOSURE.md. This document captures physical, electrical, and thermal constraints that affect the cardboard/folder prototype build. Read BEFORE cutting any cardboard.

---

## Critical Constraints

### C1: BME280 Airflow (NON-NEGOTIABLE)

The BME280 reads temperature, humidity, and pressure. If trapped inside a sealed box:
- **Temperature reads 2-5°C high** due to ESP32 + battery + amp heat
- **Humidity reads wrong** because the sensor can't exchange air
- **Demo FAILS** when climate readings look wrong to judges

**Rule:** Climate face MUST have at least 8 ventilation slits spanning 60%+ of the panel width. The BME280 MUST be positioned within 10mm of the inner panel surface, centered on the slits.

**Cardboard fix:** Cut slits before applying white folder skin. Leave slits open (don't cover with folder stock). The slits should be 2mm × 20mm, 4mm apart, across the middle of the face.

### C2: MAX98357A Thermal Management

The MAX98357A runs warm (~50-60°C at 5V during sustained playback). Cardboard is a poor heat conductor.

**Rule:** Keep the MAX98357A physically separated from the speaker magnet. In the cardboard build, mount the amp on the inside of the speak face (near the ventilation slits), and the speaker directly behind the circle cutout. The amp should be at least 5mm from the speaker magnet.

**Cardboard fix:** Cut 4 ventilation slits below the speaker cutout on the speak face. The amp sits above these slits. Do NOT fully enclose the amp in a pocket.

### C3: ESP32-CAM WiFi Antenna

The ESP32-CAM has an onboard PCB WiFi antenna. Thick cardboard (3mm) over the antenna reduces WiFi range significantly.

**Rule:** The wall between the WiFi antenna and the outside world MUST be <1.5mm thick.

**Cardboard fix:** In the camera housing area, cut away the cardboard over the antenna zone (~10mm × 20mm rectangle on the board) and cover it with a single layer of white folder stock (~0.3mm). This gives ~0.3mm wall thickness over the antenna — well under the 1.5mm limit.

### C4: PIR Fresnel Lens Protrusion

The HC-SR501 has a Fresnel lens dome that MUST protrude through the housing wall to detect motion properly.

**Rule:** The dome (15mm diameter, ~8mm height) must extend at least 2mm past the outer surface. It cannot be recessed behind cardboard.

**Cardboard fix:** Cut a 15.5mm diameter hole in the motion face. Push the PIR through from the inside so the dome protrudes. Hot glue the board on the inside to hold it in place. The dome sticks out — this is fine for demo.

### C5: LCD Window Precision

The LCD 16×2 has a visible area of 64.5mm × 13mm within an 80mm × 36mm PCB.

**Rule:** The window cutout must be at least 71mm × 27mm to show the full character area with slight margin. Too small = characters clipped. Too large = LCD falls through.

**Cardboard fix:** Cut exactly 71mm × 27mm. The LCD sits behind this window on the inside, held by double-sided tape. Apply clear tape over the window on the outside for a "glass" effect.

### C6: Speaker Cutout

The 3W 8Ω speaker is 40mm diameter. The cutout must match.

**Rule:** Cut a 40mm circle for the speaker to sit flush. The speaker should not rattle.

**Cardboard fix:** Cut 40mm circle. Apply a thin ring of hot glue around the inside edge where the speaker rim sits. This prevents rattling and creates a seal for better sound.

### C7: INMP441 Microphone Sound Path

The MEMS mic needs a clear acoustic path. Cardboard absorbs sound.

**Rule:** Pinholes must go through the cardboard AND the folder skin. 1mm diameter minimum per hole. At least 9 holes (3×3 grid) within 8mm of the mic element.

**Cardboard fix:** Use a push pin or small nail to make the holes. Make the holes from the outside in (so the clean hole faces outward). Position the INMP441 directly behind the hole cluster on the inside, with the MEMS diaphragm facing outward.

### C8: Power Path Heat

The MT3608 boost converter and TP4056 charge controller generate heat during charging.

**Rule:** Do NOT fully enclose Zone A. The bottom panel must allow some airflow, or the USB-C cable exit provides enough.

**Cardboard fix:** The bottom panel is fine as solid (it sits on the table). Heat rises through the wire chimney. Do NOT add a top panel — leave the hex prism open-topped for demo. This provides natural convection.

### C9: Wire Strain Relief

JST pigtails are 1.0mm pitch and fragile. Pulling on them during demo = broken wires.

**Rule:** Every JST pigtail must be anchored at the face exit point with hot glue. No wire should pull directly on the connector — the anchor takes the strain.

**Cardboard fix:** Hot glue a small blob around each pigtail where it exits the cardboard face. The glue grips the wire jacket and the cardboard, creating a strain relief.

### C10: Cardboard Structural Integrity

Corrugated cardboard is strong in compression but weak in tension and shear. The hex prism shape distributes loads well, but:

**Rule:** No single face should carry more than the component weight + its own weight. The bottom panel must be solid (no large cutouts except USB-C). Shelves must not be cantilevered — they need support on all sides.

**Cardboard fix:** Use the hex prism's natural rigidity. Each face supports its neighbors at 60° angles. Shelves are hex-shaped and sit on the inner lip of all 6 walls simultaneously. Add hot glue at ALL shelf-to-wall joints for rigidity.

---

## Suggestions for the Build Process

### S1: Build Order (Recommended)

1. **Cut all panels first** — dry fit before gluing anything
2. **Cut all face features** — LCD window, speaker hole, slits, pinholes
3. **Assemble hex prism** — tape the inside joints, then hot glue
4. **Install bottom panel** — hot glue to all 6 faces
5. **Install shelves** — hot glue at correct heights
6. **Mount components** — glue gun + double-sided tape
7. **Route wires** — JST pigtails from master board to each face
8. **Test everything** — power on, check each peripheral
9. **Apply white folder skin** — glue stick to all outer faces
10. **Final trim** — craft knife cleanup

### S2: Quick Test Before Final Assembly

Before applying the white folder skin:
1. Power on the ESP32 with all peripherals connected
2. Verify LCD shows `(^_^) Xentient`
3. Verify BME280 reads reasonable values (compare to room thermometer)
4. Trigger PIR — verify motion events
5. Speak near mic — verify VAD triggers
6. Send TTS — verify speaker plays
7. Ping ESP32-CAM — verify UART2 responds

If ANY peripheral fails, fix wiring before closing up the enclosure.

### S3: Debugging Access

The open-top hex prism is intentional for demo. Benefits:
- Easy access to all wiring during testing
- ESP32 USB-C accessible from the top for reflashing
- No need to disassemble to swap a wire
- Judges can see the internal layout (educational)

If you need a top panel for transport, make it a separate piece that rests on top with no glue.

### S4: Labeling Strategy

Print small labels on white paper:
- Face labels: LISTEN, SPEAK, CLIMATE, MOTION, SIGHT
- Inside labels: ZONE A (power), ZONE B (board), ZONE C (ESP32)
- Port labels on the master board: MIC, AMP, BME, PIR, CAM, LCD

Glue these on the inside of each face. Helps during assembly AND during demo if someone asks "what does this sensor do?"

### S5: Camera Housing Simplification

Instead of a complex ball-joint housing, for demo:
1. Cut a small cardboard "shelf" that angles the camera 15° upward
2. Hot glue the ESP32-CAM to this shelf
3. Mount the shelf on the inside of the sight face
4. Route the 4-wire UART cable through a small notch in the face
5. The camera has a fixed direction — acceptable for demo

Post-demo, the ball-joint articulated housing from the production design allows aiming.

### S6: Alternative Form Factors to Consider

If the hex prism proves too complex for cardboard:

| Alternative | Difficulty | Hex Identity | Notes |
|-------------|-----------|-------------|-------|
| Hex prism (recommended) | Medium | Strong | Best match to production design |
| Rectangular box | Easy | None | Fastest build, looks generic |
| Octagonal prism | Medium | Moderate | Compromise, more faces for ports |
| Flat hex panel | Easy | Strong | Wall-mount, no depth, LCD flat on surface |

The hex prism is recommended because:
- It matches the production design language
- 6 faces = 6 peripheral ports (natural mapping)
- Judges remember the hex shape — it's distinctive
- Construction is 6 flat panels + tape/glue (not hard)

### S7: Materials to Buy (Philippines)

| Item | Where | Est. Cost (PHP) |
|------|-------|------------------|
| Corrugated cardboard | Packaging reuse / National Bookstore | 0-30 |
| White folder (5-pack) | National Bookstore / SM Stationery | 50-80 |
| Glue stick (large) | National Bookstore | 30-50 |
| Mini glue gun + sticks | Shopee / CDR-King | 150-200 |
| Craft knife (X-Acto) | National Bookstore | 40-80 |
| Double-sided tape (12mm) | National Bookstore | 30-50 |
| Small zip ties (100pc) | Shopee | 50-80 |
| Clear tape | Any sari-sari store | 20-30 |
| **Total** | | **~370-600 PHP** |

Most of this you probably have at home already.

---

## Constraints for Post-Demo (Production Path)

These constraints carry forward to the PETG design. If the cardboard demo reveals issues, update these notes:

| Constraint | Cardboard Observation | Production Implication |
|-----------|----------------------|----------------------|
| BME280 placement | [fill after demo] | Confirm 15mm standoff + louvered gills design |
| Speaker thermals | [fill after demo] | Confirm thermal divider in Speak cap |
| Camera WiFi | [fill after demo] | Confirm <1.5mm antenna wall in Sight cap |
| PIR sensitivity | [fill after demo] | Confirm Fresnel dome protrusion design |
| Wire routing | [fill after demo] | Confirm wire channel dimensions in sled/socket |
| LCD visibility | [fill after demo] | Confirm bezel and window dimensions |
| Z-stack spacing | [fill after demo] | Confirm Zone A/B/C heights in NodeBase shell |

**After demo day:** Come back to this table. Fill in observations. Update the `3d/_archive/` and `3d/tutorials/` designs accordingly.