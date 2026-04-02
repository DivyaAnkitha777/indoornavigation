const express = require('express');
const cors = require('cors');
const { db, initDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize Database
initDB();

// API to get all nodes
app.get('/api/nodes', (req, res) => {
    db.all("SELECT * FROM nodes", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// API to get all edges
app.get('/api/edges', (req, res) => {
    db.all("SELECT * FROM edges", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// API to get a specific node by id
app.get('/api/nodes/:id', (req, res) => {
    db.get("SELECT * FROM nodes WHERE id = ?", [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row);
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
