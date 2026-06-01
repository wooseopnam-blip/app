/**
 * LG Electronics Teams Expense Automation System
 * Core Express & WebSocket Server Backend
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'expenses.json');

// --- Express Middlewares ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Utility Functions for JSON DB ---
function readDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify([]));
            return [];
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data || '[]');
    } catch (err) {
        console.error('Error reading database file:', err);
        return [];
    }
}

function writeDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Error writing to database file:', err);
        return false;
    }
}

// --- WebSocket Broadcast Helper ---
function broadcast(messageObject, senderWs = null) {
    const payload = JSON.stringify(messageObject);
    wss.clients.forEach(client => {
        if (client !== senderWs && client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// --- REST API Routing ---

// 1. GET: Load all expenses
app.get('/api/expenses', (req, res) => {
    const db = readDatabase();
    res.json(db);
});

// 2. POST: Append a new expense record
app.post('/api/expenses', (req, res) => {
    const newItem = req.body;
    if (!newItem || !newItem.id) {
        return res.status(400).json({ success: false, error: 'Invalid expense data' });
    }

    const db = readDatabase();
    
    // Check duplication
    if (db.some(x => x.id === newItem.id)) {
        return res.status(409).json({ success: false, error: 'Record already exists' });
    }

    db.push(newItem);
    if (writeDatabase(db)) {
        // Broadcast addition to other online clients
        broadcast({
            type: 'ADD',
            payload: newItem,
            timestamp: Date.now()
        });
        res.status(201).json({ success: true, payload: newItem });
    } else {
        res.status(500).json({ success: false, error: 'Failed to write DB file' });
    }
});

// 3. PUT: Update an existing expense record
app.put('/api/expenses/:id', (req, res) => {
    const id = req.params.id;
    const updatedItem = req.body;
    
    if (!updatedItem) {
        return res.status(400).json({ success: false, error: 'Invalid expense data' });
    }

    const db = readDatabase();
    const idx = db.findIndex(x => x.id === id);
    
    if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Record not found' });
    }

    // Merge/replace item choosing the newest details
    db[idx] = {
        ...db[idx],
        ...updatedItem,
        updatedAt: Date.now()
    };

    if (writeDatabase(db)) {
        // Broadcast update to other online clients
        broadcast({
            type: 'UPDATE',
            payload: db[idx],
            timestamp: Date.now()
        });
        res.json({ success: true, payload: db[idx] });
    } else {
        res.status(500).json({ success: false, error: 'Failed to write DB file' });
    }
});

// 4. DELETE: Remove an expense record by ID
app.delete('/api/expenses/:id', (req, res) => {
    const id = req.params.id;
    const db = readDatabase();
    const idx = db.findIndex(x => x.id === id);

    if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Record not found' });
    }

    db.splice(idx, 1);
    
    if (writeDatabase(db)) {
        // Broadcast deletion to other online clients
        broadcast({
            type: 'DELETE',
            payload: { id },
            timestamp: Date.now()
        });
        res.json({ success: true, message: 'Record deleted successfully' });
    } else {
        res.status(500).json({ success: false, error: 'Failed to write DB file' });
    }
});

// 5. DELETE ALL: Clear entire database
app.delete('/api/expenses', (req, res) => {
    if (writeDatabase([])) {
        // Broadcast clear event to other online clients
        broadcast({
            type: 'CLEAR',
            timestamp: Date.now()
        });
        res.json({ success: true, message: 'All records cleared successfully' });
    } else {
        res.status(500).json({ success: false, error: 'Failed to clear DB file' });
    }
});

// --- WebSocket Event Handlers ---
wss.on('connection', (ws) => {
    console.log('New client connected to real-time sync channel.');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            // Broadcast client-sent messages directly (e.g. customized actions)
            broadcast(data, ws);
        } catch (err) {
            console.error('Failed to parse incoming WebSocket message:', err);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected from real-time sync channel.');
    });
});

// --- Start the Server ---
server.listen(PORT, () => {
    console.log(`LG Expense System server is running on http://localhost:${PORT}`);
});
