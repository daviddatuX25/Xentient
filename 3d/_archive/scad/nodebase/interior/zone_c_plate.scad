// ==========================================
// Xentient Interior — Zone C Plate (ESP32-WROOM-32)
// Mounts ESP32 dev board at Z=45
// ==========================================
// Print count: 1
// Mount: slides into rail guides at Z=45, or rests on glued M2 standoffs
// Per Framework §7: ESP32 mount + anti-rotation nub + wire chimney
// Units: mm

$fn = 32;

ESP_BoardL  = 55.0;
ESP_BoardW  = 28.0;
ESP_SoX     = 22.0;
ESP_SoY     = 48.0;

M2_Hole     = 2.4;
M2_Boss     = 4.0;
Plate_T     = 2.0;
Wire_Chimney_D = 30.0;
Slot_W      = 3.5;
Slot_Engage = 2.0;

module zone_c_plate() {
    difference() {
        union() {
            // Main plate (fits hex at Z=45, F2F≈106mm)
            translate([0, 0, Plate_T/2])
                hull() {
                    for (sx = [-1, 1], sy = [-1, 1]) {
                        translate([sx * 20, sy * 30, 0])
                            cylinder(h=Plate_T, r=5, $fn=4);
                    }
                }

            // 4× M2 standoff pillars
            for (sx = [-1, 1], sy = [-1, 1]) {
                translate([sx * ESP_SoX/2, sy * ESP_SoY/2, Plate_T])
                    difference() {
                        cylinder(h=15, d=M2_Boss, $fn=32);
                        translate([0, 0, 10])
                            cylinder(h=6, d=M2_Hole, $fn=32);
                    }
            }

            // Anti-rotation nub
            translate([ESP_SoX/2 + 2, -3, Plate_T])
                cube([2, 6, 3]);
        }

        // Wire chimney
        translate([0, 0, -1])
            cylinder(h=40, d=Wire_Chimney_D, $fn=32);

        // Rail engagement notches
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * 20, sy * 30, Plate_T])
                cube([Slot_W, 3.0, Slot_Engage + 1], center=true);
        }
    }
}

// Render
zone_c_plate();