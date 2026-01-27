import axios from 'axios';
import logger from '../utils/logger.js';

// 请求延迟（毫秒），避免触发 Steam API 速率限制
const REQUEST_DELAY = 200;

// 速率限制错误静默期（毫秒）
const RATE_LIMIT_SILENCE_PERIOD = 60000;

class SteamService {
    constructor() {
        this.apiKey = process.env.STEAM_API_KEY;
        this.baseUrl = 'https://api.steampowered.com';
        this.rustAppId = '252490';
        this.lastRateLimitLog = 0; // 上次记录 429 错误的时间

        if (!this.apiKey) {
            logger.warn('STEAM_API_KEY is not defined in .env file. Steam integration will not work.');
        }
    }

    /**
     * 延迟函数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
            // 429 错误限制日志频率，避免刷屏
            if (error.response?.status === 429) {
                const now = Date.now();
                if (now - this.lastRateLimitLog > RATE_LIMIT_SILENCE_PERIOD) {
                    logger.warn(`[Steam] API 速率限制触发，部分玩家数据暂时无法获取`);
                    this.lastRateLimitLog = now;
                }
                return null;
            }
            logger.error(`[Steam] 获取游戏时长失败 ${steamId}: ${error.message}`);
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
            // 403/500 通常意味着资料/统计是私密的
            if (error.response?.status === 403 || error.response?.status === 500) {
                return { private: true };
            }
            // 429 错误限制日志频率
            if (error.response?.status === 429) {
                return null;
            }
            logger.error(`[Steam] 获取游戏统计失败 ${steamId}: ${error.message}`);
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

        // 串行请求每个玩家的详细数据，避免触发速率限制
        const detailedData = [];
        for (const id of steamIds) {
            const playtime = await this.getRustPlaytime(id);
            await this.delay(REQUEST_DELAY);
            const stats = await this.getRustStats(id);
            await this.delay(REQUEST_DELAY);
            detailedData.push({ steamId: id, playtime, stats });
        }

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
