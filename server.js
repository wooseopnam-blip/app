/**
 * LG Electronics Teams Expense Automation System
 * Core Express & WebSocket Server Backend with Hybrid Database Support (PostgreSQL / JSON file)
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg'); // PostgreSQL client

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'expenses.json');

// --- Hybrid Database Connection Setup ---
let pool = null;
const isPostgres = !!process.env.DATABASE_URL;

if (isPostgres) {
    console.log('Connecting to cloud PostgreSQL database...');
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false // Required for most cloud hostings like Supabase & Neon
        }
    });

    // Auto-migrate tables on boot
    const initQuery = `
        CREATE TABLE IF NOT EXISTS expenses (
            id VARCHAR(255) PRIMARY KEY,
            date VARCHAR(255) NOT NULL,
            category VARCHAR(255) NOT NULL,
            team VARCHAR(255) NOT NULL,
            session VARCHAR(255) NOT NULL,
            description TEXT,
            username VARCHAR(255) NOT NULL,
            card VARCHAR(255) NOT NULL,
            amount INTEGER NOT NULL,
            status VARCHAR(255) DEFAULT 'unprocessed',
            created_at BIGINT,
            updated_at BIGINT
        );
    `;
    pool.query(initQuery)
        .then(() => console.log('PostgreSQL expenses database table verified.'))
        .catch(err => console.error('Failed to verify PostgreSQL table:', err));
} else {
    console.log('Using local JSON file database fallback (expenses.json)...');
}

// --- Express Middlewares ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Fallback Utility Functions for Local JSON DB ---
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

// --- Hybrid Unified Database APIs ---

async function loadAllExpenses() {
    if (isPostgres) {
        try {
            const res = await pool.query('SELECT * FROM expenses');
            return res.rows.map(row => ({
                id: row.id,
                date: row.date,
                category: row.category,
                team: row.team,
                session: row.session,
                desc: row.description,
                user: row.username,
                card: row.card,
                amount: row.amount,
                status: row.status,
                createdAt: Number(row.created_at),
                updatedAt: Number(row.updated_at)
            }));
        } catch (err) {
            console.error('Failed to query select from PostgreSQL:', err);
            return [];
        }
    } else {
        return readDatabase();
    }
}

async function insertExpense(item) {
    if (isPostgres) {
        try {
            const query = `
                INSERT INTO expenses (id, date, category, team, session, description, username, card, amount, status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `;
            await pool.query(query, [
                item.id,
                item.date,
                item.category,
                item.team,
                item.session,
                item.desc,
                item.user,
                item.card,
                item.amount,
                item.status || 'unprocessed',
                item.createdAt,
                item.updatedAt
            ]);
            return true;
        } catch (err) {
            console.error('Failed to insert record into PostgreSQL:', err);
            return false;
        }
    } else {
        const db = readDatabase();
        if (db.some(x => x.id === item.id)) return false;
        db.push(item);
        return writeDatabase(db);
    }
}

async function updateExpense(id, updatedFields) {
    if (isPostgres) {
        try {
            // Read current to merge fields correctly
            const selectRes = await pool.query('SELECT * FROM expenses WHERE id = $1', [id]);
            if (selectRes.rowCount === 0) return null;
            
            const current = selectRes.rows[0];
            
            const merged = {
                date: updatedFields.date !== undefined ? updatedFields.date : current.date,
                category: updatedFields.category !== undefined ? updatedFields.category : current.category,
                team: updatedFields.team !== undefined ? updatedFields.team : current.team,
                session: updatedFields.session !== undefined ? updatedFields.session : current.session,
                desc: updatedFields.desc !== undefined ? updatedFields.desc : current.description,
                user: updatedFields.user !== undefined ? updatedFields.user : current.username,
                card: updatedFields.card !== undefined ? updatedFields.card : current.card,
                amount: updatedFields.amount !== undefined ? updatedFields.amount : current.amount,
                status: updatedFields.status !== undefined ? updatedFields.status : current.status,
                updatedAt: Date.now()
            };

            const query = `
                UPDATE expenses
                SET date = $1, category = $2, team = $3, session = $4, description = $5, username = $6, card = $7, amount = $8, status = $9, updated_at = $10
                WHERE id = $11
            `;
            await pool.query(query, [
                merged.date,
                merged.category,
                merged.team,
                merged.session,
                merged.desc,
                merged.user,
                merged.card,
                merged.amount,
                merged.status,
                merged.updatedAt,
                id
            ]);
            
            return {
                id,
                ...merged,
                createdAt: Number(current.created_at)
            };
        } catch (err) {
            console.error('Failed to update record in PostgreSQL:', err);
            return null;
        }
    } else {
        const db = readDatabase();
        const idx = db.findIndex(x => x.id === id);
        if (idx === -1) return null;
        
        db[idx] = {
            ...db[idx],
            ...updatedFields,
            updatedAt: Date.now()
        };
        if (writeDatabase(db)) {
            return db[idx];
        }
        return null;
    }
}

async function deleteExpense(id) {
    if (isPostgres) {
        try {
            const res = await pool.query('DELETE FROM expenses WHERE id = $1', [id]);
            return res.rowCount > 0;
        } catch (err) {
            console.error('Failed to delete from PostgreSQL:', err);
            return false;
        }
    } else {
        const db = readDatabase();
        const idx = db.findIndex(x => x.id === id);
        if (idx === -1) return false;
        
        db.splice(idx, 1);
        return writeDatabase(db);
    }
}

async function clearAllExpenses() {
    if (isPostgres) {
        try {
            await pool.query('TRUNCATE TABLE expenses');
            return true;
        } catch (err) {
            console.error('Failed to truncate PostgreSQL table:', err);
            return false;
        }
    } else {
        return writeDatabase([]);
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
app.get('/api/expenses', async (req, res) => {
    const db = await loadAllExpenses();
    res.json(db);
});

// 2. POST: Append a new expense record
app.post('/api/expenses', async (req, res) => {
    const newItem = req.body;
    if (!newItem || !newItem.id) {
        return res.status(400).json({ success: false, error: 'Invalid expense data' });
    }

    const success = await insertExpense(newItem);
    if (success) {
        // Broadcast addition to other online clients
        broadcast({
            type: 'ADD',
            payload: newItem,
            timestamp: Date.now()
        });
        res.status(201).json({ success: true, payload: newItem });
    } else {
        res.status(500).json({ success: false, error: 'Failed to write DB record' });
    }
});

// 3. PUT: Update an existing expense record
app.put('/api/expenses/:id', async (req, res) => {
    const id = req.params.id;
    const updatedItem = req.body;
    
    if (!updatedItem) {
        return res.status(400).json({ success: false, error: 'Invalid expense data' });
    }

    const payload = await updateExpense(id, updatedItem);
    if (payload) {
        // Broadcast update to other online clients
        broadcast({
            type: 'UPDATE',
            payload: payload,
            timestamp: Date.now()
        });
        res.json({ success: true, payload: payload });
    } else {
        res.status(500).json({ success: false, error: 'Failed to write DB record' });
    }
});

// 4. DELETE: Remove an expense record by ID
app.delete('/api/expenses/:id', async (req, res) => {
    const id = req.params.id;
    const success = await deleteExpense(id);

    if (success) {
        // Broadcast deletion to other online clients
        broadcast({
            type: 'DELETE',
            payload: { id },
            timestamp: Date.now()
        });
        res.json({ success: true, message: 'Record deleted successfully' });
    } else {
        res.status(500).json({ success: false, error: 'Failed to write DB record' });
    }
});

// 5. DELETE ALL: Clear entire database
app.delete('/api/expenses', async (req, res) => {
    const success = await clearAllExpenses();
    if (success) {
        // Broadcast clear event to other online clients
        broadcast({
            type: 'CLEAR',
            timestamp: Date.now()
        });
        res.json({ success: true, message: 'All records cleared successfully' });
    } else {
        res.status(500).json({ success: false, error: 'Failed to clear DB database' });
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
