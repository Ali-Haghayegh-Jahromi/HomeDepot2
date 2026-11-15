#!/usr/bin/env python3
"""Writes the seed SQL from the item list below and the store layout:
    init/02_store_items.sql       100 fake but realistic items
    init/03_shelf_locations.sql   a robot stop + light position for every aisle/bay

Run:  python3 database/build_seed.py      (from the homedepot folder)
The generated SQL files are already included; re-run only after editing items.
"""
import os
import sys
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'store'))
import layout  # noqa: E402

# (aisle, bay, category, tier, brand, name, price, description, specs)
# tier: good / better / best = the same kind of item at rising price and quality
ITEMS = [
    # ---- Aisle 1: Lumber & Decking
    (1, 1, 'stud lumber', 'good', 'Generic', '2 in. x 4 in. x 8 ft. Kiln-Dried Whitewood Stud', 3.98,
     'Framing stud for interior walls and simple indoor projects.', 'indoor; untreated; 1.5 x 3.5 in actual; 8 ft'),
    (1, 2, 'stud lumber', 'better', 'WeatherShield', '2 in. x 4 in. x 8 ft. Pressure-Treated Southern Yellow Pine', 5.48,
     'Treated lumber for outdoor framing and ground contact.', 'outdoor; pressure-treated; ground contact; 8 ft'),
    (1, 5, 'deck board', 'good', 'WeatherShield', '5/4 in. x 6 in. x 8 ft. Pressure-Treated Decking Board', 8.97,
     'Standard wood deck board for replacing a rotten or cracked board.', 'outdoor; pressure-treated pine; 1 x 5.5 in actual; 8 ft'),
    (1, 6, 'deck board', 'best', 'Trex', '1 in. x 6 in. x 8 ft. Composite Deck Board, Saddle', 21.98,
     'Low-maintenance composite board; no staining, will not rot or splinter.', 'outdoor; composite; 25-year warranty; 8 ft'),
    (1, 10, 'plywood', 'better', 'Generic', '1/2 in. x 4 ft. x 8 ft. Sanded Plywood', 34.98,
     'Smooth plywood sheet for shelves, cabinets and subfloor patches.', 'indoor; sanded one side; 4 x 8 ft'),

    # ---- Aisle 2: Building Materials
    (2, 3, 'drywall patch', 'good', 'DAP', '4 in. x 4 in. Self-Adhesive Drywall Repair Patch', 4.98,
     'Stick-on mesh patch for small holes such as doorknob dents.', 'holes up to 3 in; needs joint compound or spackle'),
    (2, 3, 'drywall patch', 'better', '3M', 'Large Hole Wall Repair Kit with 8 fl. oz. Compound', 14.98,
     'All-in-one kit: patch, compound, putty knife and sanding pad.', 'holes up to 5 in; includes tools'),
    (2, 4, 'joint compound', 'good', 'USG Sheetrock', '1 qt. All-Purpose Pre-Mixed Joint Compound', 7.48,
     'Ready-to-use compound for taping and patching drywall.', 'indoor; pre-mixed; 1 quart'),
    (2, 5, 'drywall tape', 'better', 'FibaTape', '1-7/8 in. x 180 ft. Self-Adhesive Mesh Drywall Tape', 6.98,
     'Sticky mesh tape; easier for beginners on flat seams and cracks.', 'self-adhesive; mould-resistant'),
    (2, 9, 'concrete', 'good', 'Quikrete', '60 lb. Concrete Mix', 4.98,
     'Just add water. For slabs, steps and setting posts.', 'outdoor; sets in 24-48 h; 4000 psi'),
    (2, 10, 'concrete', 'better', 'Quikrete', '50 lb. Fast-Setting Concrete Mix', 7.48,
     'Sets in 20-40 minutes; pour dry into the post hole and add water.', 'outdoor; no mixing; for fence and mailbox posts'),

    # ---- Aisle 3: Fasteners
    (3, 1, 'wood screws', 'good', 'Everbilt', '#8 x 1-1/4 in. Phillips Flat-Head Wood Screws (100-Pack)', 6.47,
     'General-purpose zinc wood screws for indoor projects.', 'indoor; zinc; Phillips #2 drive; 1-1/4 in'),
    (3, 2, 'wood screws', 'better', 'GRK', '#8 x 2 in. Star-Drive Multi-Purpose Screws (100-Pack)', 12.97,
     'Self-starting screws that rarely strip or split wood; no pilot hole.', 'indoor/outdoor; coated; Torx T-25 bit included'),
    (3, 3, 'deck screws', 'good', 'Grip-Rite', '#9 x 2-1/2 in. Coated Exterior Deck Screws (1 lb.)', 9.97,
     'Coated screws for fastening deck boards and outdoor lumber.', 'outdoor; coated; Phillips #2; about 75 screws'),
    (3, 4, 'deck screws', 'better', 'Deckmate', '#9 x 3 in. Star-Drive Tan Deck Screws (1 lb.)', 11.97,
     'Star drive resists stripping; approved for treated lumber.', 'outdoor; coated; Torx T-25 bit included'),
    (3, 4, 'deck screws', 'best', 'Grip-Rite', '#10 x 2-1/2 in. 305 Stainless Steel Deck Screws (1 lb.)', 21.98,
     'Stainless steel will not rust or stain; best near water or for cedar.', 'outdoor; stainless; star drive'),
    (3, 5, 'drywall screws', 'good', 'Grip-Rite', '#6 x 1-1/4 in. Coarse-Thread Drywall Screws (1 lb.)', 6.98,
     'For hanging 1/2 in. drywall on wood studs.', 'indoor; phosphate; Phillips #2; bugle head'),
    (3, 7, 'wall anchors', 'good', 'Everbilt', '#6-#8 Ribbed Plastic Anchors with Screws (50-Pack)', 5.98,
     'Light-duty anchors for hanging small items on drywall.', 'holds up to 20 lb; needs 3/16 in drill bit'),
    (3, 7, 'wall anchors', 'better', 'E-Z Ancor', '75 lb. Self-Drilling Drywall Anchors with Screws (25-Pack)', 8.98,
     'Screw straight into drywall with a screwdriver; no drill needed.', 'holds up to 75 lb; drywall only'),
    (3, 8, 'wall anchors', 'best', 'TOGGLER', '1/4 in. Snaptoggle Heavy-Duty Toggle Bolts (10-Pack)', 14.98,
     'For heavy items such as TVs and shelves on hollow walls.', 'holds up to 238 lb in 1/2 in drywall; needs 1/2 in drill bit'),
    (3, 13, 'concrete screws', 'better', 'Tapcon', '3/16 in. x 1-3/4 in. Hex-Head Concrete Anchors (25-Pack)', 10.98,
     'Screws for fastening into concrete, brick or block.', 'drill bit included; needs hammer drill'),

    # ---- Aisle 4: Hand Tools
    (4, 1, 'screwdriver', 'good', 'Stanley', '6-Piece Screwdriver Set', 9.97,
     'Basic Phillips and slotted screwdrivers for household jobs.', '3 Phillips, 3 slotted'),
    (4, 1, 'screwdriver', 'better', 'Husky', '10-Piece Screwdriver Set with Magnetic Tips', 19.97,
     'Comfort grips and magnetic tips; lifetime warranty.', '5 Phillips, 5 slotted'),
    (4, 2, 'screwdriver', 'best', 'Klein Tools', '11-in-1 Ratcheting Multi-Bit Screwdriver', 27.97,
     'One driver with Phillips, slotted, square and star bits plus nut drivers.', 'ratcheting; includes Torx T-15/T-25'),
    (4, 3, 'hammer', 'good', 'Stanley', '16 oz. Fiberglass Claw Hammer', 9.98,
     'All-round hammer for nails and light demolition.', '16 oz; curved claw'),
    (4, 4, 'hammer', 'best', 'Estwing', '16 oz. Solid Steel Claw Hammer with Shock-Reduction Grip', 29.98,
     'One-piece forged steel; lasts a lifetime.', '16 oz; made in USA'),
    (4, 5, 'tape measure', 'good', 'Stanley', '25 ft. PowerLock Tape Measure', 9.98,
     'Classic tape measure for everyday measuring.', '25 ft; 1 in blade'),
    (4, 7, 'utility knife', 'good', 'Husky', 'Folding Lock-Back Utility Knife', 7.98,
     'For cutting drywall, caulk, carpet and boxes.', 'quick blade change; 5 blades included'),
    (4, 9, 'wrench', 'good', 'Husky', '10 in. Adjustable Wrench', 12.98,
     'One wrench for nuts and bolts of many sizes; common for plumbing nuts.', 'opens to 1-1/4 in'),
    (4, 11, 'stud finder', 'better', 'Zircon', 'StudSensor Electronic Stud Finder', 19.97,
     'Finds the wood studs behind drywall for safe mounting.', 'detects up to 3/4 in deep; 9 V battery not included'),
    (4, 12, 'putty knife', 'good', 'Anvil', '2 in. Flexible Putty Knife', 3.98,
     'For spreading spackle and joint compound on small repairs.', '2 in; flexible steel blade'),
    (4, 12, 'putty knife', 'better', 'Husky', '6 in. Stainless Steel Drywall Taping Knife', 9.98,
     'Wider knife to feather compound smoothly over patches.', '6 in; stainless'),

    # ---- Aisle 5: Power Tools
    (5, 1, 'cordless drill', 'good', 'Ryobi', 'ONE+ 18V Cordless 3/8 in. Drill/Driver Kit with Battery and Charger', 69.00,
     'Entry-level drill for drilling holes and driving screws around the home.', '18 V; 1.5 Ah battery; 3/8 in chuck'),
    (5, 2, 'cordless drill', 'better', 'DeWalt', '20V MAX Cordless 1/2 in. Drill/Driver Kit with 2 Batteries', 99.00,
     'Stronger, lighter drill with two batteries; a solid all-rounder.', '20 V; 2 x 1.3 Ah; 1/2 in chuck'),
    (5, 3, 'cordless drill', 'best', 'Milwaukee', 'M18 FUEL Brushless 1/2 in. Hammer Drill/Driver Kit', 199.00,
     'Professional drill that also drills concrete and brick.', '18 V; brushless; hammer mode; 2 x 5.0 Ah'),
    (5, 5, 'drill bits', 'good', 'Ryobi', 'Black Oxide Drill Bit Set (14-Piece)', 9.97,
     'Bits for wood, plastic and soft metal.', '1/16 to 3/8 in'),
    (5, 5, 'drill bits', 'better', 'DeWalt', 'Titanium Nitride Drill Bit Set (21-Piece)', 24.97,
     'Longer-lasting bits for wood, metal and plastic.', '1/16 to 1/2 in; pilot point'),
    (5, 6, 'driver bits', 'good', 'DeWalt', 'Screwdriving Bit Set (40-Piece)', 14.97,
     'Phillips, slotted, square and star bits for a drill or driver.', 'includes Phillips #2, Torx T-25, magnetic holder'),
    (5, 6, 'drill bits', 'better', 'Bosch', 'Carbide Masonry Drill Bit Set (5-Piece)', 12.97,
     'For drilling into concrete, brick and tile grout.', '3/16 to 1/2 in; use with hammer drill'),
    (5, 9, 'circular saw', 'good', 'Ryobi', '13 Amp Corded 7-1/4 in. Circular Saw', 59.00,
     'For straight cuts in lumber, deck boards and plywood.', 'corded; 7-1/4 in blade included'),

    # ---- Aisle 6: Door & Cabinet Hardware
    (6, 1, 'door hinge', 'good', 'Everbilt', '3-1/2 in. Satin Nickel Door Hinge, 5/8 in. Radius', 3.98,
     'Replacement hinge for a standard interior door.', '3-1/2 in; 5/8 in radius corners; screws included'),
    (6, 1, 'door hinge', 'better', 'Everbilt', '3-1/2 in. Satin Nickel Door Hinges, 5/8 in. Radius (3-Pack)', 9.98,
     'Three matching hinges: enough for one door.', '3-1/2 in; screws included'),
    (6, 3, 'door knob', 'good', 'Defiant', 'Brandywine Satin Nickel Passage Door Knob', 12.97,
     'Non-locking knob for hallways and closets.', 'fits 1-3/8 to 1-3/4 in doors'),
    (6, 4, 'door knob', 'better', 'Kwikset', 'Juno Satin Nickel Keyed Entry Door Knob', 32.97,
     'Locking knob for exterior doors; can be re-keyed.', 'SmartKey; fits standard doors'),
    (6, 5, 'deadbolt', 'best', 'Schlage', 'B60 Single-Cylinder Deadbolt, Satin Nickel', 39.98,
     'High-security deadbolt for front and back doors.', 'ANSI Grade 1; fits standard doors'),

    # ---- Aisle 7: Electrical
    (7, 1, 'outlet', 'good', 'Leviton', '15 Amp Tamper-Resistant Duplex Outlet, White', 1.98,
     'Standard replacement wall outlet.', '15 A; 125 V; tamper-resistant'),
    (7, 2, 'outlet', 'best', 'Leviton', '15 Amp Self-Test GFCI Outlet, White', 17.98,
     'Shock-protection outlet required in kitchens, bathrooms and outdoors.', '15 A; self-testing; wall plate included'),
    (7, 3, 'light switch', 'good', 'Leviton', '15 Amp Single-Pole Toggle Light Switch, White', 1.28,
     'Standard replacement light switch.', 'single-pole (one switch controls the light)'),
    (7, 4, 'light switch', 'best', 'Lutron', 'Diva LED+ Dimmer Switch, White', 24.98,
     'Dims LED and incandescent bulbs.', 'single-pole or 3-way; 150 W LED'),
    (7, 5, 'wall plate', 'good', 'Leviton', '1-Gang Duplex Outlet Wall Plate, White', 0.78,
     'Cover plate for a standard outlet.', 'screw included'),
    (7, 7, 'wire connectors', 'good', 'Ideal', 'Assorted Wire Connectors (100-Pack)', 6.48,
     'Twist-on connectors for joining electrical wires.', 'orange, yellow and red sizes'),
    (7, 7, 'electrical tape', 'good', '3M', 'Scotch 3/4 in. x 66 ft. Vinyl Electrical Tape, Black', 2.98,
     'Insulates wire connections.', 'rated 600 V'),
    (7, 9, 'voltage tester', 'better', 'Klein Tools', 'Non-Contact Voltage Tester Pen', 17.97,
     'Checks that the power is off before you touch a wire.', '50-1000 V AC; batteries included'),

    # ---- Aisle 8: Lighting
    (8, 1, 'light bulb', 'good', 'EcoSmart', '60-Watt Equivalent A19 LED Bulbs, Soft White (4-Pack)', 6.97,
     'Everyday bulb for lamps and ceiling fixtures.', '2700 K; non-dimmable; E26 base'),
    (8, 2, 'light bulb', 'better', 'Philips', '60-Watt Equivalent A19 Dimmable LED Bulbs, Daylight (8-Pack)', 15.97,
     'Dimmable, bright white bulbs.', '5000 K; dimmable; E26 base'),
    (8, 5, 'ceiling light', 'good', 'Hampton Bay', '11 in. LED Flush-Mount Ceiling Light, Brushed Nickel', 24.97,
     'Replacement fixture for hallways and bedrooms.', 'integrated LED; 3000 K; hardware included'),

    # ---- Aisle 9: Plumbing
    (9, 1, 'thread seal tape', 'good', 'Everbilt', '1/2 in. x 520 in. PTFE Thread Seal Tape', 1.48,
     'Wrap on pipe threads to stop leaks.', 'for water lines; white'),
    (9, 3, 'pvc pipe', 'good', 'Charlotte Pipe', '1/2 in. x 10 ft. PVC Schedule 40 Pipe', 4.28,
     'Cold-water supply and irrigation pipe.', '1/2 in; schedule 40; cold water only'),
    (9, 4, 'pvc fitting', 'good', 'Charlotte Pipe', '1/2 in. PVC Schedule 40 90-Degree Elbow', 0.68,
     'Joins two 1/2 in. PVC pipes at a right angle.', 'slip x slip; needs primer and cement'),
    (9, 4, 'pvc cement', 'good', 'Oatey', 'PVC Primer and Cement Handy Pack (4 oz. each)', 9.98,
     'Primer and glue for joining PVC pipe and fittings.', 'for PVC up to 6 in'),
    (9, 5, 'push fitting', 'best', 'SharkBite', '1/2 in. Push-to-Connect Brass Coupling', 8.98,
     'Joins copper, PEX or CPVC pipe with no glue or solder.', '1/2 in; removable; rated 200 psi'),
    (9, 7, 'supply line', 'good', 'Everbilt', '3/8 in. Compression x 1/2 in. FIP x 20 in. Braided Faucet Supply Line', 7.98,
     'Connects a faucet to the shut-off valve under the sink.', '20 in; braided stainless'),
    (9, 9, 'toilet repair', 'good', 'Korky', '2 in. Universal Toilet Flapper', 6.98,
     'Fixes a toilet that runs or leaks into the bowl.', 'fits most 2 in flush valves'),
    (9, 9, 'toilet repair', 'better', 'Fluidmaster', '400A Universal Toilet Fill Valve', 9.98,
     'Fixes a toilet that fills slowly, hisses or will not stop filling.', 'adjustable 9-14 in'),
    (9, 10, 'toilet repair', 'best', 'Fluidmaster', 'Complete Toilet Repair Kit (Fill Valve, Flapper, Handle, Bolts)', 21.98,
     'Replaces every working part inside the tank.', 'fits most 2 in toilets'),
    (9, 11, 'drain auger', 'better', 'Ridgid', '1/4 in. x 25 ft. Drain Auger (Snake)', 19.98,
     'Clears sink, tub and shower clogs a plunger cannot.', '25 ft; for 3/4 to 1-1/2 in drains'),
    (9, 13, 'p-trap', 'good', 'Everbilt', '1-1/2 in. White Plastic Sink P-Trap', 6.48,
     'Replaces a leaking or corroded drain trap under a kitchen sink.', '1-1/2 in; slip-joint nuts and washers included'),

    # ---- Aisle 10: Kitchen & Bath
    (10, 1, 'kitchen faucet', 'good', 'Glacier Bay', 'Single-Handle Standard Kitchen Faucet, Chrome', 59.00,
     'Affordable replacement kitchen faucet.', '1 or 3 holes; supply lines not included'),
    (10, 2, 'kitchen faucet', 'better', 'Moen', 'Adler Single-Handle Pull-Down Sprayer Kitchen Faucet, Stainless', 149.00,
     'Pull-down sprayer with a limited lifetime warranty.', '1 or 3 holes; supply lines included'),
    (10, 3, 'kitchen faucet', 'best', 'Delta', 'Leland Touch2O Pull-Down Kitchen Faucet, Stainless', 329.00,
     'Touch on/off, magnetic docking sprayer.', '1 or 3 holes; battery powered touch'),
    (10, 5, 'bathroom faucet', 'good', 'Glacier Bay', '4 in. Centerset 2-Handle Bathroom Faucet, Chrome', 39.00,
     'Replacement faucet for a standard bathroom sink.', '4 in centerset; drain included'),
    (10, 7, 'faucet repair', 'good', 'Moen', '1225 Single-Handle Faucet Replacement Cartridge', 19.98,
     'Stops a dripping Moen single-handle faucet.', 'fits Moen single-handle faucets'),
    (10, 9, 'shower head', 'good', 'Glacier Bay', '3-Spray 3.5 in. Fixed Shower Head, Chrome', 12.98,
     'Simple screw-on shower head replacement.', '1.8 GPM; needs thread seal tape'),

    # ---- Aisle 11: Paint
    (11, 1, 'interior paint', 'good', 'Glidden', 'Essentials 1 gal. White Flat Interior Paint', 19.98,
     'Budget paint for ceilings and low-traffic rooms.', 'interior; flat; covers 400 sq ft'),
    (11, 2, 'interior paint', 'better', 'Behr', 'Premium Plus 1 gal. Ultra Pure White Eggshell Interior Paint & Primer', 32.98,
     'Everyday wall paint that wipes clean.', 'interior; eggshell; low odor'),
    (11, 3, 'interior paint', 'best', 'Behr', 'Marquee 1 gal. Ultra Pure White Satin Interior Paint & Primer', 55.98,
     'One-coat coverage, most durable and stain-resistant.', 'interior; satin; one-coat guarantee'),
    (11, 5, 'primer', 'good', 'Kilz', '2 All-Purpose 1 gal. Interior/Exterior Primer', 21.98,
     'Primer for new drywall, patches and stains before painting.', 'water-based; dries in 1 h'),
    (11, 7, 'exterior paint', 'better', 'Behr', 'Premium Plus 1 gal. White Satin Exterior Paint & Primer', 39.98,
     'For siding, trim and fences.', 'exterior; satin; mildew-resistant'),
    (11, 10, 'deck stain', 'better', 'Behr', '1 gal. Cedar Naturaltone Transparent Waterproofing Deck Stain', 39.98,
     'Protects and colours deck boards and fences.', 'exterior; one coat; 4-year protection'),

    # ---- Aisle 12: Paint Supplies, Adhesives & Safety
    (12, 1, 'paint brush', 'good', 'HDX', '2 in. Angled Polyester Paint Brush', 3.97,
     'Disposable-grade brush for small jobs.', '2 in; for latex paint'),
    (12, 1, 'paint brush', 'better', 'Wooster', '2 in. Shortcut Angled Sash Brush', 7.97,
     'Short handle for cutting in around trim.', '2 in; for latex paint'),
    (12, 2, 'paint brush', 'best', 'Purdy', '2-1/2 in. XL Glide Angled Sash Brush', 16.97,
     'Professional brush; smooth finish, lasts for years.', '2.5 in; for all paints'),
    (12, 3, 'paint roller', 'good', 'HDX', '9 in. Paint Roller Kit with Tray (5-Piece)', 11.97,
     'Roller, two covers, tray and brush for painting walls.', '9 in; 3/8 in nap for smooth walls'),
    (12, 4, 'paint roller', 'better', 'Purdy', '9 in. x 3/8 in. White Dove Roller Covers (3-Pack)', 14.97,
     'Lint-free covers for a smooth wall finish.', '9 in; 3/8 in nap'),
    (12, 5, 'painters tape', 'good', 'ScotchBlue', '1.41 in. x 60 yd. Original Painter\'s Tape', 6.98,
     'Masks trim and edges; removes cleanly.', '14-day clean removal'),
    (12, 5, 'painters tape', 'better', 'FrogTape', '1.41 in. x 60 yd. Multi-Surface Painter\'s Tape', 8.98,
     'Sharper paint lines with no bleed.', '21-day clean removal'),
    (12, 6, 'drop cloth', 'good', 'HDX', '9 ft. x 12 ft. Plastic Drop Cloth', 2.98,
     'Protects floors and furniture from paint and dust.', 'single use'),
    (12, 7, 'sandpaper', 'good', '3M', 'Assorted Grit Sandpaper Sheets, 9 in. x 11 in. (5-Pack)', 5.97,
     'For smoothing wood, patches and paint.', '60, 100, 150 and 220 grit'),
    (12, 7, 'sandpaper', 'better', '3M', 'Fine/Medium Sanding Sponge', 4.47,
     'Easy to hold; ideal for sanding wall patches.', 'washable and reusable'),
    (12, 8, 'spackle', 'good', 'DAP', 'DryDex 1/2 pt. Spackling with Dry-Time Indicator', 5.98,
     'Fills nail holes and small dents; turns white when dry.', 'holes up to 3/4 in; sandable; paintable'),
    (12, 8, 'wood filler', 'good', 'Minwax', '6 oz. Stainable Wood Filler', 7.98,
     'Fills holes and gouges in wood.', 'indoor/outdoor; stainable; sandable'),
    (12, 9, 'caulk', 'good', 'DAP', 'Alex Plus 10.1 oz. White Acrylic Latex Caulk Plus Silicone', 3.48,
     'Paintable caulk for trim, baseboards and window frames.', 'indoor/outdoor; paintable; needs caulk gun'),
    (12, 9, 'caulk', 'better', 'GE', 'Supreme Silicone 10.1 oz. White Kitchen and Bath Caulk', 10.98,
     'Waterproof, mould-resistant sealant for tubs, showers and sinks.', '100% silicone; not paintable; needs caulk gun'),
    (12, 10, 'caulk gun', 'good', 'HDX', '10 oz. Smooth-Rod Caulk Gun', 5.98,
     'Basic gun for standard caulk and adhesive tubes.', 'fits 10 oz cartridges'),
    (12, 10, 'caulk gun', 'better', 'Newborn', '10 oz. Dripless Smooth-Rod Caulk Gun', 14.98,
     'Stops flowing when you release the trigger; less mess.', 'fits 10 oz cartridges; built-in cutter'),
    (12, 11, 'wood glue', 'good', 'Titebond', 'Titebond II 8 oz. Premium Wood Glue', 5.98,
     'Strong water-resistant glue for wood joints and loose chair legs.', 'indoor/outdoor; clamps 30 min'),
    (12, 11, 'construction adhesive', 'good', 'Liquid Nails', '10 oz. Heavy-Duty Construction Adhesive', 4.98,
     'Bonds wood, drywall, masonry and trim.', 'indoor/outdoor; needs caulk gun'),
    (12, 13, 'safety glasses', 'good', '3M', 'Clear Anti-Scratch Safety Glasses', 3.97,
     'Eye protection for drilling, sawing and sanding.', 'ANSI Z87.1'),
    (12, 14, 'work gloves', 'good', 'Firm Grip', 'General-Purpose Work Gloves, Large', 9.98,
     'Hand protection for lumber, concrete and demolition.', 'size large; touchscreen fingertips'),
    (12, 15, 'dust mask', 'good', '3M', 'N95 Sanding and Fiberglass Respirators (10-Pack)', 14.97,
     'Protects lungs from sanding dust and insulation.', 'N95; disposable'),
]


def sql(value):
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return str(value)


def main():
    assert len(ITEMS) == 100, f'{len(ITEMS)} items, expected 100'
    rows, seen = [], set()
    for n, (aisle, shelf, category, tier, brand, name, price, description, specs) in enumerate(ITEMS, 1):
        layout.bay(aisle, shelf)                        # checks that the aisle/bay exists
        full_name = name if brand == 'Generic' else f'{brand} {name}'
        assert full_name not in seen, full_name
        seen.add(full_name)
        number = 100003 + n * 7919 % 899000             # distinct 6-digit numbers
        sku = f'{number // 1000:03d}-{number % 1000:03d}'
        tag_code = f'TAG-{aisle:02d}{shelf:02d}-{n:03d}'
        url = 'https://www.homedepot.com/s/' + quote(full_name)
        rows.append('  (' + ', '.join(sql(v) for v in (
            sku, full_name, url, price, aisle, shelf, tag_code, layout.DEPARTMENTS[aisle],
            category, brand, tier, description, specs)) + ')')
    assert len({r.split(',')[0] for r in rows}) == 100, 'duplicate SKU'

    with open(os.path.join(HERE, 'init', '02_store_items.sql'), 'w') as f:
        f.write('-- Generated by database/build_seed.py: 100 fake but realistic items.\n'
                'INSERT INTO store_items (sku, item_name, item_url, price, aisle, shelf, tag_code, department,\n'
                '                         category, brand, quality_tier, description, specs) VALUES\n')
        f.write(',\n'.join(rows) + ';\n')

    with open(os.path.join(HERE, 'init', '03_shelf_locations.sql'), 'w') as f:
        f.write('-- Generated by database/build_seed.py from store/layout.py: where the robot stops for\n'
                '-- each aisle + shelf (bay), facing it, and where that bay\'s tag light is (map frame, m).\n'
                'INSERT INTO shelf_locations (aisle, shelf, x, y, yaw, light_x, light_y, light_z) VALUES\n')
        f.write(',\n'.join(
            f"  ({a}, {s}, {p['x']}, {p['y']}, {p['yaw']}, {p['light_x']}, {p['light_y']}, {p['light_z']})"
            for a, s, p in layout.all_bays()) + ';\n')
    print('wrote 100 items and', len(layout.all_bays()), 'shelf locations')


if __name__ == '__main__':
    main()
