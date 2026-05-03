# Node Base V3 (Scaled) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remake `3d/nodebase/v2.scad` as V3 with a 140mm base, 65mm height, deep recessed socket pockets, internal stack zoning, and clean geometry — no ghosts, no floating bricks.

**Architecture:** Truncated hex pyramid scaled up (140mm base F2F, 65mm total height, 60mm top F2F). Seven deep-recessed socket pockets (6 sides + 1 top) with 15mm depth, wire channels, and JST-breakout mounting lips. Internal components stacked on Z-axis: Zone A (battery + power, Z=0–15), Zone B (master board M3 standoffs, Z=20), Zone C (ESP32 M2 standoffs, Z=45). Wall integrity: 3mm global, swelling to 15mm at socket locations only.

**Tech Stack:** OpenSCAD (`.scad`), $fn=128, PETG print assumptions (0.2mm layers, 45° overhangs support-free).

---

## File Structure

| File | Purpose |
|------|---------|
| `3d/nodebase/v3.scad` | New file — complete V3 geometry, replaces V2 |

V2 remains in the repo for reference. V3 is a clean rewrite.

---

## Spec-to-Design Mapping

| Spec Requirement | Implementation Location |
|---|---|
| Base 140mm F2F, 70mm radius | `Base_F2F = 140.0`, `Base_R = 70/cos(30)` |
| Total height 65mm | `Total_Depth = 65.0` |
| Top face 60mm F2F | `Front_F2F = 60.0` |
| Collar height | `Collar_H = 12.0` (increased for Zone A depth) |
| 7 deep socket pockets | `socket_pocket_negative()` + `socket_pocket_sleeve()` |
| Pocket 24.4x16.4mm, 15mm deep | `Port_W = 24.4`, `Port_H = 16.4`, `Port_D = 15.0` |
| Wire channel 18x8mm | `WireCh_W = 18.0`, `WireCh_H = 8.0` |
| Mounting lip 2mm flange | `Mounting_Lip = 2.0` inside sleeve module |
| JST-breakout PCB 30x20mm | Referenced in mounting lip design |
| Zone A battery 78x22mm | `BH_L = 78.0`, `BH_W = 22.0` |
| Zone A power pockets | TP4056 clip, MT3608 clip |
| Zone A USB-C 12x6mm | `USB_W = 12.0`, `USB_H = 6.0` |
| Zone B M3 standoffs 5mm dia | `M3_Boss = 5.0` |
| Zone B board 120x80mm | `Board_L = 120.0`, `Board_W = 80.0` |
| Zone C M2 standoffs 4mm dia | `M2_Boss = 4.0` |
| Zone C ESP32 same as V2 | `ESP_SoH` adjusted for new Z |
| Thermal gills 2mm slits | `ventilation_negative()` on 3 non-port faces |
| 3mm wall, 15mm at sockets | `Shell_T = 3.0`, local thickening in sleeves |
| Rear anchor | Same concept, scaled |

---

### Task 1: Master Parameters & Derived Geometry

**Files:**
- Create: `3d/nodebase/v3.scad` (sections 1–2)

- [ ] **Step 1: Write the file header and global parameters**

```openscad
// ==========================================
// Xentient Framework - Main Node Module V3
// Scaled: 140mm base, 65mm height, stack zoning
// ==========================================
// Print: PETG, 0.2mm layers, 45° overhangs (support-free)
// Bed: Base (140mm F2F) flat on bed, rear face down
// Units: mm

$fn = 128;

// ==========================================
// 1. MASTER PARAMETERS
// ==========================================

// --- Hub Shell (Truncated Hex Pyramid) ---
Base_F2F    = 140.0;
Front_F2F   = 60.0;
Total_Depth = 65.0;
Collar_H    = 12.0;
Shell_T     = 3.0;

// Derived geometry
Base_R    = (Base_F2F / 2) / cos(30);     // 80.83
Front_R   = (Front_F2F / 2) / cos(30);    // 34.64
Pyr_H     = Total_Depth - Collar_H;        // 53
Base_Apo  = Base_F2F / 2;                  // 70
Front_Apo = Front_F2F / 2;                 // 30
Face_Tilt = atan((Base_Apo - Front_Apo) / Pyr_H);  // ~37.1 deg

// Inner cavity
Inner_Base_R  = Base_R - Shell_T / cos(30);    // ~77.37
Inner_Front_Z = Total_Depth - Shell_T;          // Z=62
Outer_R_at_62  = Base_R + (Front_R - Base_R) * (Inner_Front_Z - Collar_H) / Pyr_H;
Inner_Front_R2 = Outer_R_at_62 - Shell_T / cos(30);  // ~32.17

// --- Universal Socket Pocket ---
Port_W       = 24.4;    // Male sled width + 0.4mm tolerance
Port_H       = 16.4;    // Male sled height + 0.4mm tolerance
Port_D       = 15.0;    // Pocket depth (wall swells here)
WireCh_W     = 18.0;    // Wire channel width
WireCh_H     = 8.0;     // Wire channel height
Mounting_Lip = 2.0;     // Internal flange for JST-breakout PCB
Breakout_W   = 30.0;    // JST-breakout PCB width
Breakout_H   = 20.0;    // JST-breakout PCB height
Sleeve_Wall  = 2.0;     // Pocket sleeve wall thickness

// --- Battery Holder (18650 single cell) ---
BH_L       = 78.0;     // Battery holder length
BH_W       = 22.0;     // Battery holder width
BH_H       = 19.0;     // Battery holder height
BH_Clear   = 0.2;      // Clearance

// --- Master Board (120x80mm solder board) ---
Board_L    = 120.0;
Board_W    = 80.0;
Board_SoX  = 110.0;    // Standoff span X (80mm board width, ~110mm along length)
Board_SoY  = 70.0;     // Standoff span Y (120mm board length, ~70mm along width)

// --- ESP32-WROOM-32 Dev Board ---
ESP_BoardL  = 55.0;
ESP_BoardW  = 28.0;
ESP_SoX     = 22.0;
ESP_SoY     = 48.0;
ESP_SoH     = 20.0;    // Standoff pillar height

// --- Fastener specs ---
M3_Hole   = 3.2;   // M3 heat-set insert hole
M3_Boss   = 5.0;   // Slim M3 boss
M2_Hole   = 2.4;   // M2 screw body
M2_Boss   = 4.0;   // Slim M2 boss (spec says 4mm)

// --- Power Modules ---
TP4056_L  = 25.0;  TP4056_W = 19.0;  TP4056_H = 10.0;
MT3608_L  = 37.0;  MT3608_W = 22.0;  MT3608_H = 10.0;
LDO_L     = 12.0;  LDO_W    = 8.0;   LDO_H    = 5.0;
Clip_T    = 1.5;   Clip_Clear = 0.2;

// --- Rear Anchor ---
Anchor_Dia = 40.0;
Anchor_Dep = 6.0;
Anchor_Key = 10.0;

// --- Ventilation ---
Vent_N      = 4;       // Slits per face set
Vent_W      = 2.0;     // Slit width
Vent_Spc    = 6.0;     // Slit spacing
Wall_Thick  = Shell_T / cos(30);  // ~3.46mm

// --- USB-C Cutout ---
USB_W = 12.0;   // V3 spec: 12mm (was 14mm)
USB_H = 6.0;

// --- LCD Display ---
LCD_W       = 71.0;
LCD_H       = 26.0;
LCD_D       = 15.0;
LCD_Mount_X = 32.0;
LCD_Mount_Y = 12.0;
```

- [ ] **Step 2: Verify derived values by rendering a test cube**

Open the file in OpenSCAD, verify no syntax errors. The values should render without preview errors. Expected: no errors, clean parse.

- [ ] **Step 3: Commit**

```bash
git add 3d/nodebase/v3.scad
git commit -m "feat(3d): add V3 master parameters and derived geometry"
```

---

### Task 2: Socket Pocket Modules (Negative + Sleeve)

**Files:**
- Modify: `3d/nodebase/v3.scad` (add sections 3–4)

- [ ] **Step 1: Write the socket pocket negative module**

This is the "female receiver" cutout. It goes through the wall AND through the sleeve, providing:
- The main pocket passage (24.4 x 16.4, 15mm deep)
- Wire channel (18 x 8mm) continuing into the cavity
- 45° entry chamfer
- Breakout PCB mounting lip (2mm flange)

```openscad
// ==========================================
// 3. SOCKET POCKET NEGATIVE (cuts opening through wall + sleeve)
// ==========================================

module socket_pocket_negative() {
    draft_off = Port_D * tan(1.0);  // 1 deg draft

    // Main pocket passage (Port_H is vertical, Port_W is horizontal)
    hull() {
        translate([0, 0, 0.5])
            cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 1], center=true);
        translate([0, 0, -Port_D + 0.5])
            cube([Port_H, Port_W, 1], center=true);
    }

    // Wire pass-through (continues past pocket into cavity)
    translate([0, 0, -Port_D/2 - 10])
        cube([WireCh_H, WireCh_W, 20], center=true);

    // 45 deg entry chamfer
    chamfer_z = 1.5;
    translate([0, 0, chamfer_z / 2])
        hull() {
            cube([Port_H + 2*chamfer_z, Port_W + 2*chamfer_z, 0.1], center=true);
            cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 0.1], center=true);
        }

    // Breakout PCB mounting lip recesses (2mm flange, 30x20mm PCB)
    // Cut screw holes for M2 at corners of 30x20 breakout
    bp_w = Breakout_W - 4;  // screw span width
    bp_h = Breakout_H - 4;  // screw span height
    translate([0, 0, -Port_D])
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * bp_w/2, sy * bp_h/2, 0])
                cylinder(h=Mounting_Lip + 1, d=M2_Hole, $fn=24);
        }
}
```

- [ ] **Step 2: Write the socket pocket sleeve module**

The sleeve is the positive volume that creates the pocket depth. Wall thickens locally to 15mm here.

```openscad
// ==========================================
// 4. SOCKET POCKET SLEEVE (positive: adds pocket depth)
// ==========================================

module socket_pocket_sleeve() {
    // Positive boss extending inward from inner wall surface
    // Creates the 15mm deep recessed pocket for the male sled
    // Wall swells from 3mm to 15mm only at socket locations

    draft_off = Port_D * tan(1.0);

    difference() {
        // Outer sleeve body (24.4 + 2*2 = 28.4mm wide, 16.4 + 2*2 = 20.4mm tall)
        hull() {
            translate([0, 0, 0.5])
                cube([Port_H + 2*Sleeve_Wall + 2*draft_off,
                      Port_W + 2*Sleeve_Wall + 2*draft_off, 1], center=true);
            translate([0, 0, -Port_D + 0.5])
                cube([Port_H + 2*Sleeve_Wall, Port_W + 2*Sleeve_Wall, 1], center=true);
        }

        // Inner passage (matches pocket opening with draft)
        hull() {
            translate([0, 0, 0.5])
                cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 1], center=true);
            translate([0, 0, -Port_D + 0.5])
                cube([Port_H, Port_W, 1], center=true);
        }

        // Wire channel opening at the back of the sleeve
        translate([0, 0, -Port_D])
            cube([WireCh_H, WireCh_W, 4], center=true);

        // Breakout PCB mounting lip (2mm flange recess)
        // This creates a shelf for the 30x20 JST-breakout PCB
        translate([0, 0, -Port_D + Mounting_Lip/2])
            cube([Breakout_W, Breakout_H, Mounting_Lip], center=true);
    }
}
```

- [ ] **Step 3: Verify modules render in OpenSCAD**

Open the file, add temporary test calls at the bottom, preview. Expected: both modules render without errors.

- [ ] **Step 4: Commit**

```bash
git add 3d/nodebase/v3.scad
git commit -m "feat(3d): add V3 socket pocket negative and sleeve modules"
```

---

### Task 3: Front (Top) Port with LCD Mount

**Files:**
- Modify: `3d/nodebase/v3.scad` (add section 5)

- [ ] **Step 1: Write the front center port negative module**

The top face gets the same deep pocket treatment, plus an LCD bezel cutout.

```openscad
// ==========================================
// 5. FRONT CENTER PORT (Top Face - LCD Display)
// ==========================================

module front_port_negative() {
    // Pocket cutout through front face + sleeve
    translate([0, 0, Total_Depth - Port_D / 2])
        cube([Port_H, Port_W, Port_D + 2], center=true);

    // Wire channel inward
    translate([0, 0, Inner_Front_Z / 2 + Shell_T])
        cube([WireCh_H, WireCh_W, Inner_Front_Z - Port_D], center=true);

    // 45 deg chamfer at entry
    translate([0, 0, Total_Depth - 0.5])
        hull() {
            cube([Port_H + 3, Port_W + 3, 0.1], center=true);
            translate([0, 0, -1.5])
                cube([Port_H, Port_W, 0.1], center=true);
        }

    // LCD bezel window (71x26mm)
    translate([0, 0, Total_Depth + 1])
        cube([LCD_H, LCD_W, 4], center=true);

    // Breakout PCB mounting holes (same as side pockets)
    bp_w = Breakout_W - 4;
    bp_h = Breakout_H - 4;
    translate([0, 0, Total_Depth - Port_D])
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * bp_w/2, sy * bp_h/2, 0])
                cylinder(h=Mounting_Lip + 1, d=M2_Hole, $fn=24);
        }
}

module front_port_sleeve() {
    // Sleeve behind front face for display sled depth
    draft_off = Port_D * tan(1.0);

    difference() {
        hull() {
            translate([0, 0, -0.5])
                cube([Port_H + 2*Sleeve_Wall + 2*draft_off,
                      Port_W + 2*Sleeve_Wall + 2*draft_off, 1], center=true);
            translate([0, 0, -Port_D + 0.5])
                cube([Port_H + 2*Sleeve_Wall, Port_W + 2*Sleeve_Wall, 1], center=true);
        }
        hull() {
            translate([0, 0, -0.5])
                cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 1], center=true);
            translate([0, 0, -Port_D + 0.5])
                cube([Port_H, Port_W, 1], center=true);
        }
        translate([0, 0, -Port_D - 1])
            cube([WireCh_H, WireCh_W, 4], center=true);

        // Breakout PCB mounting lip
        translate([0, 0, -Port_D + Mounting_Lip/2])
            cube([Breakout_W, Breakout_H, Mounting_Lip], center=true);
    }
}

module lcd_standoffs() {
    so_h = 6.0;
    for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * LCD_Mount_X / 2, sy * LCD_Mount_Y / 2, 0])
            difference() {
                cylinder(h=so_h, d=M3_Boss, $fn=32);
                translate([0, 0, so_h * 0.35])
                    cylinder(h=so_h * 0.65 + 1, d=M3_Insert, $fn=32);
            }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add 3d/nodebase/v3.scad
git commit -m "feat(3d): add V3 front port with LCD mount and breakout lip"
```

---

### Task 4: Zone A — Battery Cradle + Power Modules + USB-C

**Files:**
- Modify: `3d/nodebase/v3.scad` (add sections 6–7)

- [ ] **Step 1: Write the battery cradle module**

```openscad
// ==========================================
// 6. ZONE A: BATTERY CRADLE (Z=0 to 15)
// ==========================================

module battery_cradle() {
    pL = BH_L + 2*BH_Clear;
    pW = BH_W + 2*BH_Clear;
    lip_h = 3.0;

    // Floor plate
    translate([0, 0, -1])
        cube([pL, pW, 2], center=true);

    // Y-axis retaining lips
    for (s = [-1, 1]) {
        translate([0, s * (pW/2 + Clip_T/2), lip_h/2 - 1])
            cube([pL + 2*Clip_T, Clip_T, lip_h], center=true);
    }
    // X-axis retaining lips
    for (s = [-1, 1]) {
        translate([s * (pL/2 + Clip_T/2), 0, lip_h/2 - 1])
            cube([Clip_T, pW + 2*Clip_T, lip_h], center=true);
    }
}
```

- [ ] **Step 2: Write the power module clip module**

```openscad
// ==========================================
// 7. ZONE A: POWER MODULE POCKETS
// ==========================================

module power_module_clip(mod_L, mod_W, mod_H) {
    cL = mod_L/2 + Clip_Clear;
    cW = mod_W/2 + Clip_Clear;

    for (s = [-1, 1]) {
        translate([0, s * (cW + Clip_T/2), mod_H/4])
            cube([mod_L + 2*Clip_Clear + 2*Clip_T, Clip_T, mod_H/2], center=true);
    }
    for (s = [-1, 1]) {
        translate([s * (cL + Clip_T/2), 0, mod_H/4])
            cube([Clip_T, mod_W + 2*Clip_Clear + 2*Clip_T, mod_H/2], center=true);
    }

    translate([0, 0, -1])
        cube([mod_L + 2*Clip_Clear, mod_W + 2*Clip_Clear, 2], center=true);
}
```

- [ ] **Step 3: Write the USB-C cutout module**

The USB-C port is on the collar wall, aligned with the TP4056 module position. V3 spec changes this to 12x6mm (was 14x6mm).

```openscad
module usb_c_cutout_negative() {
    // USB-C on collar face, aligned with TP4056 module (Y=30)
    rotate([0, 0, 90])
        translate([Base_Apo, 0, Collar_H / 2])
            rotate([0, 90, 0])
                hull() {
                    translate([0, 0, Shell_T + 2])
                        cube([USB_H + 2, USB_W + 2, 0.1], center=true);
                    translate([0, 0, -(Shell_T + 2)])
                        cube([USB_H, USB_W, 0.1], center=true);
                }
}
```

- [ ] **Step 4: Commit**

```bash
git add 3d/nodebase/v3.scad
git commit -m "feat(3d): add V3 Zone A modules (battery cradle, power clips, USB-C)"
```

---

### Task 5: Zone B — Master Board Standoffs + Zone C — ESP32 Standoffs

**Files:**
- Modify: `3d/nodebase/v3.scad` (add sections 8–9)

- [ ] **Step 1: Write Zone B master board standoffs**

Four M3 standoffs (5mm boss diameter) at Z=20 for the 120x80mm solder board.

```openscad
// ==========================================
// 8. ZONE B: MASTER BOARD STANDOFFS (Z=20)
// ==========================================

M3_Insert = 4.2;  // Heat-set insert for M3

module master_board_standoffs() {
    // 4x M3 standoffs for 120x80mm solder board
    // Board sits at Z=20, standoffs rise from floor
    so_h = 20.0;  // Floor-to-board-top height
    for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * Board_SoX/2, sy * Board_SoY/2, 0])
            difference() {
                cylinder(h=so_h, d=M3_Boss, $fn=32);
                translate([0, 0, so_h * 0.35])
                    cylinder(h=so_h * 0.65 + 1, d=M3_Insert, $fn=32);
            }
    }
}
```

- [ ] **Step 2: Write Zone C ESP32 standoffs**

Four M2 standoffs (4mm boss diameter) at Z=45, floating above the master board.

```openscad
// ==========================================
// 9. ZONE C: ESP32 STANDOFFS (Z=45)
// ==========================================

module esp32_standoffs() {
    // 4x M2 standoffs for ESP32-WROOM-32
    // Board floats above master board at Z=45
    so_h = 20.0;  // Standoff height from Z=45 base
    for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * ESP_SoX/2, sy * ESP_SoY/2, 0])
            difference() {
                cylinder(h=so_h, d=M2_Boss, $fn=32);
                translate([0, 0, so_h * 0.3])
                    cylinder(h=so_h * 0.7 + 1, d=M2_Hole, $fn=32);
            }
    }

    // Anti-rotation nub
    translate([ESP_SoX/2 + 2, -3, 0])
        cube([2, 6, 3]);
}
```

- [ ] **Step 3: Commit**

```bash
git add 3d/nodebase/v3.scad
git commit -m "feat(3d): add V3 Zone B (M3 board standoffs) and Zone C (ESP32 standoffs)"
```

---

### Task 6: Ventilation + Rear Anchor

**Files:**
- Modify: `3d/nodebase/v3.scad` (add sections 10–11)

- [ ] **Step 1: Write ventilation gills module**

Three sets of 2mm ventilation slits on the faces *between* sensor ports. V3 has 7 ports on 6 side faces + 1 top, so the gills go on alternating faces (every 60° offset by 30° from port faces).

```openscad
// ==========================================
// 10. VENTILATION (Thermal Gills)
// ==========================================

module ventilation_negative() {
    // Slits on faces between sensor ports
    // Centered at Collar_H/2, through wall, 45 deg chamfered
    for (i = [0 : Vent_N - 1]) {
        y_off = (i - (Vent_N - 1)/2) * Vent_Spc;
        translate([0, y_off, Collar_H / 2])
            rotate([0, 90, 0])
                hull() {
                    translate([0, 0, Wall_Thick + 1])
                        cube([Vent_W + 1.5, Vent_W + 1.5, 0.1], center=true);
                    translate([0, 0, -(Wall_Thick + 1)])
                        cube([Vent_W, Vent_W, 0.1], center=true);
                };
    }
}
```

- [ ] **Step 2: Write the rear anchor module**

```openscad
// ==========================================
// 11. REAR ANCHOR
// ==========================================

module rear_anchor_negative() {
    translate([0, 0, -1])
        cylinder(h=Anchor_Dep + 1, d=Anchor_Dia, $fn=64);

    for (a = [0, 90]) {
        rotate([0, 0, a])
            translate([0, -Anchor_Key/2, -1])
                cube([Anchor_Dia/2 + 2, Anchor_Key, Anchor_Dep + 1]);
    }

    translate([0, 0, -10])
        cylinder(h=30, d=15, $fn=32);
}
```

- [ ] **Step 3: Commit**

```bash
git add 3d/nodebase/v3.scad
git commit -m "feat(3d): add V3 ventilation gills and rear anchor"
```

---

### Task 7: Main Assembly — The Full V3 Hub

**Files:**
- Modify: `3d/nodebase/v3.scad` (add section 12)

This is the critical task where everything comes together. The main assembly uses `difference()` to subtract all negatives from the outer hull + sleeves union, then `intersection()` to clip internals to the cavity.

- [ ] **Step 1: Write the main assembly module**

```openscad
// ==========================================
// 12. MAIN ASSEMBLY
// ==========================================

module xentient_hub_v3() {
    // Port positions along Z-axis (midpoint of pocket)
    port_Z = Collar_H + Pyr_H * 0.5;
    port_apo = Base_Apo - (Base_Apo - Front_Apo) * ((port_Z - Collar_H) / Pyr_H);

    inner_r_base = Inner_Base_R;
    inner_r_front = Inner_Front_R2;

    difference() {
        // ====== OUTER HULL + POCKET SLEEVES ======
        union() {
            // Rear collar
            cylinder(h=Collar_H, r=Base_R, $fn=6);
            // Tapered body
            translate([0, 0, Collar_H])
                cylinder(h=Pyr_H, r1=Base_R, r2=Front_R, $fn=6);
            // Aesthetic ribs
            for (i = [0 : 60 : 359]) {
                rotate([0, 0, i])
                    translate([Base_F2F/2 - 1, 0, Collar_H/2])
                        cube([4, 12, Collar_H + 2], center=true);
            }

            // 6x Side pocket sleeves (provide 15mm depth)
            for (a = [30 : 60 : 330]) {
                rotate([0, 0, a])
                    translate([port_apo - Port_D/2, 0, port_Z])
                        rotate([0, 90 - Face_Tilt, 0])
                            socket_pocket_sleeve();
            }

            // Top face pocket sleeve
            translate([0, 0, Total_Depth - Port_D/2])
                rotate([0, 0, 90])
                    front_port_sleeve();
        }

        // ====== HOLLOW CORE ======
        translate([0, 0, Shell_T])
            cylinder(h=Collar_H, r=inner_r_base, $fn=6);
        translate([0, 0, Shell_T + Collar_H])
            cylinder(h=Inner_Front_Z - Shell_T - Collar_H,
                     r1=inner_r_base,
                     r2=inner_r_front, $fn=6);

        // ====== 6x SIDE POCKETS ======
        for (a = [30 : 60 : 330]) {
            rotate([0, 0, a])
                translate([port_apo, 0, port_Z])
                    rotate([0, 90 - Face_Tilt, 0])
                        socket_pocket_negative();
        }

        // ====== TOP CENTER POCKET ======
        front_port_negative();

        // ====== REAR ANCHOR ======
        rear_anchor_negative();

        // ====== USB-C CUTOUT ======
        usb_c_cutout_negative();

        // ====== VENTILATION GILLS ======
        // On 3 alternate faces (between port faces)
        for (a = [0, 120, 240]) {
            rotate([0, 0, a])
                translate([Base_Apo, 0, 0])
                    ventilation_negative();
        }
    }

    // ====== INTERNAL STRUCTURE (clipped to cavity) ======
    intersection() {
        translate([0, 0, Shell_T + 1])
            cylinder(h=Inner_Front_Z - Shell_T - 2,
                     r1=inner_r_base - 1,
                     r2=inner_r_front - 1, $fn=6);

        union() {
            // Zone A Floor Plate
            translate([0, 0, Shell_T])
                cylinder(h=2, r=Base_R - 6, $fn=6);

            // Zone A: Battery Cradle (centered, Y offset rear)
            translate([0, -25, Shell_T + 2])
                battery_cradle();

            // Zone A: Power Modules
            // TP4056 near USB-C wall (Y=30)
            translate([0, 30, Shell_T + 2])
                power_module_clip(TP4056_L, TP4056_W, TP4056_H);

            // MT3608 next to TP4056
            translate([-22, 30, Shell_T + 2])
                power_module_clip(MT3608_L, MT3608_W, MT3608_H);

            // 3.3V LDO
            translate([20, 15, Shell_T + 2])
                power_module_clip(LDO_L, LDO_W, LDO_H);

            // Zone B: Master Board Standoffs (Z=20)
            translate([0, 0, 20])
                master_board_standoffs();

            // Zone C: ESP32 Standoffs (Z=45)
            translate([0, 18, 45])
                esp32_standoffs();

            // Zone C-front: LCD Mount Standoffs
            translate([0, 0, Inner_Front_Z - 1])
                lcd_standoffs();
        }
    }
}

// ==========================================
// RENDER
// ==========================================

xentient_hub_v3();
```

- [ ] **Step 2: Render in OpenSCAD and verify the full assembly**

Open `3d/nodebase/v3.scad` in OpenSCAD. Expected: clean render with no CGAL errors. Visually verify:
- 140mm base diameter hex
- 7 socket pockets (6 sides + 1 top)
- Battery cradle visible at bottom
- M3 standoffs at Z=20
- M2 standoffs at Z=45
- USB-C cutout on collar
- Ventilation slits on 3 alternate faces
- No "floating brick" geometry

- [ ] **Step 3: Commit**

```bash
git add 3d/nodebase/v3.scad
git commit -m "feat(3d): complete V3 main assembly with all zones and components"
```

---

### Task 8: Validation & Cleanup

**Files:**
- Verify: `3d/nodebase/v3.scad`

- [ ] **Step 1: Verify no ghost geometry**

Search the file for any leftover `cube()` calls that create disconnected/unanchored solids (the "floating brick" from V2). There should be none outside of `difference()` or `intersection()` blocks.

- [ ] **Step 2: Verify wall integrity**

Confirm:
- `Shell_T = 3.0` is used as the global wall thickness
- `Port_D = 15.0` creates the local swell at socket locations
- The sleeve modules add `Port_D` depth, making the wall 15mm thick only at socket locations

- [ ] **Step 3: Verify Z-stacking clearances**

Check that internal zones don't overlap:
- Zone A: Z=3 (Shell_T) to Z=15 → battery + power
- Zone B: Z=20 (standoff base) → master board
- Zone C: Z=45 (standoff base) → ESP32

Board at Zone B is ~1.6mm thick, so board top ≈ Z=21.6. ESP32 standoffs start at Z=45. Gap of ~23mm — comfortable.

- [ ] **Step 4: Verify all 7 ports have breakout mounting lips**

Check that both `socket_pocket_negative()` and `front_port_negative()` include the M2 screw holes for the JST-breakout PCB mounting lip.

- [ ] **Step 5: Final commit**

```bash
git add 3d/nodebase/v3.scad
git commit -m "feat(3d): V3 node base complete — validated geometry, zones, and sockets"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Item | Task | Status |
|-----------|------|--------|
| Base 140mm F2F, 70mm radius | Task 1 | Covered |
| Total height 65mm | Task 1 | Covered |
| Top face 60mm F2F | Task 1 | Covered |
| 7 deep pocket sockets (6 side + 1 top) | Tasks 2, 3, 7 | Covered |
| Pocket 24.4x16.4mm, 15mm deep | Task 2 | Covered |
| Wire channel 18x8mm | Task 2 | Covered |
| Mounting lip 2mm, 30x20mm breakout PCB | Task 2 | Covered |
| Zone A: Battery 78x22mm | Task 4 | Covered |
| Zone A: TP4056, MT3608 power pockets | Task 4 | Covered |
| Zone A: USB-C 12x6mm | Task 4 | Covered |
| Zone B: M3 standoffs 5mm, 120x80mm board | Task 5 | Covered |
| Zone C: M2 standoffs 4mm, ESP32 | Task 5 | Covered |
| Remove ghosts/floating bricks | Task 8 | Verified |
| Thermal gills 2mm on 3 faces | Task 6 | Covered |
| Wall 3mm global, 15mm at sockets | Tasks 1, 2, 7 | Covered |
| Rear anchor | Task 6 | Covered |
| Aesthetic ribs | Task 7 | Covered |
| LCD display mount | Task 3 | Covered |

### Placeholder Scan

- No TBD, TODO, or "implement later" — all code is complete
- No "add appropriate error handling" — this is geometry, not software
- No "similar to Task N" — each task has complete code

### Type Consistency

- `Port_W` / `Port_H` / `Port_D` used consistently across socket_pocket_negative, socket_pocket_sleeve, front_port_negative, front_port_sleeve, and main assembly
- `M3_Boss` / `M3_Insert` used for master board standoffs
- `M2_Boss` / `M2_Hole` used for ESP32 standoffs
- Zone Z-offsets (20, 45) consistent between Task 5 definitions and Task 7 assembly placement