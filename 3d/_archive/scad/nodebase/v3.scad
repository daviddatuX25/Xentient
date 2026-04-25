// ==========================================
// Xentient Framework - Main Node Module V3
// Scaled: 150mm base, 90mm height, stack zoning
// ==========================================
// Print: PETG, 0.2mm layers, 45° overhangs (support-free)
// Bed: Base (150mm F2F) flat on bed, rear face down
// Units: mm
//
// V3 — Clean hollow shell. All interior features are separate prints.
// See nodebase/SPEC-v3.md for interior module print list + glue positions.

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

// --- Fastener specs ---
M3_Hole   = 3.2;   // M3 heat-set insert hole
M3_Boss   = 5.0;   // Slim M3 boss
M3_Insert = 4.2;   // Heat-set insert for M3
M2_Hole   = 2.4;   // M2 screw body
M2_Boss   = 4.0;   // Slim M2 boss (spec says 4mm)

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
    // Pocket cutout through front face + sleeve (with 1° draft, matching side pockets)
    draft_off = Port_D * tan(1.0);
    translate([0, 0, Total_Depth - Port_D / 2])
        hull() {
            translate([0, 0, Port_D/2 - 0.5])
                cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 1], center=true);
            translate([0, 0, -Port_D/2 + 0.5])
                cube([Port_H, Port_W, 1], center=true);
        };

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

// ==========================================
// 6. USB-C CUTOUT
// ==========================================

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
// 7. VENTILATION (Thermal Gills)
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
    }

    // ====== CLEAN ATRIUM — all interior features are separate prints ======
    // Shell provides ONLY: pockets, sleeves, USB-C, ventilation, rear anchor, collar ribs.
    // Everything inside (rail guides, keyway strips, landing pads, zone plates,
    // reference markers) is a separate .scad file printed and glued in.
    // See SPEC-v3.md for glue positions and print counts.
}

// ==========================================
// RENDER
// ==========================================

xentient_hub_v3();