const { TableClient } = require('@azure/data-tables');

class AzureStatsStorage {
    constructor(connectionString, tableName) {
        this.tableClient = TableClient.fromConnectionString(connectionString, tableName);
        this.tableName = tableName;
    }

    async initializeTable() {
        try {
            await this.tableClient.createTable();
        } catch (error) {
            if (error.statusCode !== 409) { // Table already exists
                throw error;
            }
        }
    }

    async storeBotStats(tournamentId, gameNumber, botName, totalKills, totalDeaths) {
        const entity = {
            partitionKey: tournamentId,
            rowKey: `${gameNumber}_${botName}`,
            gameNumber: gameNumber,
            botName: botName,
            totalKills: totalKills,
            totalDeaths: totalDeaths
        };

        await this.tableClient.createEntity(entity);
    }

    async storeTournamentStats(tournamentId, gameNumber, bots) {
        const promises = bots.map(bot =>
            this.storeBotStats(tournamentId, gameNumber, bot.name, bot.kills, bot.deaths)
        );
        await Promise.all(promises);
    }
}

module.exports = AzureStatsStorage;
