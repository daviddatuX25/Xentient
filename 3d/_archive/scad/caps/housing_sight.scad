// ==========================================
// Xentient Framework - Housing 5: Sight (ESP32-CAM)
// Articulated ball-joint head with lens cutout
// ==========================================
// Component: ESP32-CAM-MB dual-board (40×27mm)
// Connection: 4-pin JST XH pigtail (UART: VCC, GND, TX, RX)
// Socket: 30° face (high visibility, clear line of sight)
// Per Framework §4 Housing 5
// IMPORTANT: Thin wall (<1.5mm) near WiFi antenna trace
// IMPORTANT: UART2 remap to GPIO2(TX)/GPIO12(RX) per hardware validation
// Units: mm

include <sleds.scad>;

$fn = 64;

// ==========================================
// COMPONENT DIMENSIONS
// ==========================================

CAM_Board_W  = 27.0;   // ESP32-CAM-MB board width
CAM_Board_H  = 40.0;   // ESP32-CAM-MB board height (dual-board)
CAM_Board_T  = 1.6;    // PCB thickness
CAM_Lens_D   = 8.0;    // OV2640 lens diameter
CAM_Ant_W    = 12.0;   // WiFi antenna trace width
CAM_Ant_H    = 8.0;    // WiFi antenna trace height

// Ball joint dimensions
Ball_R       = 8.0;    // Ball radius
Socket_R     = Ball_R + 1.5;  // Socket radius (1.5mm wall)
Socket_Depth = Ball_R * 0.7;  // Socket depth (captures ~70% of ball)
Artic_Range  = 25;     // Degrees of articulation each direction

// Housing dimensions
Head_W       = 32.0;   // Camera head width (27mm board + walls)
Head_H       = 45.0;   // Camera head height (40mm board + lens)
Head_D       = 14.0;   // Camera head depth
House_Wall   = 2.0;    // Standard wall
Ant_Wall     = 1.2;    // Thin wall near antenna (CRITICAL)

// ==========================================
// MODULE: housing_sight()
// Sled → Neck → Ball Socket → Camera Head
// ==========================================

module housing_sight() {
    union() {
        // Sled base with flange
        male_sled_with_flange(flange_w=3.0, flange_h=3.0, flange_t=2.5);

        // Neck from sled to ball socket
        translate([0, 0, Sled_D]) {
            difference() {
                // Neck body
                hull() {
                    translate([0, 0, 1])
                        cube([Sled_H + 4, Sled_W + 4, 2], center=true);
                    translate([0, 0, 12])
                        cylinder(h=4, d=Socket_R * 2, $fn=32);
                }
                // Wire channel through neck
                translate([0, 0, -1])
                    cube([Sled_Wire_H, Sled_Wire_W, 20], center=true);
            }

            // Ball socket base (on top of neck)
            translate([0, 0, 12]) {
                difference() {
                    // Socket housing
                    sphere(r=Socket_R, $fn=32);
                    // Ball cutout (concave)
                    sphere(r=Ball_R + 0.3, $fn=32);  // 0.3mm clearance
                    // Opening for head to rotate
                    translate([0, 0, Socket_R])
                        cube([Ball_R * 2 + 2, Ball_R * 2 + 2, Socket_R * 2], center=true);
                    // Wire channel through socket
                    translate([0, 0, -Socket_R])
                        cylinder(h=Socket_R * 2, d=Sled_Wire_H, $fn=16);
                }
            }
        }
    }
}

// ==========================================
// MODULE: camera_head()
// Separate print — snaps onto ball joint
// Per Framework: Male Sled terminates in Ball Joint.
// Camera housing features the Socket.
// This module is the camera head with ball on back.
// ==========================================

module camera_head() {
    difference() {
        union() {
            // Camera head body
            cube([Head_W, Head_H, Head_D], center=true);

            // Ball on back face (mates with socket on sled)
            translate([0, 0, -Head_D/2 - Ball_R + 1])
                sphere(r=Ball_R, $fn=32);
        }

        // Inner cavity (board + wiring)
        translate([0, 2, 0])
            cube([CAM_Board_W + 0.4, CAM_Board_H + 0.4, Head_D - 2*House_Wall], center=true);

        // Lens cutout (front face)
        translate([0, 4, Head_D/2])
            cylinder(h=House_Wall + 2, d=CAM_Lens_D + 0.3, center=true, $fn=32);

        // WiFi antenna zone — THIN WALL (CRITICAL: <1.5mm on outer face)
        // Cut a pocket behind the antenna area, leaving only Ant_Wall
        // thickness on the outer (Y+) face for WiFi signal transparency
        translate([0, Head_H/2 - Ant_Wall - 1, 0])
            cube([CAM_Ant_W + 0.4, House_Wall, Head_D + 0.4], center=true);

        // Wire channel from board area to ball
        translate([0, -5, -Head_D/2 - Ball_R])
            cylinder(h=Ball_R + Head_D/2, d=Sled_Wire_H, $fn=16);

        // M2 screw holes for board mounting (2 holes, top)
        for (sx = [-1, 1]) {
            translate([sx * (CAM_Board_W/2 - 3), -Head_H/2 + 5, 0])
                cylinder(h=Head_D + 2, d=2.4, center=true, $fn=16);
        }
    }
}

// ==========================================
// RENDER
// For testing: show both parts
// housing_sight() is the sled+socket (prints attached to hub)
// camera_head() is the head+ball (prints separately)
// ==========================================

// Render socket side (attached to sled)
housing_sight();

// Render camera head offset for visualization
%translate([0, 0, 35]) rotate([0, 180, 0]) camera_head();