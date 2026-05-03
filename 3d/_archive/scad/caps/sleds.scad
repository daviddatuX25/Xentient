// ==========================================
// Xentient Framework - Universal Sled & Socket Library
// Shared modules for all peripheral caps
// ==========================================
// Per Framework §2: Universal Mating Protocol
// Female Socket (in hub): 24.4×16.4×10.0mm (0.4mm clearance), wire channel 18×8mm
// Male Sled (on cap base): 23.6×15.6×10.0mm, 1° draft, hollow 18×8mm
// Flange: +3mm each side (increased from +2mm for bearing strength)
// Units: mm

$fn = 64;

// ==========================================
// MALE SLED PARAMETERS
// ==========================================

Sled_W       = 23.6;    // Width (0.4mm tolerance in female 24.0mm)
Sled_H       = 15.6;    // Height (0.4mm tolerance in female 16.0mm)
Sled_D       = 10.0;    // Depth (insertion length)
Sled_Draft   = 1.0;     // 1-degree draft angle
Sled_Wire_W  = 18.0;    // Wire pass-through width
Sled_Wire_H  = 8.0;     // Wire pass-through height
Sled_Wall    = 2.0;     // Minimum wall thickness

// Derived
Sled_Draft_Off = Sled_D * tan(Sled_Draft);  // ~0.17mm per side

// ==========================================
// MODULE: male_sled()
// The plug base that inserts into the hub's female socket.
// All caps start with this at their base.
//
// Usage: difference() { male_sled(); /* your cap-specific cutouts */ }
// ==========================================

module male_sled() {
    difference() {
        // Outer body with 1° draft
        hull() {
            // Entry face (slightly larger for wedge fit)
            translate([0, 0, Sled_D - 0.5])
                cube([Sled_H + 2*Sled_Draft_Off,
                      Sled_W + 2*Sled_Draft_Off,
                      1], center=true);
            // Inner face (exact size)
            translate([0, 0, 0.5])
                cube([Sled_H, Sled_W, 1], center=true);
        }

        // Wire pass-through (hollow core)
        translate([0, 0, Sled_D / 2])
            cube([Sled_Wire_H, Sled_Wire_W, Sled_D + 2], center=true);

        // Entry chamfer (45° for easy insertion)
        chamfer_h = 1.5;
        translate([0, 0, Sled_D - chamfer_h/2])
            hull() {
                cube([Sled_H + 2*chamfer_h, Sled_W + 2*chamfer_h, 0.1], center=true);
                cube([Sled_H, Sled_W, 0.1], center=true);
            }
    }
}

// ==========================================
// MODULE: male_sled_with_flange()
// Adds a flange around the sled base for cap-to-hub transition.
// Flange sits flush against hub exterior face.
//
// flange_w: extra width beyond sled on each side
// flange_h: extra height beyond sled on each side
// flange_t: flange thickness
// ==========================================

module male_sled_with_flange(flange_w=3.0, flange_h=3.0, flange_t=2.0) {
    union() {
        male_sled();

        // Flange ring around sled entry
        translate([0, 0, Sled_D])
            difference() {
                cube([Sled_H + 2*flange_h,
                      Sled_W + 2*flange_w,
                      flange_t], center=true);
                // Cut sled opening through flange
                cube([Sled_H + 1, Sled_W + 1, flange_t + 2], center=true);
            }
    }
}

// ==========================================
// MODULE: wire_channel()
// Internal wire routing channel from sled to component.
// Extends from sled core outward through the cap body.
//
// length: distance from sled to component
// direction: "straight" or "angled"
// ==========================================

module wire_channel(length=15, direction="straight") {
    if (direction == "straight") {
        translate([0, 0, Sled_D / 2 + length / 2])
            cube([Sled_Wire_H, Sled_Wire_W, length + 1], center=true);
    }
}

// ==========================================
// VISUALIZATION HELPERS
// ==========================================

// Render just the sled for testing
// male_sled();