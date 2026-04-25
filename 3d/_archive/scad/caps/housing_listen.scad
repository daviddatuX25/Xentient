// ==========================================
// Xentient Framework - Housing 1: Listen (INMP441 MEMS Mic)
// Low-profile dome with acoustic pinhole array
// ==========================================
// Component: INMP441 MEMS microphone (8×8mm PCB) + 100nF cap
// Connection: 6-pin JST XH pigtail (I2S: VCC, GND, WS, SCK, SD, L/R)
// Socket: Any side port (recommended: 270° opposite speaker)
// Per Framework §4 Housing 1
// Units: mm

include <sleds.scad>;

$fn = 64;

// ==========================================
// COMPONENT DIMENSIONS
// ==========================================

Mic_PCB_W    = 8.0;    // INMP441 board width
Mic_PCB_H    = 8.0;    // INMP441 board height
Mic_PCB_T    = 1.6;    // PCB thickness
Mic_Port_D   = 1.0;    // Sound port diameter on MEMS can

// Housing dimensions
House_Ext    = 10.0;   // Extension beyond sled face
House_Dome_R = 10.0;   // Dome radius (low profile)
House_Wall   = 2.0;    // Wall thickness
Pinhole_D   = 1.0;     // Acoustic pinhole diameter
Pinhole_N   = 9;       // 3×3 grid of pinholes
Pinhole_Spc = 2.5;     // Pinhole spacing
PCB_Slot_W  = Mic_PCB_W + 0.4;  // 0.2mm clearance per side
PCB_Slot_H  = Mic_PCB_H + 0.4;

// ==========================================
// MODULE: housing_listen()
// ==========================================

module housing_listen() {
    union() {
        // Sled base with flange
        male_sled_with_flange(flange_w=3.0, flange_h=3.0, flange_t=2.0);

        // Dome extension from sled entry face
        translate([0, 0, Sled_D]) {
            difference() {
                // Outer dome shell
                hull() {
                    // Flange transition
                    cube([Sled_H + 4, Sled_W + 4, 2], center=true);
                    // Dome peak
                    translate([0, 0, House_Ext])
                        scale([1.3, 1.0, 1.0])
                            sphere(r=House_Dome_R * 0.6);
                }

                // Inner cavity
                hull() {
                    translate([0, 0, -1])
                        cube([Sled_H - 2, Sled_W - 2, 2], center=true);
                    translate([0, 0, House_Ext - House_Wall])
                        scale([1.3, 1.0, 1.0])
                            sphere(r=House_Dome_R * 0.6 - House_Wall);
                }

                // Acoustic pinhole array (3×3 grid on front face)
                // Drilled along Z axis — sound enters outward from hub face
                for (px = [-1, 0, 1], py = [-1, 0, 1]) {
                    translate([px * Pinhole_Spc, py * Pinhole_Spc, House_Ext - 1])
                        cylinder(h=House_Wall + 4, d=Pinhole_D, center=true, $fn=16);
                }

                // PCB slot (internal slide-in for 8×8mm board)
                translate([0, 0, House_Ext * 0.3])
                    cube([PCB_Slot_W, PCB_Slot_H, House_Ext * 0.8], center=true);

                // Wire channel from sled through housing
                translate([0, 0, -2])
                    cube([Sled_Wire_H, Sled_Wire_W, House_Ext + 4], center=true);
            }

            // Internal PCB shelf (stops board from sliding too deep)
            translate([0, 0, House_Ext * 0.15])
                difference() {
                    cube([Sled_H - 2, Sled_W - 2, 1.5], center=true);
                    cube([PCB_Slot_W + 1, PCB_Slot_H + 1, 3], center=true);
                }
        }
    }
}

// ==========================================
// RENDER
// ==========================================

housing_listen();