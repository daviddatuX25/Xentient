// ==========================================
// Xentient Framework - Housing 2: Speak (MAX98357A + 3W 8Ω Speaker)
// Trapezoidal flare housing with thermal divider
// ==========================================
// Component: MAX98357A amp (7×7mm) + 3W 8Ω speaker (40mm dia)
// Connection: 6-pin JST XH pigtail (I2S: VCC, GND, DIN, BCLK, LRC, GAIN)
// Socket: 90° face (near USB-C, ventilation)
// Per Framework §4 Housing 2
// IMPORTANT: Speaker (40mm) > Sled (24mm), housing MUST flare outward
// Units: mm

include <sleds.scad>;

$fn = 64;

// ==========================================
// COMPONENT DIMENSIONS
// ==========================================

Spk_Dia     = 40.0;    // Speaker diameter
Spk_Depth   = 15.0;    // Speaker magnet depth
Spk_Grille  = 1.5;     // Grille bar thickness
Amp_PCB_W   = 7.0;     // MAX98357A board width
Amp_PCB_H   = 7.0;     // MAX98357A board height
Amp_PCB_T   = 1.6;     // PCB thickness

// Housing dimensions
Flare_W     = 48.0;     // Max width at speaker end (40mm speaker + walls)
Flare_H     = 46.0;     // Max height at speaker end
Flare_Depth = 22.0;     // Depth from sled face to speaker front
House_Wall  = 2.5;      // Thicker walls for speaker vibration
Div_Wall_T  = 2.0;      // Thermal divider thickness

// Asymmetric offset — speaker extends more to one side
// to avoid blocking neighboring caps
Offset_X    = 3.0;      // Shift speaker center away from sled center

// ==========================================
// MODULE: housing_speak()
// ==========================================

module housing_speak() {
    union() {
        // Sled base with wider flange for trapezoidal transition
        male_sled_with_flange(flange_w=3.0, flange_h=3.0, flange_t=2.5);

        // Trapezoidal flare body
        translate([0, 0, Sled_D]) {
            // Thermal divider (ADDITIVE — solid wall between amp and speaker zones)
            // Spans inner cavity, separates amp zone (near sled) from speaker zone
            difference() {
                translate([0, 0, Flare_Depth * 0.4])
                    cube([Flare_W - 2*House_Wall, Div_Wall_T, Flare_Depth * 0.3], center=true);
                // Wire passthrough through divider
                translate([0, 0, Flare_Depth * 0.4])
                    cube([Sled_Wire_H, Sled_Wire_W + 2, Flare_Depth * 0.3 + 2], center=true);
            }

            difference() {
                // Outer shell: sled face → speaker flare
                hull() {
                    // Sled transition face
                    translate([0, 0, 1])
                        cube([Sled_H + 6, Sled_W + 6, 2], center=true);
                    // Speaker end face (asymmetric offset)
                    translate([Offset_X, 0, Flare_Depth])
                        cylinder(h=3, d1=Flare_W, d2=Flare_W, $fn=48);
                }

                // Inner cavity: sled channel → speaker chamber
                hull() {
                    translate([0, 0, 0.5])
                        cube([Sled_H - 2, Sled_W - 2, 2], center=true);
                    translate([Offset_X, 0, Flare_Depth - House_Wall])
                        cylinder(h=3, d=Flare_W - 2*House_Wall, $fn=48);
                }

                // Speaker grille (front face, offset)
                translate([Offset_X, 0, Flare_Depth])
                    grille_pattern(dia=Flare_W - 4, bar_w=Spk_Grille);

                // Speaker cutout (40mm diameter, 2mm inset from front)
                translate([Offset_X, 0, Flare_Depth - Spk_Depth - House_Wall])
                    cylinder(h=Spk_Depth + 1, d=Spk_Dia + 0.4, $fn=48);

                // MAX98357A mount shelf (behind divider, near sled)
                translate([0, 0, Sled_D * 0.3])
                    cube([Amp_PCB_W + 0.8, Amp_PCB_H + 0.8, 2], center=true);

                // Wire channel
                translate([0, 0, -2])
                    cube([Sled_Wire_H, Sled_Wire_W, Flare_Depth + 6], center=true);

                // Ventilation slits (top and bottom for amp heat dissipation)
                for (vz = [Flare_Depth * 0.2, Flare_Depth * 0.35]) {
                    // Top vent
                    translate([Offset_X, Flare_W/2 - 1, vz])
                        cube([8, House_Wall + 2, 3], center=true);
                    // Bottom vent
                    translate([Offset_X, -Flare_W/2 + 1, vz])
                        cube([8, House_Wall + 2, 3], center=true);
                }
            }
        }
    }
}

// ==========================================
// MODULE: grille_pattern()
// Creates a speaker grille with horizontal bars
// ==========================================

module grille_pattern(dia=36, bar_w=1.5, bar_spc=3.0) {
    n_bars = floor(dia / bar_spc);
    for (i = [0 : n_bars - 1]) {
        y_off = -dia/2 + i * bar_spc + bar_spc/2;
        chord_half = sqrt(max(0, (dia/2)*(dia/2) - y_off*y_off));
        if (chord_half > bar_w) {
            translate([0, y_off, 0])
                cube([2 * chord_half, bar_w, House_Wall + 4], center=true);
        }
    }
}

// ==========================================
// RENDER
// ==========================================

housing_speak();