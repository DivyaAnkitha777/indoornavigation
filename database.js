const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'indoor_nav.db');

// Wipe the old database before starting to ensure our new 'floor' schema is applied
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log("Deleted old database. Recreating with new 3-Floor Library schema...");
}

const db = new sqlite3.Database(dbPath);

function initDB() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            name TEXT,
            type TEXT,
            floor INTEGER,
            lat REAL,
            lng REAL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT,
            target TEXT,
            weight REAL,
            FOREIGN KEY(source) REFERENCES nodes(id),
            FOREIGN KEY(target) REFERENCES nodes(id)
        )`);

        db.get("SELECT COUNT(*) as count FROM nodes", (err, row) => {
            if (row && row.count === 0) {
                console.log("Seeding Vishnu Institute Block E (Library) GPS database...");
                seedData();
            }
        });
    });
}

function seedData() {
    // We assign different Floors:
    // 0 = Ground, 1 = First Floor, 2 = Second Floor
    
    // GPS coordinates focus around: 16.5660, 81.5218 (Library Area)
    const nodes = [
        // --- OUTDOOR / OTHER BLOCKS ---
        { id: 'main_gate', name: 'Main Gate', type: 'entrance', floor: 0, lat: 16.5650, lng: 81.5220 },
        { id: 'admin', name: 'Block A (Admin)', type: 'block', floor: 0, lat: 16.5655, lng: 81.5222 },
        { id: 'cse_block', name: 'Block B (CSE)', type: 'block', floor: 0, lat: 16.5660, lng: 81.5225 },
        { id: 'canteen', name: 'Canteen', type: 'service', floor: 0, lat: 16.5665, lng: 81.5230 },
        { id: 'block_c', name: 'Block C', type: 'block', floor: 0, lat: 16.5665, lng: 81.5210 },
        
        // --- BLOCK E (LIBRARY) - FLOOR G (0) ---
        { id: 'lib_entrance_g', name: 'Library Entrance (G)', type: 'entrance', floor: 0, lat: 16.56600, lng: 81.52180 },
        { id: 'lib_issue_g', name: 'Library Books Issue Counter (G)', type: 'service', floor: 0, lat: 16.56605, lng: 81.52185 },
        { id: 'lib_stairs_g', name: 'Library Stairs (G)', type: 'stairs', floor: 0, lat: 16.56610, lng: 81.52190 },
        { id: 'lib_elevator_g', name: 'Library Elevator (G)', type: 'elevator', floor: 0, lat: 16.56608, lng: 81.52195 },

        // --- BLOCK E (LIBRARY) - FLOOR I (1) ---
        { id: 'lib_stairs_1', name: 'Library Stairs (I)', type: 'stairs', floor: 1, lat: 16.56610, lng: 81.52190 },
        { id: 'lib_elevator_1', name: 'Library Elevator (I)', type: 'elevator', floor: 1, lat: 16.56608, lng: 81.52195 },
        { id: 'lib_reading_1', name: 'Library - Reading Room (I)', type: 'room', floor: 1, lat: 16.56605, lng: 81.52185 },
        { id: 'lib_corridor_1', name: 'First Floor Corridor', type: 'corridor', floor: 1, lat: 16.56607, lng: 81.52187 },

        // --- BLOCK E (LIBRARY) - FLOOR II (2) ---
        { id: 'lib_stairs_2', name: 'Library Stairs (II)', type: 'stairs', floor: 2, lat: 16.56610, lng: 81.52190 },
        { id: 'lib_elevator_2', name: 'Library Elevator (II)', type: 'elevator', floor: 2, lat: 16.56608, lng: 81.52195 },
        { id: 'lib_digital_2', name: 'Digital Library (II)', type: 'room', floor: 2, lat: 16.56603, lng: 81.52182 },
        { id: 'lib_iesdc_2', name: 'IESDC & Discussion Rooms (II)', type: 'room', floor: 2, lat: 16.56608, lng: 81.52182 }
    ];

    const edges = [
        // Outdoor paths
        { source: 'main_gate', target: 'admin', weight: 80 },
        { source: 'admin', target: 'cse_block', weight: 60 },
        { source: 'admin', target: 'block_c', weight: 100 },
        { source: 'admin', target: 'lib_entrance_g', weight: 40 },
        { source: 'cse_block', target: 'canteen', weight: 50 },
        { source: 'cse_block', target: 'lib_entrance_g', weight: 30 },
        { source: 'block_c', target: 'lib_entrance_g', weight: 50 },

        // Library Floor G paths
        { source: 'lib_entrance_g', target: 'lib_issue_g', weight: 10 },
        { source: 'lib_entrance_g', target: 'lib_stairs_g', weight: 15 },
        { source: 'lib_issue_g', target: 'lib_stairs_g', weight: 12 },
        { source: 'lib_entrance_g', target: 'lib_elevator_g', weight: 20 },

        // Library Stairs & Elevators connections (between floors)
        { source: 'lib_stairs_g', target: 'lib_stairs_1', weight: 30 }, // takes time to go up
        { source: 'lib_stairs_1', target: 'lib_stairs_2', weight: 30 },
        { source: 'lib_elevator_g', target: 'lib_elevator_1', weight: 15 }, // faster, wheelchair friendly
        { source: 'lib_elevator_1', target: 'lib_elevator_2', weight: 15 },

        // Library Floor 1 paths
        { source: 'lib_stairs_1', target: 'lib_corridor_1', weight: 5 },
        { source: 'lib_elevator_1', target: 'lib_corridor_1', weight: 5 },
        { source: 'lib_corridor_1', target: 'lib_reading_1', weight: 10 },

        // Library Floor 2 paths
        { source: 'lib_stairs_2', target: 'lib_iesdc_2', weight: 10 },
        { source: 'lib_stairs_2', target: 'lib_digital_2', weight: 15 },
        { source: 'lib_elevator_2', target: 'lib_iesdc_2', weight: 10 },
        { source: 'lib_digital_2', target: 'lib_iesdc_2', weight: 8 }
    ];

    const stmtNodes = db.prepare("INSERT INTO nodes (id, name, type, floor, lat, lng) VALUES (?, ?, ?, ?, ?, ?)");
    nodes.forEach(n => stmtNodes.run(n.id, n.name, n.type, n.floor, n.lat, n.lng));
    stmtNodes.finalize();

    const stmtEdges = db.prepare("INSERT INTO edges (source, target, weight) VALUES (?, ?, ?)");
    edges.forEach(e => {
        stmtEdges.run(e.source, e.target, e.weight);
        stmtEdges.run(e.target, e.source, e.weight); // Bidirectional
    });
    stmtEdges.finalize();
}

module.exports = { db, initDB };
