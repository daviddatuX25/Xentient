// ==========================================
// Xentient Framework - Housing 4: Motion (HC-SR501 PIR)
// Recessed shroud with Fresnel lens cutout and adjustment holes
// ==========================================
// Component: HC-SR501 PIR (23×23mm board, 15mm dome)
// Connection: 4-pin JST XH pigtail (VCC, GND, OUT, NC)
//              3 active pins, 4th unused (3-pin JST not in BOM)
// Socket: 210° face (human detection height)
// Per Framework §4 Housing 4
// Units: mm

include <sleds.scad>;

$fn = 64;

// ==========================================
// COMPONENT DIMENSIONS
// ==========================================

PIR_Board_W  = 23.0;   // HC-SR501 board width
PIR_Board_H  = 23.0;   // HC-SR501 board height (roughly square)
PIR_Board_T  = 1.6;    // PCB thickness
PIR_Dome_Dia = 15.0;   // Fresnel lens dome diameter
PIR_Dome_H   = 12.0;   // Dome height above board
PIR_Clear    = 0.4;    // Clearance per side

// Potentiometer access holes
Pot_Dia      = 3.0;    // Access hole diameter for screwdriver
Pot_Offset_X = 5.5;    // Distance from board center to pot center
Pot_Offset_Y = 7.0;    // Forward offset

// Housing dimensions
Shroud_W     = 28.0;   // Width of shroud (23mm board + walls)
Shroud_H     = 30.0;   // Height of shroud
Shroud_D     = 18.0;   // Depth of shroud (dome clearance)
House_Wall   = 2.0;    // Wall thickness
Lens_Cutout  = 15.5;   // 15mm dome + 0.5mm clearance
House_Wall2  = 1.5;    // Thin wall near lens dome

// ==========================================
// MODULE: housing_motion()
// ==========================================

module housing_motion() {
    union() {
        // Sled base with flange
        male_sled_with_flange(flange_w=3.0, flange_h=3.0, flange_t=2.0);

        // Recessed shroud body
        translate([0, 0, Sled_D]) {
            difference() {
                // Outer shroud
                hull() {
                    // Transition from sled
                    translate([0, 0, 1])
                        cube([Sled_H + 4, Sled_W + 4, 2], center=true);
                    // Shroud body
                    translate([0, 0, Shroud_D / 2 + 4])
                        cube([Shroud_H, Shroud_W, Shroud_D], center=true);
                }

                // Inner cavity
                hull() {
                    translate([0, 0, 0.5])
                        cube([Sled_H - 2, Sled_W - 2, 2], center=true);
                    translate([0, 0, Shroud_D / 2 + 4])
                        cube([Shroud_H - 2*House_Wall, Shroud_W - 2*House_Wall,
                              Shroud_D - 2*House_Wall], center=true);
                }

                // Fresnel lens dome cutout (front face)
                // 15.5mm circular hole allowing dome to protrude
                translate([0, 0, Shroud_D + 4])
                    cylinder(h=House_Wall2 + 2, d=Lens_Cutout, center=true, $fn=48);

                // Recessed shelf for PIR board (sits inside shroud)
                translate([0, 0, Shroud_D * 0.4 + 4])
                    difference() {
                        cube([PIR_Board_W + PIR_Clear, PIR_Board_H + PIR_Clear, 3], center=true);
                        // Center cutout (board sits on shelf edges)
                        translate([0, 0, 1.5])
                            cube([PIR_Board_W - 2, PIR_Board_H - 2, 3], center=true);
                    }

                // Wire channel
                translate([0, 0, -2])
                    cube([Sled_Wire_H, Sled_Wire_W, Shroud_D + 8], center=true);

                // ===== POTENTIOMETER ACCESS HOLES =====
                // Two 3mm holes on side wall for Sensitivity and Delay adjustment
                // Left side: Sensitivity pot
                translate([0, -Shroud_W/2 - 1, Shroud_D * 0.65 + 4])
                    rotate([90, 0, 0])
                        cylinder(h=House_Wall + 4, d=Pot_Dia, center=true, $fn=16);
                // Left side: Delay pot (offset from first)
                translate([0, -Shroud_W/2 - 1, Shroud_D * 0.45 + 4])
                    rotate([90, 0, 0])
                        cylinder(h=House_Wall + 4, d=Pot_Dia, center=true, $fn=16);
            }
        }
    }
}

// ==========================================
// RENDER
// ==========================================

housing_motion();