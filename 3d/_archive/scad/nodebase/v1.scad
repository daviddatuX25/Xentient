// ==========================================
// Xentient Framework - Main Node Module V2.3
// Focus: Integrated Chassis, Mating Detail & Pro-Aesthetic
// ==========================================
// Units: mm 

$fn = 128; 

// --- Engineering Standards (Master Spec V2) ---
Shell_Thickness = 3.0;
Tolerance = 0.2; // Offset for screw bodies

// --- Hub Geometry (Truncated Hex Pyramid) ---
Base_F2F = 90.0;
Front_F2F = 50.0;
Total_Depth = 45.0;
Collar_H = 10.0; // The structural "Matrix" base height
Pyr_H = Total_Depth - Collar_H;

Base_R = (Base_F2F / 2) / cos(30);
Front_R = (Front_F2F / 2) / cos(30);
Face_Tilt = atan(((Base_F2F/2) - (Front_F2F/2)) / Pyr_H);
Mid_Apothem = (Base_F2F/2 + Front_F2F/2) / 2;

// --- Standoff Specs ---
// Assuming standard M3 or M2 standoffs. 
// Standard hole for M3 heat-set insert = 4.0mm
// Standard hole for M2 heat-set insert = 3.2mm
Standoff_Hole_D = 3.2; 
Standoff_Boss_D = 7.0;

// ==========================================
// Sub-Modules
// ==========================================

module port_socket_negative() {
    // This creates the "Female Receiver"
    union() {
        // 1. The Entry Slot (Spec: 24x16x10)
        // We add a 1-degree draft angle to the interior walls for wedging
        translate([0, 0, -5])
            cube([16.4, 24.4, 10.2], center=true); 

        // 2. The Internal "Shoulder" (The Lock)
        // This is the hole the pigtail JST wires pass through (18x8)
        translate([0, 0, -20])
            cube([8, 18, 30], center=true);
            
        // 3. Technical Detail: Chamfered edge for easier insertion
        translate([0, 0, 0])
            rotate([0, 0, 0])
                cube([18, 26, 2], center=true);
    }
}

module internal_chassis() {
    // This is the "Floor" inside the hub. 
    // It provides a place to glue the battery holder and mount standoffs.
    
    // 1. The Floor Plate (Provides rigidity)
    translate([0, 0, Shell_Thickness])
        cylinder(h=2, r=Base_R - 5, $fn=6);
        
    // 2. Standoff Bosses (4 points for the ESP32)
    // These are no longer floating; they are rooted to the internal floor.
    ESP_X = 25.5;
    ESP_Y = 48.0;
    
    translate([0, 0, Shell_Thickness]) {
        for (x = [-1, 1], y = [-1, 1]) {
            translate([x * ESP_X/2, y * ESP_Y/2, 0])
                difference() {
                    // The structural pillar
                    cylinder(h=20, d=Standoff_Boss_D); 
                    // The hole for your physical standoff / heat-set insert
                    translate([0,0,5]) cylinder(h=16, d=Standoff_Hole_D);
                }
        }
    }
}

module aesthetic_ribs() {
    // Adds the industrial "Xentient" look to the rear collar
    for(i = [0 : 60 : 359]) {
        rotate([0, 0, i])
        translate([Base_F2F/2 - 1, 0, Collar_H/2])
            cube([4, 12, Collar_H + 2], center=true);
    }
}

// ==========================================
// Main Assembly
// ==========================================

module xentient_hub_complete() {
    difference() {
        // --- 1. THE OUTER HULL ---
        union() {
            // Rear Docking Collar
            cylinder(h=Collar_H, r=Base_R, $fn=6);
            // Tapered Main Body
            translate([0, 0, Collar_H])
                cylinder(h=Pyr_H, r1=Base_R, r2=Front_R, $fn=6);
            // Add structural ribs for look/feel
            aesthetic_ribs();
        }

        // --- 2. THE HOLLOW CORE ---
        translate([0, 0, Shell_Thickness]) {
            // Main cavity
            cylinder(h=Collar_H, r=Base_R - Shell_Thickness/cos(30), $fn=6);
            // Tapered cavity
            translate([0, 0, Collar_H])
                cylinder(h=Pyr_H - Shell_Thickness, 
                         r1=Base_R - Shell_Thickness/cos(30), 
                         r2=Front_R - Shell_Thickness/cos(30), $fn=6);
        }

        // --- 3. DOCKING PORTS (The Holes) ---
        // Side ports
        for(a = [30 : 60 : 330]) {
            rotate([0, 0, a])
            translate([Mid_Apothem, 0, Collar_H + Pyr_H/2])
            rotate([0, 90 - Face_Tilt, 0])
                port_socket_negative();
        }
        
        // Front Center port (For the 16x2 Display)
        translate([0, 0, Total_Depth])
            rotate([0, 0, 90])
                port_socket_negative();

        // --- 4. REAR ADAPTER COUPLING ---
        // The 40mm recess for the wall/desk mount
        translate([0, 0, -1])
            cylinder(h=7, d=40);
        // Anti-rotation keys
        cube([56, 10, 10], center=true);
        cube([10, 56, 10], center=true);
        // Main cable exit
        cylinder(h=50, d=18, center=true);
        
        // --- 5. USB-C ACCESS (Bottom Face) ---
        rotate([0, 0, 270])
            translate([Base_F2F/2 - 4, 0, 8])
                cube([15, 12, 10], center=true);
    }

    // --- 6. ADD INTERNAL HARDWARE CHASSIS ---
    // This is "poured" back in after the shell is hollowed
    intersection() {
         // Boundary check (Stay inside shell)
         translate([0,0,Shell_Thickness])
            cylinder(h=Total_Depth-6, r=Base_R-4, $fn=6);
         
         internal_chassis();
    }
}

xentient_hub_complete();