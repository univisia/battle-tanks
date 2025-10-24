const GameConfig = require('./game-config');

class Game {
    constructor(bots, tournament, io, onComplete) {
        this.bots = bots; // array of {name, color, actionUrl}
        this.tournament = tournament;
        this.io = io;
        this.onComplete = onComplete;
        this.config = new GameConfig();
        this.tanks = []; // {id, x, y, dir, alive, lastMoveTick, hitTime}
        this.bullets = []; // {x, y, dir, owner}
        this.walls = []; // {x, y}
        this.water = []; // {x, y}
        this.powerUps = []; // {x, y, type}
        this.tick = 0;
        this.gameLoopTimeout = null;
        this.nextActions = null;
        this.init();
    }

    init() {
        if (this.config.obstacles) {
            this.generateObstacles();
        }
        // random positions and dirs
        for (let i = 0; i < this.bots.length; i++) {
            let x, y;
            do {
                x = Math.floor(Math.random() * this.config.fieldWidth);
                y = Math.floor(Math.random() * this.config.fieldHeight);
            } while (this.tanks.some(t => t.x === x && t.y === y) || this.walls.some(w => w.x === x && w.y === y) || this.water.some(w => w.x === x && w.y === y));
            const dir = ['N','E','S','W'][Math.floor(Math.random()*4)];
            this.tanks.push({id: i, color: this.bots[i].color, x, y, dir, alive: true, lastMoveTick: -this.config.tankSpeedTicks, powerUp: null});
        }
    }

    generateObstacles() {
        const minDim = Math.min(this.config.fieldWidth, this.config.fieldHeight);
        const maxWidth = Math.floor(minDim / 2);
        for (let i = 0; i < 5; i++) {
            const isHorizontal = Math.random() < 0.5;
            const width = Math.floor(Math.random() * (maxWidth - 2 + 1)) + 2; // 2 to maxWidth
            if (isHorizontal) {
                const y = Math.floor(Math.random() * this.config.fieldHeight);
                const startX = Math.floor(Math.random() * (this.config.fieldWidth - width + 1));
                for (let dx = 0; dx < width; dx++) {
                    this.walls.push({x: startX + dx, y});
                }
            } else {
                const x = Math.floor(Math.random() * this.config.fieldWidth);
                const startY = Math.floor(Math.random() * (this.config.fieldHeight - width + 1));
                for (let dy = 0; dy < width; dy++) {
                    this.walls.push({x, y: startY + dy});
                }
            }
        }
        // Generate water obstacles
        for (let i = 0; i < 5; i++) {
            const isHorizontal = Math.random() < 0.5;
            const width = Math.floor(Math.random() * (maxWidth - 2 + 1)) + 2; // 2 to maxWidth
            if (isHorizontal) {
                const y = Math.floor(Math.random() * this.config.fieldHeight);
                const startX = Math.floor(Math.random() * (this.config.fieldWidth - width + 1));
                for (let dx = 0; dx < width; dx++) {
                    this.water.push({x: startX + dx, y});
                }
            } else {
                const x = Math.floor(Math.random() * this.config.fieldWidth);
                const startY = Math.floor(Math.random() * (this.config.fieldHeight - width + 1));
                for (let dy = 0; dy < width; dy++) {
                    this.water.push({x, y: startY + dy});
                }
            }
        }
    }

    start() {
        this.gameLoop();
    }

    async gameLoop() {
        const start = performance.now();

        if (this.tournament.isPaused()) {
            return;
        }

        if (this.tick >= this.config.maxTicks || this.isGameOver()) {
            this.onComplete();
            return;
        }

        this.tick++;

        if (!this.nextActions) {
            this.nextActions = this.getWaitActions();
        }

        // Bullet moves
        this.moveBullets();

        // Check collisions after bullet moves
        this.checkCollisions();

        // Tank moves
        for (let action of this.nextActions) {
            if (action.action === 'move') {
                this.moveTank(action.id, action.direction);
            }
        }

        // Tank aims
        for (let action of this.nextActions) {
            if (action.action === 'aim') {
                this.aimTank(action.id, action.direction);
            }
        }

        // Tank shoots
        for (let action of this.nextActions) {
            if (action.action === 'shoot') {
                this.shootTank(action.id);
            }
        }

        // Check collisions
        this.checkCollisions();

        this.updatePowerUps();

        // Broadcast state
        this.io.emit('update', this.getState());

        // Get actions every 2 ticks
        const actions = this.tick % 2 === 0 ? await this.getActions() : this.getWaitActions();

        // Randomize order
        this.nextActions = actions.sort(() => Math.random() - 0.5);

        const end = performance.now();
        const spent = end - start;
        const delay = Math.max(0, this.config.tickDuration - spent);
        this.gameLoopTimeout = setTimeout(() => this.gameLoop(), delay);
    }

    updatePowerUps() {
        // Expire power-ups
        this.tanks.forEach(tank => {
            if (tank.powerUp && tank.powerUp.expiry > 0) {
                tank.powerUp.expiry--;
                if (tank.powerUp.expiry === 0) {
                    tank.powerUp = null;
                }
            }
        });
        // Spawn new power-up
        if (Math.random() < this.config.powerUpSpawnChance) {
            const types = ['shield', 'stealth', 'missile'];
            const type = types[Math.floor(Math.random() * types.length)];
            let x, y;
            do {
                x = Math.floor(Math.random() * this.config.fieldWidth);
                y = Math.floor(Math.random() * this.config.fieldHeight);
            } while (this.tanks.some(t => t.x === x && t.y === y) || this.walls.some(w => w.x === x && w.y === y) || this.water.some(w => w.x === x && w.y === y) || this.powerUps.some(p => p.x === x && p.y === y));
            this.powerUps.push({x, y, type});
        }
    }

    getWaitActions() {
        return this.tanks.filter(t => t.alive).map(t => ({ id: t.id, action: 'wait' }));
    }

    async getActions() {
        const aliveTanks = this.tanks.filter(t => t.alive);
        const actionPromises = aliveTanks.map(async (tank) => {
            const bot = this.bots[tank.id];
            const payload = this.getGameState(tank);

            console.log(JSON.stringify(payload));
            
            const fetchPromise = fetch(bot.actionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .catch(() => ({ action: 'wait' }));
            
            const timeoutPromise = new Promise(resolve => {
                setTimeout(() => resolve({ action: 'wait' }), this.config.actionTimeout);
            });
            
            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            // Validate response
            if (typeof response !== 'object' || response === null || !response.action) {
                return { id: tank.id, action: 'wait' };
            }
            const validActions = ['move', 'aim', 'shoot'];
            if (!validActions.includes(response.action)) {
                return { id: tank.id, action: 'wait' };
            }
            if (response.action !== 'shoot') {
                const validDirections = ['N', 'E', 'S', 'W'];
                if (!response.direction || !validDirections.includes(response.direction)) {
                    return { id: tank.id, action: 'wait' };
                }
            }
            
            return { id: tank.id, ...response };
        });
        
        const actions = await Promise.all(actionPromises);
        return actions;
    }

    getGameState(tank) {
        const myTank = {x: tank.x, y: tank.y, dir: tank.dir, color: tank.color, powerUp: tank.powerUp};
        const tanks = this.tanks
            .filter(t => t.id !== tank.id && t.alive && Math.abs(tank.x - t.x) + Math.abs(tank.y - t.y) <= this.config.fogRadius && !(t.powerUp && t.powerUp.type === 'stealth'))
            .map(t => ({x: t.x, y: t.y, dir: t.dir, color: t.color, powerUp: t.powerUp}));
        const bullets = this.bullets
            .filter(b => Math.abs(tank.x - b.x) + Math.abs(tank.y - b.y) <= this.config.fogRadius)
            .map(b => ({x: b.x, y: b.y, dir: b.dir, type: b.type}));
        const walls = this.walls.filter(w => Math.abs(tank.x - w.x) + Math.abs(tank.y - w.y) <= this.config.fogRadius);
        const water = this.water.filter(w => Math.abs(tank.x - w.x) + Math.abs(tank.y - w.y) <= this.config.fogRadius);
        const powerUps = this.powerUps.filter(p => Math.abs(tank.x - p.x) + Math.abs(tank.y - p.y) <= this.config.fogRadius);
        return {myTank, tanks, bullets, walls, water, powerUps};
    }

    moveTank(id, dir) {
        const tank = this.tanks[id];
        if (!tank.alive || this.tick - tank.lastMoveTick < this.config.tankSpeedTicks) return;

        const {x, y} = this.getNewPos(tank.x, tank.y, dir);
        if (this.isValidPos(x, y) && !this.tanks.some(t => t.x === x && t.y === y) && !this.walls.some(w => w.x === x && w.y === y) && !this.water.some(w => w.x === x && w.y === y)) {
            tank.x = x;
            tank.y = y;
            tank.lastMoveTick = this.tick;
            // Check for power-up
            const powerUpIndex = this.powerUps.findIndex(p => p.x === x && p.y === y);
            if (powerUpIndex !== -1) {
                const powerUp = this.powerUps[powerUpIndex];
                tank.powerUp = {type: powerUp.type, expiry: this.config.powerUpDuration};
                this.powerUps.splice(powerUpIndex, 1);
            }
        }
        tank.dir = dir; // aim
    }

    aimTank(id, dir) {
        this.tanks[id].dir = dir;
    }

    shootTank(id) {
        const tank = this.tanks[id];
        const {x, y} = this.getNewPos(tank.x, tank.y, tank.dir);
        if (this.isValidPos(x, y)) {
            const type = (tank.powerUp && tank.powerUp.type === 'missile') ? 'missile' : 'normal';
            this.bullets.push({x, y, dir: tank.dir, owner: id, type});
        }
    }

    moveBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            const {x, y} = this.getNewPos(b.x, b.y, b.dir);
            if (!this.isValidPos(x, y) || this.tanks.some(t => !t.alive && t.x === x && t.y === y) || this.walls.some(w => w.x === x && w.y === b.y)) {
                this.bullets.splice(i, 1);
            } else {
                b.x = x;
                b.y = y;
                if (b.type === 'missile') {
                    const adjacent = [
                        {dx: 0, dy: -1, dir: 'N'},
                        {dx: 0, dy: 1, dir: 'S'},
                        {dx: -1, dy: 0, dir: 'W'},
                        {dx: 1, dy: 0, dir: 'E'}
                    ];
                    for (let adj of adjacent) {
                        const tx = b.x + adj.dx;
                        const ty = b.y + adj.dy;
                        const tank = this.tanks.find(t => t.x === tx && t.y === ty && t.alive && t.id !== b.owner);
                        if (tank) {
                            b.dir = adj.dir;
                            break;
                        }
                    }
                }
            }
        }
    }

    checkCollisions() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            const hitTank = this.tanks.find(t => t.x === b.x && t.y === b.y);
            if (hitTank) {
                if (hitTank.alive && !(hitTank.powerUp && hitTank.powerUp.type === 'shield')) {
                    hitTank.alive = false;
                    this.tournament.updateKills(this.bots[b.owner].name);
                    this.tournament.updateDeaths(this.bots[hitTank.id].name);
                }
                this.bullets.splice(i, 1);
            } else if (this.walls.some(w => w.x === b.x && w.y === b.y)) {
                this.bullets.splice(i, 1);
            }
        }
    }

    isGameOver() {
        if (this.bullets.length > 0) {
            return false;
        }
        const aliveTanks = this.tanks.filter(t => t.alive);
        const colors = aliveTanks.map(t => t.color);
        const uniqueColors = new Set(colors);
        return uniqueColors.size < 2;
    }

    getNewPos(x, y, dir) {
        if (dir === 'N') return {x, y: y-1};
        if (dir === 'S') return {x, y: y+1};
        if (dir === 'E') return {x: x+1, y};
        if (dir === 'W') return {x: x-1, y};
        return {x, y};
    }

    isValidPos(x, y) {
        return x >= 0 && x < this.config.fieldWidth && y >= 0 && y < this.config.fieldHeight;
    }

    getState() {
        return {
            tanks: this.tanks.map(t => ({ ...t })),
            bullets: [...this.bullets],
            walls: [...this.walls],
            water: [...this.water],
            powerUps: [...this.powerUps],
            tick: this.tick,
            bots: this.bots
        };
    }
}

module.exports = Game;
