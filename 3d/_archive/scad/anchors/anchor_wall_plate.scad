// ==========================================
// Xentient Framework - Anchor: Wall Plate Adapter
// Plugs into Rear Universal Anchor (40mm circular recess)
// Per Framework §5
// ==========================================
// Component: Male cylinder (40mm dia) with cross-keys
//            Flares to 60×60mm flat plate with 4× M3 countersunk holes
// Material: PETG (structural)
// Units: mm

$fn = 64;

// ==========================================
// ANCHOR DIMENSIONS (matching hub rear)
// ==========================================

Anchor_Dia   = 40.0;    // Male cylinder diameter
Anchor_Depth = 6.0;     // Insertion depth into hub
Anchor_Key_W = 10.0;    // Anti-rotation cross-key width
Anchor_Key_H = Anchor_Depth;  // Key height matches depth

// Wall plate dimensions
Plate_W      = 60.0;    // Square plate width
Plate_T      = 6.0;     // Plate thickness
M3_CSK_Dia  = 6.5;     // M3 countersunk head diameter
M3_Hole_Dia = 3.2;     // M3 screw hole diameter
CSK_Depth   = 3.0;     // Countersink depth
Hole_Offset = 24.0;    // Hole offset from center (24mm = 48mm span)

// Wire routing
Wire_Hole_D = 15.0;    // Central wire routing hole diameter

// ==========================================
// MODULE: anchor_wall_plate()
// ==========================================

module anchor_wall_plate() {
    difference() {
        union() {
            // Male cylinder (plugs into hub rear)
            cylinder(h=Anchor_Depth, d=Anchor_Dia, $fn=64);

            // Anti-rotation cross-keys (2 perpendicular ridges)
            for (a = [0, 90]) {
                rotate([0, 0, a])
                    translate([0, -Anchor_Key_W/2, 0])
                        cube([Anchor_Dia/2 + 2, Anchor_Key_W, Anchor_Key_H]);
            }

            // Transition from cylinder to square plate
            hull() {
                cylinder(h=1, d=Anchor_Dia + 4, $fn=64);
                translate([0, 0, Plate_T])
                    cube([Plate_W, Plate_W, 1], center=true);
            }

            // Wall plate
            translate([0, 0, Plate_T / 2])
                cube([Plate_W, Plate_W, Plate_T], center=true);
        }

        // Anti-rotation keyways in hub (matching grooves)
        // These are cut from the cylinder — the hub has matching channels

        // Central wire routing hole (for USB power through drywall)
        translate([0, 0, -1])
            cylinder(h=Anchor_Depth + Plate_T + 2, d=Wire_Hole_D, $fn=32);

        // 4× M3 countersunk holes
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * Hole_Offset, sy * Hole_Offset, 0]) {
                // Through hole
                translate([0, 0, -1])
                    cylinder(h=Anchor_Depth + Plate_T + 2, d=M3_Hole_Dia, $fn=24);
                // Countersink (on outer face)
                translate([0, 0, Plate_T - CSK_Depth])
                    cylinder(h=CSK_Depth + 1, d=M3_CSK_Dia, $fn=24);
            }
        }

        // Draft angle removed — hub pocket is straight 40mm, taper would
        // prevent insertion. The 0.4mm clearance on cross-keys provides
        // enough tolerance for PETG printing.
    }
}

// ==========================================
// RENDER
// ==========================================

anchor_wall_plate();