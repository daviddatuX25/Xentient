// ==========================================
// Xentient Framework - Main Node Module V2.3
// Audit 3 fixes: removed wire-channel brick,
//   ESP32 moved to Y=18 with 20mm standoffs
//   (clears 18650 at Z24), USB-C chamfer widened
// ==========================================
// Print: PETG, 0.2mm layers, 45° overhangs (support-free)
// Bed: Base (90mm F2F) flat on bed, front face up
// Units: mm

$fn = 128;

// ==========================================
// 1. MASTER PARAMETERS
// ==========================================

// --- Hub Shell (Truncated Hex Pyramid) ---
Base_F2F    = 90.0;
Front_F2F   = 50.0;
Total_Depth = 45.0;
Collar_H    = 10.0;
Shell_T     = 3.0;

// Derived geometry
Base_R    = (Base_F2F / 2) / cos(30);     // 51.96
Front_R   = (Front_F2F / 2) / cos(30);   // 28.87
Pyr_H     = Total_Depth - Collar_H;       // 35
Base_Apo  = Base_F2F / 2;                 // 45
Front_Apo = Front_F2F / 2;               // 25
Face_Tilt = atan((Base_Apo - Front_Apo) / Pyr_H);  // ~29.7 deg

// Inner cavity
Inner_Base_R  = Base_R  - Shell_T / cos(30);   // ~48.50
Inner_Front_Z = Total_Depth - Shell_T;         // Z=42 (leaves front shell)
Outer_R_at_42  = Base_R + (Front_R - Base_R) * (Inner_Front_Z - Collar_H) / Pyr_H;
Inner_Front_R2 = Outer_R_at_42 - Shell_T / cos(30);  // ~27.38

// --- Universal Port Socket ---
Port_W      = 24.0;
Port_H      = 16.0;
Port_D      = 10.0;
Draft_Deg   = 1.0;
WireCh_W    = 18.0;
WireCh_H    = 8.0;
Sleeve_Wall = 2.0;   // Socket sleeve wall thickness (printable)

// --- Battery Holder (single 18650 plastic clip-in) ---
BH_L       = 53.0;
BH_W       = 25.0;
BH_H       = 19.0;
BH_Clear   = 0.2;

// --- ESP32-WROOM-32 Dev Board (55x28mm, transverse mount) ---
ESP_BoardL  = 55.0;    // Long axis (mounted along Y / across hub face)
ESP_BoardW  = 28.0;    // Short axis (along X / hub depth)
ESP_SoX     = 22.0;    // Standoff full-span X (28mm board width, ~22mm hole spacing)
ESP_SoY     = 48.0;    // Standoff full-span Y (55mm board length, ~48mm hole spacing)
ESP_SoH     = 20.0;    // Standoff pillar height (board clears 18650 at Z24)
M2_Hole     = 2.4;     // M2 screw body (not insert — direct screw into boss)
M2_Boss     = 4.5;     // Boss OD (slim, proportionate for M2)

// --- Power Modules ---
TP4056_L  = 25.0;  TP4056_W = 19.0;  TP4056_H = 10.0;
MT3608_L  = 37.0;  MT3608_W = 22.0;  MT3608_H = 10.0;
LDO_L     = 12.0;  LDO_W    = 8.0;   LDO_H    = 5.0;
Clip_T    = 1.5;   Clip_Clear = 0.2;

// --- Rear Anchor ---
Anchor_Dia = 40.0;
Anchor_Dep = 6.0;
Anchor_Key = 10.0;

// --- Hardware ---
M3_Insert = 4.2;
M3_Boss   = 7.0;

// --- Ventilation ---
Vent_N      = 4;
Vent_W      = 2.0;
Vent_Spc    = 6.0;
Wall_Thick  = Shell_T / cos(30);  // ~3.46mm

// --- USB-C Cutout ---
USB_W = 14.0;
USB_H = 6.0;

// --- LCD Display ---
LCD_W       = 71.0;
LCD_H       = 26.0;
LCD_D       = 15.0;
LCD_Mount_X = 32.0;
LCD_Mount_Y = 12.0;

// ==========================================
// 2. SIDE PORT SOCKET (negative: cuts the opening)
// ==========================================

module port_socket_negative() {
    // Cuts the 24x16mm opening through the wall AND through the sleeve
    // The sleeve (positive) provides the 10mm depth behind this opening

    draft_off = Port_D * tan(Draft_Deg);

    // Full-depth slot (through wall + through 10mm sleeve)
    // Extends from face surface inward by Port_D (10mm) + wall thickness
    hull() {
        translate([0, 0, 0.5])
            cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 1], center=true);
        translate([0, 0, -Port_D + 0.5])
            cube([Port_H, Port_W, 1], center=true);
    }

    // Wire pass-through (continues past sleeve into cavity)
    translate([0, 0, -Port_D/2 - 10])
        cube([WireCh_H, WireCh_W, 20], center=true);

    // 45 deg entry chamfer
    chamfer_z = 1.5;
    translate([0, 0, chamfer_z / 2])
        hull() {
            cube([Port_H + 2*chamfer_z, Port_W + 2*chamfer_z, 0.1], center=true);
            cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 0.1], center=true);
        }
}

// ==========================================
// 3. PORT SOCKET SLEEVE (positive: adds depth)
// ==========================================

module port_socket_sleeve() {
    // Positive boss extending inward from inner wall surface
    // Creates the 10mm deep friction-fit pocket for the male sled
    // Without this, ports are just "windows" through a thin wall
    //
    // Outer: 24+2*2 = 28mm wide, 16+2*2 = 20mm tall
    // Inner passage: 24x16mm (sled slides in here)
    // Depth: 10mm (Port_D)
    // 1 deg draft on inner walls for friction wedging

    draft_off = Port_D * tan(Draft_Deg);

    difference() {
        // Outer sleeve body
        hull() {
            translate([0, 0, 0.5])
                cube([Port_H + 2*Sleeve_Wall + 2*draft_off,
                      Port_W + 2*Sleeve_Wall + 2*draft_off, 1], center=true);
            translate([0, 0, -Port_D + 0.5])
                cube([Port_H + 2*Sleeve_Wall, Port_W + 2*Sleeve_Wall, 1], center=true);
        }

        // Inner passage (matches socket opening with draft)
        hull() {
            translate([0, 0, 0.5])
                cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 1], center=true);
            translate([0, 0, -Port_D + 0.5])
                cube([Port_H, Port_W, 1], center=true);
        }

        // Wire channel opening at the back of the sleeve
        translate([0, 0, -Port_D])
            cube([WireCh_H, WireCh_W, 4], center=true);
    }
}

// ==========================================
// 4. FRONT CENTER PORT (LCD Display)
// ==========================================

module front_port_negative() {
    // Cuts the complete front port opening through front face + sleeve

    // Sled socket passage (24x16x10mm)
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
}

module front_port_sleeve() {
    // Sleeve behind front face for display sled depth
    draft_off = Port_D * tan(Draft_Deg);

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
    }
}

// ==========================================
// 5. LCD MOUNT STANDOFFS
// ==========================================

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
// 6. BATTERY HOLDER CRADLE (Zone A)
// ==========================================

module battery_cradle() {
    pL = BH_L + 2*BH_Clear;
    pW = BH_W + 2*BH_Clear;
    lip_h = 3.0;

    translate([0, 0, -1])
        cube([pL, pW, 2], center=true);

    for (s = [-1, 1]) {
        translate([0, s * (pW/2 + Clip_T/2), lip_h/2 - 1])
            cube([pL + 2*Clip_T, Clip_T, lip_h], center=true);
    }
    for (s = [-1, 1]) {
        translate([s * (pL/2 + Clip_T/2), 0, lip_h/2 - 1])
            cube([Clip_T, pW + 2*Clip_T, lip_h], center=true);
    }

    translate([pL/2 + 5, 0, -1])
        cube([12, WireCh_H - 2, 4], center=true);
}

// ==========================================
// 7. ESP32 STANDOFFS (Zone B)
// ==========================================

module esp32_standoffs() {
    // 4x slim M2 standoffs for ESP32-WROOM-32
    // Board 55x28mm transverse: 55mm along Y, 28mm along X
    for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * ESP_SoX/2, sy * ESP_SoY/2, 0])
            difference() {
                cylinder(h=ESP_SoH, d=M2_Boss, $fn=32);
                translate([0, 0, ESP_SoH * 0.3])
                    cylinder(h=ESP_SoH * 0.7 + 1, d=M2_Hole, $fn=32);
            }
    }

    // Anti-rotation nub
    translate([ESP_SoX/2 + 2, -3, 0])
        cube([2, 6, 3]);
}

// ==========================================
// 8. POWER MODULE SLOTS (Zone C)
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

// (Section 9 removed — wire routing is open cavity, no raised bars needed)

// ==========================================
// 10. REAR ANCHOR
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
// 11. VENTILATION (FIXED: Z-position + through-wall)
// ==========================================

module ventilation_negative() {
    // FIX 1: Slits centered at Collar_H/2 (was Z=0, at the very base)
    // FIX 2: Slits extend fully through the wall thickness
    // 45 deg chamfered for support-free printing

    for (i = [0 : Vent_N - 1]) {
        y_off = (i - (Vent_N - 1)/2) * Vent_Spc;
        translate([0, y_off, Collar_H / 2])
            rotate([0, 90, 0])
                hull() {
                    // Outer face (wider, 45 deg chamfer)
                    translate([0, 0, Wall_Thick + 1])
                        cube([Vent_W + 1.5, Vent_W + 1.5, 0.1], center=true);
                    // Inner face (narrower)
                    translate([0, 0, -(Wall_Thick + 1)])
                        cube([Vent_W, Vent_W, 0.1], center=true);
                };
    }
}

// ==========================================
// 12. USB-C CUTOUT (aligned with TP4056)
// ==========================================

module usb_c_cutout_negative() {
    // USB-C on 90 deg face (Speak face)
    // Aligned with TP4056 module position (Y=30)
    // Through the collar wall with chamfer

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

// ==========================================
// 13. MAIN ASSEMBLY
// ==========================================

module xentient_hub_v2() {

    port_Z = Collar_H + Pyr_H * 0.5;
    port_apo = Base_Apo - (Base_Apo - Front_Apo) * ((port_Z - Collar_H) / Pyr_H);

    inner_r_base = Inner_Base_R;
    inner_r_front = Inner_Front_R2;

    difference() {
        // ====== OUTER HULL + SOCKET SLEEVES ======
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

            // 6x Side port sleeves (provide 10mm socket depth)
            for (a = [30 : 60 : 330]) {
                rotate([0, 0, a])
                    translate([port_apo - Port_D/2, 0, port_Z])
                        rotate([0, 90 - Face_Tilt, 0])
                            port_socket_sleeve();
            }

            // Front port sleeve
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

        // ====== 6x SIDE PORTS ======
        for (a = [30 : 60 : 330]) {
            rotate([0, 0, a])
                translate([port_apo, 0, port_Z])
                    rotate([0, 90 - Face_Tilt, 0])
                        port_socket_negative();
        }

        // ====== FRONT CENTER PORT ======
        front_port_negative();

        // ====== REAR ANCHOR ======
        rear_anchor_negative();

        // ====== USB-C CUTOUT ======
        usb_c_cutout_negative();

        // ====== VENTILATION SLITS ======
        for (a = [0, 120, 240]) {
            rotate([0, 0, a])
                translate([Base_Apo, 0, 0])
                    ventilation_negative();
        }
    }

    // ====== INTERNAL STRUCTURE ======
    intersection() {
        translate([0, 0, Shell_T + 1])
            cylinder(h=Inner_Front_Z - Shell_T - 2,
                     r1=inner_r_base - 1,
                     r2=inner_r_front - 1, $fn=6);

        union() {
            // Zone A Floor Plate
            translate([0, 0, Shell_T])
                cylinder(h=2, r=Base_R - 6, $fn=6);

            // Zone A: Battery Cradle (rear of cavity)
            translate([0, -18, Shell_T + 2])
                battery_cradle();

            // Zone B: ESP32 Standoffs
            // Board center at Y=18 (rear standoffs at Y=-6, clear of battery at Y=-18)
            translate([0, 18, Shell_T + 2])
                esp32_standoffs();

            // Zone B-front: LCD Mount Standoffs
            translate([0, 0, Inner_Front_Z - 1])
                lcd_standoffs();

            // Zone C: Power Modules (moved closer to walls)
            // TP4056 at Y=30 (USB-C end near 90 deg wall)
            translate([0, 30, Shell_T + 2])
                power_module_clip(TP4056_L, TP4056_W, TP4056_H);

            // MT3608 next to TP4056
            translate([-22, 30, Shell_T + 2])
                power_module_clip(MT3608_L, MT3608_W, MT3608_H);

            // 3.3V LDO
            translate([20, 15, Shell_T + 2])
                power_module_clip(LDO_L, LDO_W, LDO_H);

            // (Wire channels removed — open cavity routing)
        }
    }
}

// ==========================================
// RENDER
// ==========================================

xentient_hub_v2();