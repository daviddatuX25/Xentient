// ==========================================
// Xentient Framework - Anchor: Desk Pedestal Adapter
// Weighted wedge stand, 15° upward tilt, cable routing
// Per Framework §5
// ==========================================
// Component: Male cylinder (40mm dia) with cross-keys
//            Wedge-shaped base, 15° upward angle
//            Hollow routing channel for USB-C cable
// Material: PETG (structural) + weighted fill (sand/metal in base)
// Units: mm

$fn = 64;

// ==========================================
// ANCHOR DIMENSIONS (matching hub rear)
// ==========================================

Anchor_Dia   = 40.0;    // Male cylinder diameter
Anchor_Depth = 6.0;     // Insertion depth
Anchor_Key_W = 10.0;    // Anti-rotation key width

// Desk pedestal dimensions
Tilt_Angle   = 15;      // 15° upward angle for optimal viewing
Base_W       = 80.0;    // Base width (stable footprint)
Base_D       = 70.0;    // Base depth (front to back)
Base_H       = 25.0;    // Base height at rear (highest point)
Base_Min_H   = 10.0;    // Base height at front (lowest point)
Wall_T       = 2.5;     // Wall thickness

// Cable routing
Cable_D      = 13.0;    // Channel diameter (matches hub rear 15mm wire hole: 13+2=15)

// Weight fill pocket (for sand/metal insert)
Weight_W     = 60.0;
Weight_D     = 50.0;
Weight_H     = 10.0;

// ==========================================
// MODULE: anchor_desk_pedestal()
// ==========================================

module anchor_desk_pedestal() {
    difference() {
        union() {
            // Male cylinder (plugs into hub rear)
            cylinder(h=Anchor_Depth, d=Anchor_Dia, $fn=64);

            // Anti-rotation cross-keys
            for (a = [0, 90]) {
                rotate([0, 0, a])
                    translate([0, -Anchor_Key_W/2, 0])
                        cube([Anchor_Dia/2 + 2, Anchor_Key_W, Anchor_Depth]);
            }

            // Wedge base (15° tilt)
            // Front is low, rear is high for upward viewing angle
            hull() {
                // Front face (low)
                translate([0, Base_D/2 - 10, Base_Min_H/2])
                    cube([Base_W, 2, Base_Min_H], center=true);
                // Rear face (high)
                translate([0, -Base_D/2 + 10, Base_H/2])
                    cube([Base_W, 2, Base_H], center=true);
            }

            // Draft taper removed — hub pocket is straight 40mm, taper
            // would prevent insertion. Cross-key clearance provides fit tolerance.
        }

        // Hollow interior for weight fill
        translate([0, 0, Wall_T])
            hull() {
                translate([0, Base_D/2 - 12, Base_Min_H/2])
                    cube([Weight_W, 2, Base_Min_H - 2*Wall_T], center=true);
                translate([0, -Base_D/2 + 12, Base_H/2])
                    cube([Weight_W, 2, Base_H - 2*Wall_T], center=true);
            }

        // Weight fill access (bottom opening)
        translate([0, 0, -1])
            hull() {
                translate([0, Base_D/2 - 15, 0])
                    cube([Weight_W - 10, 2, 3], center=true);
                translate([0, -Base_D/2 + 15, 0])
                    cube([Weight_W - 10, 2, 3], center=true);
            }

        // Cable routing channel (from rear, through base, to anchor cylinder)
        // Channel follows the 15° tilt
        translate([0, 5, 0])
            rotate([Tilt_Angle, 0, 0]) {
                // Horizontal section under base
                translate([0, 0, -Base_Min_H/2])
                    cube([Cable_D + 2, Base_D + 10, Cable_D + 2], center=true);
                // Vertical section up to anchor
                translate([0, -Base_D/2 + 15, Base_H/2])
                    cylinder(h=Anchor_Depth + Base_H, d=Cable_D + 2, $fn=24);
            }

        // Anti-rotation keyway cutouts (matching hub grooves)
    }
}

// ==========================================
// RENDER
// ==========================================

anchor_desk_pedestal();