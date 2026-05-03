// ==========================================
// Xentient Interior — Rail Guide Strips
// Glue onto inner hex wall at each vertex
// Plates slide into the channel these create
// ==========================================
// Print count: 6 (one per hex vertex)
// Glue position: inner wall at 0°, 60°, 120°, 180°, 240°, 300°
// Glue zone: Z=3 to Z=12 (collar only, where wall ≥ 3mm)
// Adhesive: cyanoacrylate on flat back, scuff wall first
// Per Framework §7: 3.5mm wide × 2mm deep rail slots
// Units: mm

$fn = 32;

Rail_W      = 3.5;     // Rail channel width
Rail_H      = 2.0;     // Rail protrusion height (creates groove between pair)
Rail_Length = 9.0;     // Z=3 to Z=12 = 9mm
Rail_Base_T = 1.5;     // Base strip thickness (glue surface)
Rail_Base_W = 6.0;     // Base strip width (wider than rail for glue area)

module rail_guide_strip() {
    // Flat base strip (glue surface against inner wall)
    cube([Rail_Length, Rail_Base_W, Rail_Base_T], center=true);

    // Raised rail ridge (one side of the channel)
    // Two strips placed 3.5mm apart create a groove for plate edge
    translate([0, Rail_W/2 + 1.0, Rail_Base_T/2 + Rail_H/2])
        cube([Rail_Length, 1.0, Rail_H], center=true);
}

// Render single strip (print 6)
rail_guide_strip();