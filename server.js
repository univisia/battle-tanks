const express = require('express');
const { Server } = require('socket.io');
const BotManager = require('./engine/bot-manager');
const Tournament = require('./engine/tournament');
const crypto = require('crypto');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Serve index.html for root URL
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

const botManager = new BotManager();
let currentTournament = null;
let tournamentActive = false;
const hostTokens = new Set();

// Middleware to check host token
function requireHostAuth(req, res, next) {
    const token = req.headers.authorization;
    if (!token || !hostTokens.has(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}`);
});

const io = new Server(server);

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Endpoint to join the game
app.post('/join', (req, res) => {
    if (tournamentActive) {
        return res.status(403).json({ error: 'Cannot join during an active tournament' });
    }
    const { botName, password, color } = req.body;
    if (!botName || !password || !color) {
        return res.status(400).json({ error: 'botName, password, and color are required' });
    }
    try {
        botManager.join(botName, password, color);
        res.json({ message: `Bot ${botName} joined successfully` });
    } catch (error) {
        res.status(409).json({ error: error.message });
    }
});

// Endpoint to add bot
app.post('/add-bot', requireHostAuth, (req, res) => {
    if (tournamentActive) {
        return res.status(403).json({ error: 'Cannot add bot during an active tournament' });
    }
    const { strategy, color } = req.body;

    // Strategy URLs
    const strategyUrls = {
        attack: process.env.STRATEGY_ATTACK_URL,
        dodge: process.env.STRATEGY_DODGE_URL,
        slow: process.env.STRATEGY_SLOW_URL,
        error: process.env.STRATEGY_ERROR_URL
    }

    if (!strategy || !color) {
        return res.status(400).json({ error: 'Strategy and color are required' });
    }
    const botName = `${strategy} bot ${Math.floor(Math.random() * 1000)}`;
    const password = crypto.randomUUID();
    try {
        botManager.join(botName, password, color);
        botManager.setActionUrl(botName, password, strategyUrls[strategy]);
        res.json({ message: `Bot ${botName} added successfully` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to set action URL
app.put('/set-url', (req, res) => {
    const { botName, password, actionUrl } = req.body;
    if (!botName || !password || !actionUrl) {
        return res.status(400).json({ error: 'botName, password, and actionUrl are required' });
    }
    try {
        botManager.setActionUrl(botName, password, actionUrl);
        if (tournamentActive && currentTournament) {
            currentTournament.updateActionUrl(botName, actionUrl);
        }
        res.json({ message: 'Action URL set successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Endpoint to start a tournament
app.post('/start-tournament', requireHostAuth, (req, res) => {
    if (tournamentActive) {
        return res.status(400).json({ error: 'Tournament already active' });
    }
    const activeBots = botManager.getActiveBots().map(name => ({
        name,
        color: botManager.getBot(name).color,
        actionUrl: botManager.getBot(name).actionUrl
    }));
    currentTournament = new Tournament(activeBots, io);
    tournamentActive = true;
    currentTournament.start();
    res.json({ message: 'Tournament started' });
});

// Endpoint to pause a tournament
app.post('/pause-tournament', requireHostAuth, (req, res) => {
    if (!tournamentActive || !currentTournament) {
        return res.status(400).json({ error: 'No active tournament' });
    }
    currentTournament.pause();
    res.json({ message: 'Tournament paused' });
});

// Endpoint to resume a tournament
app.post('/resume-tournament', requireHostAuth, (req, res) => {
    if (!tournamentActive || !currentTournament) {
        return res.status(400).json({ error: 'No active tournament' });
    }
    currentTournament.resume();
    res.json({ message: 'Tournament resumed' });
});

// Endpoint to stop a tournament
app.post('/stop-tournament', requireHostAuth, (req, res) => {
    if (!tournamentActive || !currentTournament) {
        return res.status(400).json({ error: 'No active tournament' });
    }
    currentTournament.stop();
    tournamentActive = false;
    res.json({ message: 'Tournament stopped' });
});

// Endpoint to get list of active teams
app.get('/teams', (req, res) => {
    const teams = botManager.getActiveTeams().map(name => {
        const bot = botManager.getBot(name);
        return { name, color: bot.color };
    });
    res.json({ teams });
});

// Endpoint to get status
app.get('/status', (req, res) => {
    const bots = botManager.getActiveBots().map(name => {
        const bot = botManager.getBot(name);
        return { name: name, color: bot.color, hasUrl: !!bot.actionUrl };
    });
    const paused = currentTournament ? currentTournament.isPaused() : false;
    res.json({ tournamentActive, bots, paused });
});

// Endpoint to get tournament stats
app.get('/stats', (req, res) => {
    if (!currentTournament) {
        return res.json({ bots: [], gameCounter: 0 });
    }
    res.json({ bots: currentTournament.getStats(), gameCounter: currentTournament.gameCounter });
});

// Endpoint to get current game state
app.get('/game-state', (req, res) => {
    if (!currentTournament || !currentTournament.currentGame) {
        return res.json(null);
    }
    const state = currentTournament.currentGame.getState();
    res.json({ ...state, gameNumber: currentTournament.gameCounter, bots: currentTournament.currentGame.bots });
});

// Endpoint to login with host password
app.post('/login', (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }
    if (password === process.env.HOST_PASSWORD) {
        const token = crypto.randomUUID();
        hostTokens.add(token);
        res.json({ success: true, message: 'Login successful', token });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// Endpoint to remove a bot
app.delete('/remove-bot', requireHostAuth, (req, res) => {
    const { botName } = req.body;
    if (!botName) {
        return res.status(400).json({ error: 'botName is required' });
    }
    try {
        botManager.removeBot(botName);
        res.json({ message: 'Bot removed successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = app;
