const Game = require('./game');
const AzureStatsStorage = require('./azure-stats-storage');

class Tournament {
    constructor(bots, io) {
        // bots: array of {name, color, actionUrl}
        this.bots = bots.map(bot => ({
            name: bot.name,
            color: bot.color,
            actionUrl: bot.actionUrl,
            kills: 0,
            deaths: 0
        }));
        this.gameCounter = 1;
        this.currentGame = null;
        this.io = io;
        this.paused = false;
        this.stopped = false;
        this.id = null;
        this.statsStorage = process.env.AZURE_STORAGE_CONNECTION_STRING ?
            new AzureStatsStorage(process.env.AZURE_STORAGE_CONNECTION_STRING, 'BotStats') : null;
        if (this.statsStorage) {
            this.statsStorage.initializeTable().catch(console.error);
        }
    }

    getStats() {
        return this.bots;
    }

    isPaused() {
        return this.paused;
    }

    updateKills(botName) {
        const bot = this.bots.find(b => b.name === botName);
        if (bot) {
            bot.kills++;
            this.io.emit('stats', { bots: this.bots, gameCounter: this.gameCounter });
        }
    }

    updateDeaths(botName) {
        const bot = this.bots.find(b => b.name === botName);
        if (bot) {
            bot.deaths++;
            this.io.emit('stats', { bots: this.bots, gameCounter: this.gameCounter });
        }
    }

    updateActionUrl(botName, actionUrl) {
        const bot = this.bots.find(b => b.name === botName);
        if (bot) {
            bot.actionUrl = actionUrl;
            this.io.emit('deployment', { gameNumber: this.gameCounter, botName });
        }
    }

    static getTournamentId() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const HH = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return `${yyyy}${MM}${dd}_${HH}${mm}`;
    }

    start() {
        this.id = Tournament.getTournamentId();
        this.paused = false;
        this.stopped = false;
        this.io.emit('stats', { bots: this.bots, gameCounter: this.gameCounter });
        this.playNext();
    }

    pause() {
        this.paused = true;
        if (this.currentGame) {
            // Stop the game loop immediately
            clearTimeout(this.currentGame.gameLoopTimeout);
            this.currentGame.gameLoopTimeout = null;
        }
    }

    resume() {
        this.paused = false;
        if (!this.currentGame) {
            this.playNext();
        } else if (this.currentGame.gameLoopTimeout === null) {
            // Restart the game loop
            this.currentGame.gameLoop();
        }
    }

    stop() {
        this.paused = true;
        this.stopped = true;
        if (this.currentGame) {
            // Stop the game loop immediately
            clearTimeout(this.currentGame.gameLoopTimeout);
            this.currentGame.gameLoopTimeout = null;
            // End the game immediately
            this.onGameComplete();
        }
    }

    playNext() {
        if (this.stopped) return;
        if (this.paused) {
            setTimeout(() => this.playNext(), 1000); // check every second
            return;
        }
        this.currentGame = new Game(this.bots, this, this.io, () => {
            this.onGameComplete();
        });
        this.currentGame.start();
    }

    onGameComplete() {
        const completedGameNumber = this.gameCounter;
        this.gameCounter++;
        this.io.emit('stats', { bots: this.bots, gameCounter: this.gameCounter });
        if (this.statsStorage) {
            this.statsStorage.storeTournamentStats(this.id, completedGameNumber, this.bots).catch(console.error);
        }
        if (!this.stopped) {
            setTimeout(() => this.playNext(), 5000);
        }
    }
}

module.exports = Tournament;