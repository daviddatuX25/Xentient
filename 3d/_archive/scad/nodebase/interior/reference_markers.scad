// ==========================================
// Xentient Interior — Reference Markers
// Small printed markers glued at mounting coordinates
// Help locate drill/glue positions inside the shell
// ==========================================
// Print count: 10 (3 Zone A + 4 Zone B + 3 Zone C)
// Glue positions: see SPEC-v3.md §5
// Adhesive: small dab of cyanoacrylate
// Per Framework §7: 0.5mm deep reference dimples
// Units: mm

$fn = 16;

Mark_Dia   = 4.0;      // Marker disc diameter (visible, easy to place)
Mark_T     = 0.5;      // Marker thickness
Pilot_D    = 1.5;      // Center pilot (marks exact coordinate)

module reference_marker() {
    difference() {
        cylinder(h=Mark_T, d=Mark_Dia, $fn=16);
        translate([0, 0, -0.1])
            cylinder(h=Mark_T + 0.2, d=Pilot_D, $fn=16);
    }
}

// Render single marker (print 10: 3+4+3)
reference_marker();