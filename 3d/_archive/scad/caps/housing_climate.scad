// ==========================================
// Xentient Framework - Housing 3: Climate (BME280)
// Standoff vented box with 15mm extension from hub
// ==========================================
// Component: BME280 breakout (13×10mm) + 100nF cap
// Connection: 6-pin JST XH pigtail (I2C: VCC, GND, SDA, SCL, NC, NC)
//              4 active pins, 2 unused/NC
// Socket: 150° face (away from heat sources)
// Per Framework §4 Housing 3
// CRITICAL: Must extend 15mm+ from hub to avoid reading hub's own heat
// Units: mm

include <sleds.scad>;

$fn = 64;

// ==========================================
// COMPONENT DIMENSIONS
// ==========================================

BME_W    = 13.0;    // BME280 board width
BME_H    = 10.0;    // BME280 board height
BME_T    = 1.6;     // PCB thickness
BME_Clear = 0.4;    // Clearance per side

// Housing dimensions
Ext_Length = 15.0;  // Minimum extension from hub face (CRITICAL)
Box_W      = 20.0;  // Housing width (sled 24mm → 20mm at sensor end)
Box_H      = 18.0;  // Housing height
Box_D      = 18.0;  // Housing depth (extension length)
House_Wall = 2.0;   // Wall thickness
Vent_N     = 4;     // Louver slits per side
Vent_W     = 2.0;   // Slit width
Vent_L     = 10.0;  // Slit length
Vent_Spc   = 4.0;   // Slit spacing
PCB_Shelf_H = 3.0;  // Shelf height for BME board

// ==========================================
// MODULE: housing_climate()
// ==========================================

module housing_climate() {
    union() {
        // Sled base with flange
        male_sled_with_flange(flange_w=3.0, flange_h=3.0, flange_t=2.0);

        // Transition + extended box
        translate([0, 0, Sled_D]) {
            difference() {
                // Outer shell: sled face → standoff box
                hull() {
                    // Transition from sled face
                    translate([0, 0, 1])
                        cube([Sled_H + 4, Sled_W + 4, 2], center=true);
                    // Extended box at sensor end
                    translate([0, 0, Ext_Length + Box_D / 2])
                        cube([Box_H, Box_W, Box_D], center=true);
                }

                // Inner cavity
                hull() {
                    translate([0, 0, 0.5])
                        cube([Sled_H - 2, Sled_W - 2, 2], center=true);
                    translate([0, 0, Ext_Length + Box_D / 2])
                        cube([Box_H - 2*House_Wall, Box_W - 2*House_Wall, Box_D - 2*House_Wall], center=true);
                }

                // BME280 mount shelf (at sensor end)
                translate([0, 0, Ext_Length + Box_D * 0.7])
                    difference() {
                        cube([Box_H - 2*House_Wall, Box_W - 2*House_Wall, PCB_Shelf_H], center=true);
                        // Cutout for BME board (sits on shelf)
                        translate([0, 0, PCB_Shelf_H/2])
                            cube([BME_W + BME_Clear, BME_H + BME_Clear, PCB_Shelf_H], center=true);
                    }

                // Wire channel through transition
                translate([0, 0, -2])
                    cube([Sled_Wire_H, Sled_Wire_W, Ext_Length + Box_D + 6], center=true);

                // ===== LOUVERED VENTILATION SLITS =====
                // Left side gills
                for (i = [0 : Vent_N - 1]) {
                    vz = Ext_Length + Box_D * 0.3 + i * Vent_Spc;
                    translate([-Box_H/2 - 1, 0, vz])
                        rotate([0, 90, 0])
                            cube([Vent_W, Vent_L, House_Wall + 4], center=true);
                }
                // Right side gills
                for (i = [0 : Vent_N - 1]) {
                    vz = Ext_Length + Box_D * 0.3 + i * Vent_Spc;
                    translate([Box_H/2 + 1, 0, vz])
                        rotate([0, 90, 0])
                            cube([Vent_W, Vent_L, House_Wall + 4], center=true);
                }
                // Top gills
                for (i = [0 : Vent_N - 1]) {
                    vz = Ext_Length + Box_D * 0.3 + i * Vent_Spc;
                    translate([0, Box_W/2 + 1, vz])
                        cube([Vent_L, House_Wall + 4, Vent_W], center=true);
                }
                // Bottom gills
                for (i = [0 : Vent_N - 1]) {
                    vz = Ext_Length + Box_D * 0.3 + i * Vent_Spc;
                    translate([0, -Box_W/2 - 1, vz])
                        cube([Vent_L, House_Wall + 4, Vent_W], center=true);
                }
            }
        }
    }
}

// ==========================================
// RENDER
// ==========================================

housing_climate();