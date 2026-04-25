// ==========================================
// Xentient Framework - Main Node Module V2
// Corrected parametric model based on:
//   Framework-for-designing.md V2, HARDWARE.md, WIRING.md
// ==========================================
// Print: PETG, 0.2mm layers, 45° overhangs (support-free)
// Bed: Base (90mm F2F) flat on bed, front face up
// Units: mm

$fn = 128;

// ==========================================
// 1. MASTER PARAMETERS
// ==========================================

// --- Hub Shell (Truncated Hex Pyramid) ---
Base_F2F    = 90.0;     // Rear flat-to-flat
Front_F2F   = 50.0;     // Front flat-to-flat
Total_Depth = 45.0;     // Hub depth
Collar_H    = 10.0;     // Rear structural band height
Shell_T     = 3.0;      // Wall thickness (PETG minimum)

// Derived geometry
Base_R    = (Base_F2F / 2) / cos(30);     // 51.96 circumradius
Front_R   = (Front_F2F / 2) / cos(30);   // 28.87 circumradius
Pyr_H     = Total_Depth - Collar_H;       // 35 pyramid height
Base_Apo  = Base_F2F / 2;                 // 45 apothem at base
Front_Apo = Front_F2F / 2;               // 25 apothem at front
Face_Tilt = atan((Base_Apo - Front_Apo) / Pyr_H);  // ~29.7 taper

// --- Universal Port Socket (Female Receiver) ---
// Framework §2: 24x16x10mm entry, 1° draft, 18x8mm wire channel
Port_W      = 24.0;    // Socket width (horizontal)
Port_H      = 16.0;    // Socket height (vertical)
Port_D      = 10.0;    // Socket depth (into hub)
Draft_Deg   = 1.0;     // Draft angle for friction wedging
WireCh_W    = 18.0;    // Wire channel width
WireCh_H    = 8.0;    // Wire channel height

// --- Male Sled (reference, not modeled) ---
// Sled_W = 23.6 (Port_W - 0.4mm friction fit)
// Sled_H = 15.6 (Port_H - 0.4mm friction fit)

// --- Battery Holder (single 18650 plastic clip-in) ---
// Cell: 65x18mm | Holder body: ~53x25x19mm
BH_L       = 53.0;     // Holder length
BH_W       = 25.0;     // Holder width
BH_H       = 19.0;     // Holder height
BH_Clear   = 0.2;      // Clearance per side

// --- ESP32-WROOM-32 Dev Board ---
// Transverse mount: long axis (55mm) across hub width
ESP_BoardL  = 55.0;    // Board length
ESP_BoardW  = 28.0;    // Board width
ESP_SoX     = 25.5;    // Standoff half-spacing X
ESP_SoY     = 24.0;    // Standoff half-spacing Y
ESP_SoH     = 10.0;    // Standoff pillar height (reduced from v1's 18mm)
M2_Hole     = 3.2;     // M2 heat-set insert bore
M2_Boss     = 6.0;     // Boss outer diameter

// --- Power Modules (clip-in on Zone C floor) ---
TP4056_L  = 25.0;  TP4056_W = 19.0;  TP4056_H = 10.0;
MT3608_L  = 37.0;  MT3608_W = 22.0;  MT3608_H = 10.0;
LDO_L     = 12.0;  LDO_W    = 8.0;   LDO_H    = 5.0;
Clip_T    = 1.5;   Clip_Clear = 0.2;

// --- Rear Anchor ---
Anchor_Dia = 40.0;     // Pocket diameter
Anchor_Dep = 6.0;      // Pocket depth
Anchor_Key = 10.0;     // Anti-rotation cross-key width

// --- Hardware ---
M3_Insert = 4.2;       // M3 heat-set insert bore
M3_Boss   = 7.0;       // Boss outer diameter

// --- Ventilation ---
Vent_N   = 4;          // Slits per collar face
Vent_W   = 2.0;        // Slit width
Vent_Spc = 6.0;        // Center-to-center spacing

// --- USB-C Cutout ---
USB_W = 14.0;          // USB-C port width
USB_H = 6.0;           // USB-C port height

// ==========================================
// 2. PORT SOCKET
// ==========================================

module port_socket_negative() {
    // Universal Female Receiver per Framework §2
    // Entry: 24W x 16H x 10D mm, 1° draft for friction wedging
    // Wire channel: 18W x 8H mm pass-through for JST pigtail
    // Entry chamfer: 1mm 45° for easy sled insertion

    draft_off = Port_D * tan(Draft_Deg); // ~0.175mm per side

    // Entry slot with draft (wider at face, narrows inward)
    hull() {
        // Opening face (at hub surface, slightly wider)
        translate([0, 0, 0.5])
            cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 1], center=true);
        // Bottom of slot (exact spec, tighter)
        translate([0, 0, -Port_D + 0.5])
            cube([Port_H, Port_W, 1], center=true);
    }

    // Wire pass-through channel (extends deep into hub cavity)
    translate([0, 0, -Port_D/2 - 12])
        cube([WireCh_H, WireCh_W, 24], center=true);

    // Entry chamfer (1mm 45°) for easy sled insertion
    translate([0, 0, 1.0])
        hull() {
            cube([Port_H + 2, Port_W + 2, 0.1], center=true);
            cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 0.1], center=true);
        }
}

// ==========================================
// 3. BATTERY HOLDER CRADLE (Zone A)
// ==========================================

module battery_cradle() {
    // Zone A: Cradle for single 18650 plastic clip-in holder
    // Positioned at rear/widest section, centered on Y axis
    // Holder sits on internal floor with alignment lips
    // Hot-glue for final securement per HARDWARE.md

    pL = BH_L + 2*BH_Clear;  // 53.4mm
    pW = BH_W + 2*BH_Clear;  // 25.4mm
    lip_h = 3.0;  // Alignment lip height

    // Floor recess (2mm deep pocket for holder base alignment)
    translate([0, 0, -1])
        cube([pL, pW, 2], center=true);

    // Alignment lips — long sides (prevent Y-axis sliding)
    for (s = [-1, 1]) {
        translate([0, s * (pW/2 + Clip_T/2), lip_h/2 - 1])
            cube([pL + 2*Clip_T, Clip_T, lip_h], center=true);
    }
    // Alignment lips — short sides (prevent X-axis sliding)
    for (s = [-1, 1]) {
        translate([s * (pL/2 + Clip_T/2), 0, lip_h/2 - 1])
            cube([Clip_T, pW + 2*Clip_T, lip_h], center=true);
    }

    // Wire exit channel (battery leads → TP4056 area)
    // Exits from the positive-terminal end of the holder
    translate([pL/2 + 5, 0, -1])
        cube([12, WireCh_H - 2, 4], center=true);
}

// ==========================================
// 4. ESP32 STANDOFFS (Zone B)
// ==========================================

module esp32_standoffs() {
    // Zone B: 4x M2 heat-set insert standoffs
    // Board mounted transversely (55mm across hub width)
    // 10mm standoff height gives board clearance above battery

    for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * ESP_SoX/2, sy * ESP_SoY/2, 0])
            difference() {
                // Structural pillar
                cylinder(h=ESP_SoH, d=M2_Boss, $fn=32);
                // M2 heat-set insert hole (drilled from top)
                translate([0, 0, ESP_SoH * 0.35])
                    cylinder(h=ESP_SoH * 0.65 + 1, d=M2_Hole, $fn=32);
            }
    }

    // Anti-rotation nub (small key near one standoff)
    // Prevents board from rotating on the standoffs
    translate([ESP_SoX/2 + 2, -3, 0])
        cube([2, 6, 3]);
}

// ==========================================
// 5. POWER MODULE SLOTS (Zone C)
// ==========================================

module power_module_clip(mod_L, mod_W, mod_H) {
    // Clip-in retainer for power modules (TP4056, MT3608, LDO)
    // Module sits on floor surface, held by alignment walls
    // Two retaining clips on long sides (flex-fit)

    cL = mod_L/2 + Clip_Clear;
    cW = mod_W/2 + Clip_Clear;

    // Alignment walls — long sides
    for (s = [-1, 1]) {
        translate([0, s * (cW + Clip_T/2), mod_H/4])
            cube([mod_L + 2*Clip_Clear + 2*Clip_T, Clip_T, mod_H/2], center=true);
    }
    // Alignment walls — short sides
    for (s = [-1, 1]) {
        translate([s * (cL + Clip_T/2), 0, mod_H/4])
            cube([Clip_T, mod_W + 2*Clip_Clear + 2*Clip_T, mod_H/2], center=true);
    }

    // Floor recess (2mm deep, aligns module base)
    translate([0, 0, -1])
        cube([mod_L + 2*Clip_Clear, mod_W + 2*Clip_Clear, 2], center=true);
}

module power_module_pocket(mod_L, mod_W, mod_H) {
    // Negative pocket cut into floor for module recess
    cube([mod_L + 2*Clip_Clear, mod_W + 2*Clip_Clear, mod_H + 2*Clip_Clear], center=true);
}

// ==========================================
// 6. WIRE ROUTING (internal channels in floor)
// ==========================================

module wire_channels_positive() {
    // Raised channel walls that guide wires along the floor
    // Main trunk: Zone A (battery) → Zone C (TP4056) → Zone B (ESP32)

    // Trunk channel along Y axis (battery → power modules → ESP32)
    translate([0, 0, 1])
        cube([6, 38, 2], center=true);

    // Branch channels toward each side port's JST header
    port_Z = Collar_H + Pyr_H * 0.5;
    port_apo = Base_Apo - (Base_Apo - Front_Apo) * ((port_Z - Collar_H) / Pyr_H);

    for (a = [30 : 60 : 330]) {
        rotate([0, 0, a])
            translate([port_apo * 0.35, 0, 1])
                cube([port_apo * 0.4, 6, 2], center=true);
    }

    // Branch toward front center port (LCD I2C)
    translate([0, 0, port_Z * 0.4])
        cube([6, 6, 2], center=true);
}

// ==========================================
// 7. REAR ANCHOR
// ==========================================

module rear_anchor_negative() {
    // Rear universal anchor: 40mm Ø, 6mm deep
    // Cross-keys for anti-rotation + central cable exit
    // Accepts Wall Plate or Desk Pedestal adapter

    // Main pocket
    translate([0, 0, -1])
        cylinder(h=Anchor_Dep + 1, d=Anchor_Dia, $fn=64);

    // Anti-rotation cross-keys (2 perpendicular slots)
    for (a = [0, 90]) {
        rotate([0, 0, a])
            translate([0, -Anchor_Key/2, -1])
                cube([Anchor_Dia/2 + 2, Anchor_Key, Anchor_Dep + 1]);
    }

    // Central cable exit (USB-C through wall mount)
    translate([0, 0, -10])
        cylinder(h=30, d=15, $fn=32);
}

// ==========================================
// 8. VENTILATION
// ==========================================

module ventilation_negative() {
    // Vent slits through collar wall for heat dissipation
    // Critical: MAX98357A amp generates heat, needs airflow
    // 45° chamfered to print support-free

    for (i = [0 : Vent_N - 1]) {
        y_off = (i - (Vent_N - 1)/2) * Vent_Spc;
        translate([0, y_off, Collar_H - 4])
            rotate([0, 90, 0])
                hull() {
                    // Outer face (wider, chamfer)
                    translate([0, 0, Shell_T + 1])
                        cube([Vent_W + 1, Vent_W + 1, 0.1], center=true);
                    // Inner face (narrower)
                    translate([0, 0, -1])
                        cube([Vent_W, Vent_W, 0.1], center=true);
                };
    }
}

// ==========================================
// 9. MAIN ASSEMBLY
// ==========================================

module xentient_hub_v2() {

    // ---- Port placement calculations ----
    port_Z = Collar_H + Pyr_H * 0.5;  // Midpoint of taper
    port_apo = Base_Apo - (Base_Apo - Front_Apo) * ((port_Z - Collar_H) / Pyr_H);

    // Internal cavity radii
    inner_r_base = Base_R - Shell_T / cos(30);   // ~48.4
    inner_r_front = Front_R - Shell_T / cos(30);  // ~25.4

    union() {
        // ====== PART 1: HOLLOWED SHELL WITH CUTOUTS ======
        difference() {
            // Outer hull (solid)
            union() {
                // Rear docking collar
                cylinder(h=Collar_H, r=Base_R, $fn=6);
                // Tapered main body
                translate([0, 0, Collar_H])
                    cylinder(h=Pyr_H, r1=Base_R, r2=Front_R, $fn=6);
                // Aesthetic structural ribs on collar
                for (i = [0 : 60 : 359]) {
                    rotate([0, 0, i])
                        translate([Base_F2F/2 - 1, 0, Collar_H/2])
                            cube([4, 12, Collar_H + 2], center=true);
                }
            }

            // Hollow core (main internal cavity)
            translate([0, 0, Shell_T]) {
                cylinder(h=Collar_H, r=inner_r_base, $fn=6);
                translate([0, 0, Collar_H])
                    cylinder(h=Pyr_H - Shell_T,
                             r1=inner_r_base,
                             r2=inner_r_front, $fn=6);
            }

            // 6x Side port sockets (perimeter sensor housings)
            // Angles: 30, 90, 150, 210, 270, 330 (hex face normals)
            // Suggested assignments:
            //   30°  = Sight (ESP32-CAM) — high visibility
            //   90°  = Speak (MAX98357A) — near USB-C vent
            //   150° = Climate (BME280) — away from heat
            //   210° = Motion (PIR) — detection height
            //   270° = Listen (INMP441) — opposite speaker
            //   330° = Reserved
            for (a = [30 : 60 : 330]) {
                rotate([0, 0, a])
                    translate([port_apo, 0, port_Z])
                        rotate([0, 90 - Face_Tilt, 0])
                            port_socket_negative();
            }

            // Front center port (Display / LCD I2C pigtail)
            // Standard 24x16mm socket — Display housing slides in from front
            translate([0, 0, Total_Depth])
                rotate([0, 0, 90])
                    port_socket_negative();

            // Rear anchor pocket
            rear_anchor_negative();

            // USB-C cutout (TP4056 charging access)
            // Positioned on face at 90° to align with TP4056 module
            rotate([0, 0, 90])
                translate([Base_Apo + 1, 0, Collar_H/2])
                    cube([Shell_T + 4, USB_W, USB_H], center=true);

            // Ventilation slits (3 alternating collar faces, not on port faces)
            // Faces at 0°, 120°, 240° (between port faces)
            for (a = [0, 120, 240]) {
                rotate([0, 0, a])
                    translate([Base_Apo, 0, 0])
                        ventilation_negative();
            }
        }

        // ====== PART 2: INTERNAL STRUCTURE ======
        // Added inside the hollowed cavity
        // Constrained to cavity boundary via intersection
        intersection() {
            // Cavity boundary (slightly smaller than actual cavity
            // to prevent internal features from touching shell walls)
            translate([0, 0, Shell_T + 1])
                cylinder(h=Total_Depth - Shell_T - 2,
                         r1=inner_r_base - 2,
                         r2=inner_r_front - 2, $fn=6);

            union() {
                // --- Zone A Floor Plate ---
                translate([0, 0, Shell_T])
                    cylinder(h=2, r=Base_R - 6, $fn=6);

                // --- Zone A: Battery Holder Cradle ---
                // Positioned at rear of cavity (Y = -18), centered on X
                translate([0, -18, Shell_T + 2])
                    battery_cradle();

                // --- Zone B: ESP32 Standoffs ---
                // Forward of battery, centered on X axis
                translate([0, 5, Shell_T + 2])
                    esp32_standoffs();

                // --- Zone C: Power Module Clips ---
                // TP4056: near USB-C cutout (face at 90°)
                translate([0, 20, Shell_T + 2])
                    power_module_clip(TP4056_L, TP4056_W, TP4056_H);

                // MT3608: next to TP4056, offset along X
                translate([-22, 20, Shell_T + 2])
                    power_module_clip(MT3608_L, MT3608_W, MT3608_H);

                // 3.3V LDO: between MT3608 and ESP32
                translate([20, 12, Shell_T + 2])
                    power_module_clip(LDO_L, LDO_W, LDO_H);

                // --- Wire Channel Guides ---
                wire_channels_positive();
            }
        }
    }
}

// ==========================================
// RENDER
// ==========================================

xentient_hub_v2();