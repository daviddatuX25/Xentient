// ==========================================
// Xentient Interior — Zone B Plate (Master Solder Board)
// Mounts 120×80mm board at Z=20
// CANNOT be replaced by glued standoffs — needs flat plate
// ==========================================
// Print count: 1
// Mount: slides into rail guide channels at Z=20, or rests on glued standoffs
// Per Framework §7: board mount + cross-bracing + wire chimney
// Units: mm

$fn = 32;

Board_L    = 120.0;
Board_W    = 80.0;
Board_SoX  = 110.0;    // Standoff span X
Board_SoY  = 70.0;     // Standoff span Y
Board_Chamfer = 15.0;   // Corner chamfer for hex fit

M3_Insert  = 4.2;      // Heat-set insert hole
M3_Boss    = 5.0;
Plate_T    = 2.0;
Wire_Chimney_D = 30.0;
Slot_W     = 3.5;
Slot_Engage = 2.0;

module zone_b_plate() {
    difference() {
        union() {
            // Main plate with chamfered corners (fits hex at Z=20, F2F≈133mm)
            translate([0, 0, Plate_T/2])
                hull() {
                    for (sx = [-1, 1], sy = [-1, 1]) {
                        translate([sx * (Board_L/2 - Board_Chamfer),
                                   sy * (Board_W/2 - Board_Chamfer), 0])
                            cylinder(h=Plate_T, r=Board_Chamfer, $fn=4);
                    }
                }

            // 4× M3 standoff pillars
            for (sx = [-1, 1], sy = [-1, 1]) {
                translate([sx * Board_SoX/2, sy * Board_SoY/2, Plate_T])
                    difference() {
                        cylinder(h=15, d=M3_Boss, $fn=32);
                        translate([0, 0, 10])
                            cylinder(h=6, d=M3_Insert, $fn=32);
                    }
            }

            // Cross-bracing
            for (sx = [-1, 1]) {
                hull() {
                    translate([sx * Board_SoX/2, -Board_SoY/2, Plate_T])
                        cylinder(h=9, d=M3_Boss, $fn=16);
                    translate([sx * Board_SoX/2, Board_SoY/2, Plate_T])
                        cylinder(h=9, d=M3_Boss, $fn=16);
                }
            }
        }

        // Wire chimney
        translate([0, 0, -1])
            cylinder(h=40, d=Wire_Chimney_D, $fn=32);

        // Rail engagement notches
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * 63, sy * 33, Plate_T])
                cube([Slot_W, 3.0, Slot_Engage + 1], center=true);
        }
    }
}

// Render
zone_b_plate();