// ==========================================
// Xentient Framework - Main Node Module V3
// Scaled: 140mm base, 65mm height, stack zoning
// ==========================================
// Print: PETG, 0.2mm layers, 45° overhangs (support-free)
// Bed: Base (140mm F2F) flat on bed, rear face down
// Units: mm

$fn = 128;

// ==========================================
// 1. MASTER PARAMETERS
// ==========================================

// --- Hub Shell (Truncated Hex Pyramid) ---
Base_F2F    = 140.0;
Front_F2F   = 60.0;
Total_Depth = 65.0;
Collar_H    = 12.0;
Shell_T     = 3.0;

// Derived geometry
Base_R    = (Base_F2F / 2) / cos(30);     // 80.83
Front_R   = (Front_F2F / 2) / cos(30);    // 34.64
Pyr_H     = Total_Depth - Collar_H;        // 53
Base_Apo  = Base_F2F / 2;                  // 70
Front_Apo = Front_F2F / 2;                 // 30
Face_Tilt = atan((Base_Apo - Front_Apo) / Pyr_H);  // ~37.1 deg

// Inner cavity
Inner_Base_R  = Base_R - Shell_T / cos(30);    // ~77.37
Inner_Front_Z = Total_Depth - Shell_T;          // Z=62
Outer_R_at_62  = Base_R + (Front_R - Base_R) * (Inner_Front_Z - Collar_H) / Pyr_H;
Inner_Front_R2 = Outer_R_at_62 - Shell_T / cos(30);  // ~32.17

// --- Universal Socket Pocket ---
Port_W       = 24.4;    // Male sled width + 0.4mm tolerance
Port_H       = 16.4;    // Male sled height + 0.4mm tolerance
Port_D       = 15.0;    // Pocket depth (wall swells here)
WireCh_W     = 18.0;    // Wire channel width
WireCh_H     = 8.0;     // Wire channel height
Mounting_Lip = 2.0;     // Internal flange for JST-breakout PCB
Breakout_W   = 30.0;    // JST-breakout PCB width
Breakout_H   = 20.0;    // JST-breakout PCB height
Sleeve_Wall  = 2.0;     // Pocket sleeve wall thickness

// --- Battery Holder (18650 single cell) ---
BH_L       = 78.0;     // Battery holder length
BH_W       = 22.0;     // Battery holder width
BH_H       = 19.0;     // Battery holder height
BH_Clear   = 0.2;      // Clearance

// --- Master Board (120x80mm solder board) ---
Board_L    = 120.0;
Board_W    = 80.0;
Board_SoX  = 110.0;    // Standoff span X (80mm board width, ~110mm along length)
Board_SoY  = 70.0;     // Standoff span Y (120mm board length, ~70mm along width)

// --- ESP32-WROOM-32 Dev Board ---
ESP_BoardL  = 55.0;
ESP_BoardW  = 28.0;
ESP_SoX     = 22.0;
ESP_SoY     = 48.0;
ESP_SoH     = 20.0;    // Standoff pillar height

// --- Fastener specs ---
M3_Hole   = 3.2;   // M3 heat-set insert hole
M3_Boss   = 5.0;   // Slim M3 boss
M2_Hole   = 2.4;   // M2 screw body
M2_Boss   = 4.0;   // Slim M2 boss (spec says 4mm)

// --- Power Modules ---
TP4056_L  = 25.0;  TP4056_W = 19.0;  TP4056_H = 10.0;
MT3608_L  = 37.0;  MT3608_W = 22.0;  MT3608_H = 10.0;
LDO_L     = 12.0;  LDO_W    = 8.0;   LDO_H    = 5.0;
Clip_T    = 1.5;   Clip_Clear = 0.2;

// --- Rear Anchor ---
Anchor_Dia = 40.0;
Anchor_Dep = 6.0;
Anchor_Key = 10.0;

// --- Ventilation ---
Vent_N      = 4;       // Slits per face set
Vent_W      = 2.0;     // Slit width
Vent_Spc    = 6.0;     // Slit spacing
Wall_Thick  = Shell_T / cos(30);  // ~3.46mm

// --- USB-C Cutout ---
USB_W = 12.0;   // V3 spec: 12mm (was 14mm)
USB_H = 6.0;

// --- LCD Display ---
LCD_W       = 71.0;
LCD_H       = 26.0;
LCD_D       = 15.0;
LCD_Mount_X = 32.0;
LCD_Mount_Y = 12.0;

// ==========================================
// 3. SOCKET POCKET NEGATIVE (cuts opening through wall + sleeve)
// ==========================================

module socket_pocket_negative() {
    draft_off = Port_D * tan(1.0);  // 1 deg draft

    // Main pocket passage (Port_H is vertical, Port_W is horizontal)
    hull() {
        translate([0, 0, 0.5])
            cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 1], center=true);
        translate([0, 0, -Port_D + 0.5])
            cube([Port_H, Port_W, 1], center=true);
    }

    // Wire pass-through (continues past pocket into cavity)
    translate([0, 0, -Port_D/2 - 10])
        cube([WireCh_H, WireCh_W, 20], center=true);

    // 45 deg entry chamfer
    chamfer_z = 1.5;
    translate([0, 0, chamfer_z / 2])
        hull() {
            cube([Port_H + 2*chamfer_z, Port_W + 2*chamfer_z, 0.1], center=true);
            cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 0.1], center=true);
        }

    // Breakout PCB mounting lip recesses (2mm flange, 30x20mm PCB)
    // Cut screw holes for M2 at corners of 30x20 breakout
    bp_w = Breakout_W - 4;  // screw span width
    bp_h = Breakout_H - 4;  // screw span height
    translate([0, 0, -Port_D])
        for (sx = [-1, 1], sy = [-1, 1]) {
            translate([sx * bp_w/2, sy * bp_h/2, 0])
                cylinder(h=Mounting_Lip + 1, d=M2_Hole, $fn=24);
        }
}

// ==========================================
// 4. SOCKET POCKET SLEEVE (positive: adds pocket depth)
// ==========================================

module socket_pocket_sleeve() {
    // Positive boss extending inward from inner wall surface
    // Creates the 15mm deep recessed pocket for the male sled
    // Wall swells from 3mm to 15mm only at socket locations

    draft_off = Port_D * tan(1.0);

    difference() {
        // Outer sleeve body (24.4 + 2*2 = 28.4mm wide, 16.4 + 2*2 = 20.4mm tall)
        hull() {
            translate([0, 0, 0.5])
                cube([Port_H + 2*Sleeve_Wall + 2*draft_off,
                      Port_W + 2*Sleeve_Wall + 2*draft_off, 1], center=true);
            translate([0, 0, -Port_D + 0.5])
                cube([Port_H + 2*Sleeve_Wall, Port_W + 2*Sleeve_Wall, 1], center=true);
        }

        // Inner passage (matches pocket opening with draft)
        hull() {
            translate([0, 0, 0.5])
                cube([Port_H + 2*draft_off, Port_W + 2*draft_off, 1], center=true);
            translate([0, 0, -Port_D + 0.5])
                cube([Port_H, Port_W, 1], center=true);
        }

        // Wire channel opening at the back of the sleeve
        translate([0, 0, -Port_D])
            cube([WireCh_H, WireCh_W, 4], center=true);

        // Breakout PCB mounting lip (2mm flange recess)
        // This creates a shelf for the 30x20 JST-breakout PCB
        translate([0, 0, -Port_D + Mounting_Lip/2])
            cube([Breakout_W, Breakout_H, Mounting_Lip], center=true);
    }
}