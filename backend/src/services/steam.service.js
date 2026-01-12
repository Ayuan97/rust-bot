import axios from 'axios';
import logger from '../utils/logger.js';

class SteamService {
    constructor() {
        this.apiKey = process.env.STEAM_API_KEY;
        this.baseUrl = 'https://api.steampowered.com';
        this.rustAppId = '252490';

        if (!this.apiKey) {
            logger.warn('⚠️ STEAM_API_KEY is not defined in .env file. Steam integration will not work.');
        }
    }

    /**
     * Get player summaries (avatars, names, etc.)
     * @param {string[]} steamIds Array of SteamID64
     */
    async getPlayerSummaries(steamIds) {
        if (!this.apiKey || !steamIds || steamIds.length === 0) return [];
        try {
            const response = await axios.get(`${this.baseUrl}/ISteamUser/GetPlayerSummaries/v2/`, {
                params: {
                    key: this.apiKey,
                    steamids: steamIds.join(',')
                }
            });
            return response.data?.response?.players || [];
        } catch (error) {
            logger.error('Error fetching Steam player summaries:', error.message);
            return [];
        }
    }

    /**
     * Get player ban status
     * @param {string[]} steamIds Array of SteamID64
     */
    async getPlayerBans(steamIds) {
        if (!this.apiKey || !steamIds || steamIds.length === 0) return [];
        try {
            const response = await axios.get(`${this.baseUrl}/ISteamUser/GetPlayerBans/v1/`, {
                params: {
                    key: this.apiKey,
                    steamids: steamIds.join(',')
                }
            });
            return response.data?.players || [];
        } catch (error) {
            logger.error('Error fetching Steam player bans:', error.message);
            return [];
        }
    }

    /**
     * Get Rust playtime for a specific user
     * @param {string} steamId SteamID64
     */
    async getRustPlaytime(steamId) {
        if (!this.apiKey || !steamId) return null;
        try {
            const response = await axios.get(`${this.baseUrl}/IPlayerService/GetOwnedGames/v1/`, {
                params: {
                    key: this.apiKey,
                    steamid: steamId,
                    include_appinfo: true,
                    'appids_filter[0]': this.rustAppId
                }
            });
            const game = response.data?.response?.games?.find(g => String(g.appid) === this.rustAppId);
            return game ? {
                playtime_forever: game.playtime_forever,
                playtime_2weeks: game.playtime_2weeks || 0
            } : null;
        } catch (error) {
            logger.error(`Error fetching Rust playtime for ${steamId}:`, error.message);
            return null;
        }
    }

    /**
     * Get Rust stats for a specific user
     * @param {string} steamId SteamID64
     */
    async getRustStats(steamId) {
        if (!this.apiKey || !steamId) return null;
        try {
            const response = await axios.get(`${this.baseUrl}/ISteamUserStats/GetUserStatsForGame/v2/`, {
                params: {
                    key: this.apiKey,
                    steamid: steamId,
                    appid: this.rustAppId
                }
            });

            const statsArray = response.data?.playerstats?.stats || [];
            const stats = {};
            statsArray.forEach(s => {
                stats[s.name] = s.value;
            });

            return stats;
        } catch (error) {
            // 403 Forbidden usually means the profile/stats are private
            if (error.response?.status === 403 || error.response?.status === 500) {
                return { private: true };
            }
            logger.error(`Error fetching Rust stats for ${steamId}:`, error.message);
            return null;
        }
    }

    /**
     * Batch refresh all data for a list of teammates
     * @param {string[]} steamIds 
     */
    async getBatchPlayerData(steamIds) {
        if (!this.apiKey || !steamIds || steamIds.length === 0) return [];

        const summaries = await this.getPlayerSummaries(steamIds);
        const bans = await this.getPlayerBans(steamIds);

        // Playtime and Stats are per-user in Steam API
        const detailedData = await Promise.all(steamIds.map(async (id) => {
            const playtime = await this.getRustPlaytime(id);
            const stats = await this.getRustStats(id);
            return { steamId: id, playtime, stats };
        }));

        return steamIds.map(id => {
            const summary = summaries.find(s => s.steamid === id);
            const ban = bans.find(b => b.SteamId === id);
            const details = detailedData.find(d => d.steamId === id);

            return {
                steamId: id,
                summary,
                ban,
                playtime: details?.playtime,
                stats: details?.stats
            };
        });
    }
}

export default new SteamService();
