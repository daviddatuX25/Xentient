// ==========================================
// Xentient Interior — Zone A Tray (Battery + Power)
// Slides onto rail guides at Z=3
// ==========================================
// Print count: 1
// Mount: slides into rail guide channels at Z=3, or glue directly to floor
// Per Framework §7: battery cradle + power module clips
// Units: mm

$fn = 32;

// Battery holder (18650 single cell)
BH_L       = 78.0;
BH_W       = 22.0;
BH_H       = 19.0;
BH_Clear   = 0.2;

// Power modules
TP4056_L   = 25.0;  TP4056_W = 19.0;  TP4056_H = 10.0;
MT3608_L   = 37.0;  MT3608_W = 22.0;  MT3608_H = 10.0;
LDO_L      = 12.0;  LDO_W    = 8.0;   LDO_H    = 5.0;
Clip_T     = 1.5;    Clip_Clear = 0.2;

// Tray plate
Tray_T     = 2.0;    // Plate thickness
Wire_Chimney_D = 30.0; // Central wire routing cutout

// Rail slot engagement (slides between rail guide strips)
Slot_W     = 3.5;    // Matches rail guide channel width
Slot_Engage = 2.0;   // How deep the tray edge engages the rail

module zone_a_tray() {
    difference() {
        // Hex-shaped floor plate (fits inside hex at Z=3, F2F≈142mm)
        // Simplified: rectangular with wire chimney
        // Battery cradle centered at Y=-25, power modules near Y=+30
        union() {
            // Main plate (sized to fit hex at Z=3)
            translate([0, 0, Tray_T/2])
                cube([130, 70, Tray_T], center=true);

            // Battery retaining walls
            pL = BH_L + 2*BH_Clear;
            pW = BH_W + 2*BH_Clear;
            translate([0, -25, BH_H/4 + Tray_T])
                for (s = [-1, 1]) {
                    // Y-axis lips
                    translate([0, s * (pW/2 + Clip_T/2), 0])
                        cube([pL + 2*Clip_T, Clip_T, BH_H/2], center=true);
                    // X-axis lips
                    translate([s * (pL/2 + Clip_T/2), 0, 0])
                        cube([Clip_T, pW + 2*Clip_T, BH_H/2], center=true);
                }

            // TP4056 clip
            translate([15, 30, TP4056_H/4 + Tray_T])
                for (s = [-1, 1]) {
                    translate([0, s * (TP4056_W/2 + Clip_Clear + Clip_T/2), 0])
                        cube([TP4056_L + 2*Clip_Clear + 2*Clip_T, Clip_T, TP4056_H/2], center=true);
                    translate([s * (TP4056_L/2 + Clip_Clear + Clip_T/2), 0, 0])
                        cube([Clip_T, TP4056_W + 2*Clip_Clear + 2*Clip_T, TP4056_H/2], center=true);
                }

            // MT3608 clip
            translate([-15, 30, MT3608_H/4 + Tray_T])
                for (s = [-1, 1]) {
                    translate([0, s * (MT3608_W/2 + Clip_Clear + Clip_T/2), 0])
                        cube([MT3608_L + 2*Clip_Clear + 2*Clip_T, Clip_T, MT3608_H/2], center=true);
                    translate([s * (MT3608_L/2 + Clip_Clear + Clip_T/2), 0, 0])
                        cube([Clip_T, MT3608_W + 2*Clip_Clear + 2*Clip_T, MT3608_H/2], center=true);
                }
        }

        // Wire chimney (central cutout)
        translate([0, 0, -1])
            cylinder(h=Tray_T + 20, d=Wire_Chimney_D, $fn=32);

        // Rail engagement notches (4 corners of plate, for rail guides)
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * 63, sy * 33, Tray_T])
                cube([Slot_W, 3.0, Slot_Engage + 1], center=true);
        }
    }
}

// Render
zone_a_tray();