class GameConfig {
    constructor() {
        this.tickDuration = 600; // ms
        this.tankSpeedTicks = 2; // move every 2 ticks
        this.bulletSpeedTicks = 1;
        this.fieldWidth = 15;
        this.fieldHeight = 15;
        this.maxTicks = 120;
        this.actionTimeout = 1000; // ms
        this.fogRadius = 20;
        this.obstacles = false;
        this.powerUpSpawnChance = 0.017; // 1.7%
        this.powerUpDuration = 30; // ticks
    }
}

module.exports = GameConfig;
