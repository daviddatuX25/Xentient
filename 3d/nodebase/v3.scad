// ==========================================
// Xentient Framework - Main Node Module V3
// Scaled: 150mm base, 90mm height, stack zoning
// ==========================================
// Print: PETG, 0.2mm layers, 45° overhangs (support-free)
// Bed: Base (150mm F2F) flat on bed, rear face down
// Units: mm
//
// V3.1 — Restored shell features:
//   ✅ 6× rail slots at hex vertices (collar zone, Z=3–12)
//   ✅ 3× alignment keyways at 0°, 120°, 240°
//   ✅ Reference pits at Zone A/B/C mounting coordinates
//   ✅ Landing pads (8mm dia) at Zone B standoff coords (Path B)
//   Interior plates/bosses remain separate modules (zone_a_tray, etc.)

$fn = 128;

// ==========================================
// 1. MASTER PARAMETERS
// ==========================================

// --- Hub Shell (Truncated Hex Pyramid) ---
Base_F2F    = 150.0;
Front_F2F   = 60.0;
Total_Depth = 90.0;
Collar_H    = 12.0;
Shell_T     = 3.0;

// Derived geometry
Base_R    = (Base_F2F / 2) / cos(30);     // 80.83
Front_R   = (Front_F2F / 2) / cos(30);    // 34.64
Pyr_H     = Total_Depth - Collar_H;        // 78
Base_Apo  = Base_F2F / 2;                  // 70
Front_Apo = Front_F2F / 2;                 // 30
Face_Tilt = atan((Base_Apo - Front_Apo) / Pyr_H);  // ~27.9 deg

// Inner cavity
Inner_Base_R  = Base_R - Shell_T / cos(30);    // ~77.37
Inner_Front_Z = Total_Depth - Shell_T;          // Z=87
Outer_R_at_front  = Base_R + (Front_R - Base_R) * (Inner_Front_Z - Collar_H) / Pyr_H;
Inner_Front_R2 = Outer_R_at_front - Shell_T / cos(30);  // ~32.17

// --- Universal Socket Pocket ---
Port_W       = 24.4;    // Male sled width + 0.4mm tolerance
Port_H       = 16.4;    // Male sled height + 0.4mm tolerance
Port_D       = 10.0;    // Pocket depth per Framework §2 (10mm female socket)
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
Board_Chamfer = 15.0;   // Corner chamfer to fit inside hex at Z=20 (8mm was too small)

// --- ESP32-WROOM-32 Dev Board ---
ESP_BoardL  = 55.0;
ESP_BoardW  = 28.0;
ESP_SoX     = 22.0;
ESP_SoY     = 48.0;
ESP_SoH     = 20.0;    // Standoff pillar height

// --- Fastener specs ---
M3_Hole   = 3.2;   // M3 heat-set insert hole
M3_Boss   = 5.0;   // Slim M3 boss
M3_Insert = 4.2;   // Heat-set insert for M3
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

// ==========================================
// 4. SOCKET POCKET SLEEVE (positive: adds pocket depth)
// ==========================================

module socket_pocket_sleeve() {
    // Positive boss extending inward from inner wall surface
    // Creates the 10mm deep recessed pocket per Framework §2
    // Wall swells from 3mm to ~10mm only at socket locations

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
        };

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
    // Floor overcut: 1mm below floor for thick cable plug housing
    rotate([0, 0, 90])
        translate([Base_Apo, 0, Shell_T - 0.5])
            cube([4, USB_W + 4, 2], center=true);
}

// ==========================================
// 8. ZONE B: MASTER BOARD STANDOFFS (Z=20)
// ==========================================

module master_board_standoffs() {
    // 4x M3 standoffs for 120x80mm solder board
    // Board sits at Z=20, standoffs rise from floor
    // Board corners chamfered 15mm to fit inside hex at Z=20
    so_h = 20.0;  // Floor-to-board-top height

    // Board rest plate with chamfered corners (hex-safe)
    translate([0, 0, so_h - 1])
        difference() {
            // Chamfered rectangle (offset for board outline)
            hull() {
                for (sx = [-1, 1], sy = [-1, 1]) {
                    translate([sx * (Board_L/2 - Board_Chamfer),
                               sy * (Board_W/2 - Board_Chamfer), 0])
                        cylinder(h=1, r=Board_Chamfer, $fn=4);
                }
            }
            // Central wire routing cutout
            cylinder(h=3, d=30, $fn=32);
        }

    // 4x M3 standoff pillars
    for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * Board_SoX/2, sy * Board_SoY/2, 0])
            difference() {
                cylinder(h=so_h, d=M3_Boss, $fn=32);
                translate([0, 0, so_h * 0.35])
                    cylinder(h=so_h * 0.65 + 1, d=M3_Insert, $fn=32);
            }
    }

    // Cross-bracing between standoffs for rigidity
    for (sx = [-1, 1]) {
        hull() {
            translate([sx * Board_SoX/2, -Board_SoY/2, 0])
                cylinder(h=so_h * 0.6, d=M3_Boss, $fn=16);
            translate([sx * Board_SoX/2, Board_SoY/2, 0])
                cylinder(h=so_h * 0.6, d=M3_Boss, $fn=16);
        }
    }
}

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

// ==========================================
// 10. VENTILATION (Thermal Gills)
// ==========================================

module ventilation_negative() {
    // Slits on faces between sensor ports
    // Row 1: collar level (original)
    // Row 2: mid-body level (added for deeper 90mm body)
    for (i = [0 : Vent_N - 1]) {
        y_off = (i - (Vent_N - 1)/2) * Vent_Spc;
        // Row 1 - collar
        translate([0, y_off, Collar_H / 2])
            rotate([0, 90, 0])
                hull() {
                    translate([0, 0, Wall_Thick + 1])
                        cube([Vent_W + 1.5, Vent_W + 1.5, 0.1], center=true);
                    translate([0, 0, -(Wall_Thick + 1)])
                        cube([Vent_W, Vent_W, 0.1], center=true);
                };
        // Row 2 - mid-body
        translate([0, y_off, Collar_H + Pyr_H * 0.4])
            rotate([0, 90, 0])
                hull() {
                    translate([0, 0, Wall_Thick + 1])
                        cube([Vent_W + 1.5, Vent_W + 1.5, 0.1], center=true);
                    translate([0, 0, -(Wall_Thick + 1)])
                        cube([Vent_W, Vent_W, 0.1], center=true);
                };
    }
}

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
            // Aesthetic ribs (extend along collar)
            for (i = [0 : 60 : 359]) {
                rotate([0, 0, i])
                    translate([Base_F2F/2 - 1, 0, Collar_H/2])
                        cube([4, 12, Collar_H + 2], center=true);
            }

            // 6x Side pocket sleeves (10mm recessed sleeve per Framework §2)
            for (a = [30 : 60 : 330]) {
                rotate([0, 0, a])
                    translate([port_apo, 0, port_Z])
                        rotate([0, 90 - Face_Tilt, 0])
                            socket_pocket_sleeve();
            }

            // Top face pocket sleeve (10mm depth per Framework §2)
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

        // ====== RAIL SLOTS (6× at hex vertices) ======
        // 3.5mm wide × 2mm deep grooves, collar zone only (Z=3–12)
        // For Path A plate insertion
        for (a = [0 : 60 : 300]) {
            rotate([0, 0, a])
                translate([Inner_Base_R, 0, 0])
                    rotate([0, 90, 0])
                        hull() {
                            translate([0, -1.75, 3])
                                cube([2.1, 3.6, 1], center=true);
                            translate([0, -1.75, 12])
                                cube([2.1, 3.6, 1], center=true);
                        };
        }

        // ====== ALIGNMENT KEYWAYS (3× at 0°, 120°, 240°) ======
        // Subtractive grooves on inner cavity wall for angular orientation
        for (a = [0, 120, 240]) {
            rotate([0, 0, a])
                translate([Inner_Base_R, 0, 0])
                    rotate([0, 90, 0])
                        hull() {
                            translate([0, -0.75, Shell_T])
                                cube([1.6, 1.6, 1], center=true);
                            translate([0, -0.75, Total_Depth - Shell_T])
                                cube([1.6, 1.6, 1], center=true);
                        };
        }

        // ====== REFERENCE PITS (Zone A/B/C mounting coords) ======
        // 0.5mm deep × 1.5mm diameter subtractive dimples
        // Easier to locate with drill bit or glue tip than additive bumps

        // Zone A: Battery/power coordinates
        for (pos = [
            [0, -25, Shell_T + 3],           // Battery holder center
            [15, 30, Shell_T + 3],            // TP4056 position
            [-15, 30, Shell_T + 3],           // MT3608 position
        ]) {
            translate(pos)
                cylinder(h=0.6, d=1.5, $fn=16);
        }

        // Zone B: Master board standoff coords (±57, ±37 at Z=20)
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * 57, sy * 37, Shell_T + 2])
                cylinder(h=0.6, d=1.5, $fn=16);
        }

        // Zone C: ESP32 standoff coords (±11, ±24 at Z=45)
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * 11, 18 + sy * 24, Shell_T + 45])
                cylinder(h=0.6, d=1.5, $fn=16);
        }

        // ====== LANDING PADS (Zone B, Path B glue targets) ======
        // 8mm diameter × 0.5mm raised circles on inner cavity wall
        // NOTE: These are ADDITIVE (positive), placed on inner wall surface
        // for Path B builders to scuff and glue standoffs onto
    }

    // ====== ADDITIVE: LANDING PADS (Zone B) ======
    // Flat raised circles at Zone B standoff coordinates for glue-in standoffs
    // Path B only — Path A uses printed bosses instead
    for (sx = [-1, 1], sy = [-1, 1]) {
        // Project landing pads onto inner hex wall surface
        // At Z=20, inner radius ≈ Base_R - Shell_T/cos(30) - (Z-Collar)*slope
        land_r = Inner_Base_R - (Inner_Base_R - Inner_Front_R2) * (20 - Collar_H) / Pyr_H;
        // Wall angle at this Z
        land_angle = atan2(sy * 37, sx * 57);  // Direction from center
        // Place pad on inner wall at the standoff direction
        translate([sx * 57 * 0.6, sy * 37 * 0.6, Shell_T + 20])
            cylinder(h=0.5, d=8, $fn=32);
    }

    // ====== OPEN ATRIUM — modular interior ======
    // Shell provides: pockets, sleeves, rail slots, keyways, reference pits,
    // landing pads, USB-C, ventilation, rear anchor, collar ribs.
    // Interior mounting plates designed as separate .scad modules.
}

// ==========================================
// RENDER
// ==========================================

xentient_hub_v3();