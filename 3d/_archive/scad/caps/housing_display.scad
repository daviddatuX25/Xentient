// ==========================================
// Xentient Framework - Housing 6: Display (LCD 16×2)
// Flared monitor with bezel, M3 standoffs, snap-fit backplate
// ==========================================
// Component: LCD 16×2 + PCF8574 I2C backpack (71×26×15mm)
// Connection: 4-pin JST XH pigtail (I2C: VCC, GND, SDA, SCL)
// Socket: CENTER FRONT (dedicated, not side port)
// Per Framework §4 Housing 6
// EXCLUSIVE: Plugs into front center socket only
// Units: mm

include <sleds.scad>;

$fn = 64;

// ==========================================
// COMPONENT DIMENSIONS
// ==========================================

LCD_W       = 71.0;    // LCD module width
LCD_H       = 26.0;    // LCD module height
LCD_D       = 15.0;    // LCD + backpack depth
LCD_Mount_X = 32.0;    // M3 mounting hole span X (was in v3 as 32mm)
LCD_Mount_Y = 12.0;    // M3 mounting hole span Y

// Housing dimensions
Bezel_W     = 75.0;    // Outer bezel width (71mm LCD + 2mm each side)
Bezel_H     = 30.0;    // Outer bezel height (26mm LCD + 2mm each side)
Flare_Depth = 18.0;    // Depth from sled face to LCD face
House_Wall  = 2.0;    // Wall thickness
Backplate_T = 1.5;    // Snap-fit backplate thickness

// ==========================================
// MODULE: housing_display()
// Rapid flare from 24×16 sled to 75×30 bezel
// ==========================================

module housing_display() {
    union() {
        // Sled base with flange (wider for display)
        male_sled_with_flange(flange_w=3.0, flange_h=3.0, flange_t=2.5);

        // Flared monitor body
        translate([0, 0, Sled_D]) {
            difference() {
                // Outer shell: sled → bezel flare
                hull() {
                    // Transition from sled face
                    translate([0, 0, 1])
                        cube([Sled_H + 6, Sled_W + 6, 2], center=true);
                    // Full bezel face
                    translate([0, 0, Flare_Depth])
                        cube([Bezel_H, Bezel_W, 3], center=true);
                }

                // Inner cavity
                hull() {
                    translate([0, 0, 0.5])
                        cube([Sled_H - 2, Sled_W - 2, 2], center=true);
                    translate([0, 0, Flare_Depth - House_Wall])
                        cube([Bezel_H - 2*House_Wall, Bezel_W - 2*House_Wall, 4], center=true);
                }

                // LCD window (front face, exact cutout)
                translate([0, 0, Flare_Depth])
                    cube([LCD_H + 0.3, LCD_W + 0.3, House_Wall + 4], center=true);

                // Wire channel from sled to LCD
                translate([0, 0, -2])
                    cube([Sled_Wire_H, Sled_Wire_W, Flare_Depth + 6], center=true);

                // M3 mounting holes for LCD backpack
                for (sx = [-1, 1], sy = [-1, 1]) {
                    translate([sx * LCD_Mount_X / 2, sy * LCD_Mount_Y / 2, Flare_Depth * 0.6])
                        cylinder(h=Flare_Depth, d=3.2, center=true, $fn=24);
                }

                // Snap-fit backplate channel (rear face)
                translate([0, 0, -House_Wall/2])
                    difference() {
                        cube([Bezel_H + 2, Bezel_W + 2, House_Wall + 1], center=true);
                        // Snap ridge
                        for (side = [-1, 1]) {
                            translate([0, side * (Bezel_W/2 + 0.5), 0])
                                cube([Bezel_H - 4, 1.0, House_Wall + 2], center=true);
                        }
                    }
            }

            // M3 heat-set insert bosses for LCD mount
            for (sx = [-1, 1], sy = [-1, 1]) {
                translate([sx * LCD_Mount_X / 2, sy * LCD_Mount_Y / 2, Flare_Depth * 0.4])
                    difference() {
                        cylinder(h=Flare_Depth * 0.4, d=5.0, $fn=24);
                        translate([0, 0, Flare_Depth * 0.2])
                            cylinder(h=Flare_Depth * 0.3 + 1, d=4.2, $fn=24);  // M3 heat-set insert
                    }
            }
        }
    }
}

// ==========================================
// MODULE: display_backplate()
// Snap-fit backplate to enclose LCD
// ==========================================

module display_backplate() {
    difference() {
        // Backplate body
        cube([Bezel_H - 4, Bezel_W - 4, Backplate_T], center=true);

        // Snap ridge notches
        for (side = [-1, 1]) {
            translate([0, side * (Bezel_W/2 - 3), 0])
                cube([Bezel_H - 8, 1.2, Backplate_T + 2], center=true);
        }

        // M3 screw holes
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * LCD_Mount_X / 2, sy * LCD_Mount_Y / 2, 0])
                cylinder(h=Backplate_T + 2, d=3.2, center=true, $fn=24);
        }

        // Wire routing notch
        translate([0, 0, 0])
            cube([Sled_Wire_H + 2, Sled_Wire_W + 2, Backplate_T + 2], center=true);
    }
}

// ==========================================
// RENDER
// ==========================================

housing_display();

// Backplate rendered offset for visualization
%translate([0, Bezel_W + 10, 0]) display_backplate();