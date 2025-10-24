class BotManager {
    constructor() {
        this.bots = new Map(); // key: botName, value: { password: string, actionUrl: string | null, color: string }
    }

    join(botName, password, color) {
        if (this.bots.has(botName)) {
            throw new Error(`Bot ${botName} already exists`);
        }
        this.bots.set(botName, { password, actionUrl: null, color });
    }

    setActionUrl(botName, password, actionUrl) {
        const bot = this.bots.get(botName);
        if (!bot) {
            throw new Error(`Bot ${botName} not found`);
        }
        if (password === process.env.HOST_PASSWORD || password === bot.password) {
            bot.actionUrl = actionUrl;
        } else {
            throw new Error('Invalid password');
        }
    }

    getActiveBots() {
        return Array.from(this.bots.keys());
    }

    getBot(botName) {
        return this.bots.get(botName);
    }

    removeBot(botName) {
        this.bots.delete(botName);
    }
}

module.exports = BotManager;
