// ==========================================
// Xentient Interior — Alignment Keyway Strips
// Glue onto inner hex wall for angular orientation
// ==========================================
// Print count: 3 (at 0°, 120°, 240°)
// Glue position: inner wall at 0°, 120°, 240°
// Glue zone: full height Z=3 to Z=87
// Adhesive: cyanoacrylate on flat back, scuff wall first
// Per Framework §7: vertical alignment grooves
// Units: mm

$fn = 32;

Key_W      = 1.6;      // Keyway strip width (matches plate groove)
Key_H      = 1.6;      // Keyway strip height (protrusion from wall)
Key_Length = 84.0;     // Z=3 to Z=87 (full interior height minus floor/ceiling)
Key_Base_T = 1.0;      // Base strip thickness (glue surface)
Key_Base_W = 4.0;      // Base strip width

module keyway_strip() {
    // Flat base (glue surface)
    cube([Key_Base_W, Key_Length, Key_Base_T], center=true);

    // Raised key ridge (plates have matching groove)
    translate([0, 0, Key_Base_T/2 + Key_H/2])
        cube([Key_W, Key_Length, Key_H], center=true);
}

// Render single strip (print 3)
keyway_strip();