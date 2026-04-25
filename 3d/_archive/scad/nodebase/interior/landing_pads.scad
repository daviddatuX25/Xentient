// ==========================================
// Xentient Interior — Landing Pads (Path B Glue Targets)
// Printed discs glued onto inner wall for M3 standoff placement
// ==========================================
// Print count: 4 (Zone B master board corners)
// Glue position: (±57, ±37) at Z=20 on inner cavity wall
// Adhesive: cyanoacrylate, scuff pad back + wall before gluing
// After gluing: scuff pad face, glue M3 standoff on top
// Per Framework §7: 8mm diameter × 0.5mm raised pads
// Units: mm

$fn = 32;

Pad_Dia    = 8.0;      // Landing pad diameter
Pad_T      = 0.5;     // Pad thickness (thin, just provides flat glue surface)
Pilot_D    = 1.5;     // Center pilot hole (marks exact standoff position)

module landing_pad() {
    difference() {
        cylinder(h=Pad_T, d=Pad_Dia, $fn=32);
        // Center pilot (drill guide for precise M3 positioning)
        translate([0, 0, -0.1])
            cylinder(h=Pad_T + 0.2, d=Pilot_D, $fn=16);
    }
}

// Render single pad (print 4 for Zone B)
landing_pad();