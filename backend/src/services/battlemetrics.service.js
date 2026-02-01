import axios from 'axios';
import EventEmitter from 'events';

class BattlemetricsService extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map(); // serverId -> battlemetrics data
    this.proxyAgent = null;
    this.apiToken = process.env.BATTLEMETRICS_API_TOKEN || null;

    if (this.apiToken) {
      console.log('✅ Battlemetrics API Token 已配置 (300 请求/分钟)');
    } else {
      console.log('⚠️  Battlemetrics API Token 未配置 (限制 60 请求/分钟)');
    }
  }

  /**
   * 设置代理 Agent
   */
  setProxyAgent(proxyAgent) {
    this.proxyAgent = proxyAgent;
    console.log('✅ Battlemetrics 服务已配置代理');
  }

  /**
   * 获取 axios 配置（带代理和认证）
   */
  _getAxiosConfig() {
    const config = {
      timeout: 15000,
      headers: {}
    };

    // 添加认证 Token
    if (this.apiToken) {
      config.headers['Authorization'] = `Bearer ${this.apiToken}`;
    }

    // 添加代理
    if (this.proxyAgent) {
      config.httpsAgent = this.proxyAgent;
      config.httpAgent = this.proxyAgent;
    }

    return config;
  }

  /**
   * 通过服务器名称搜索 Battlemetrics ID
   */
  async searchServerByName(name) {
    try {
      const encodedName = encodeURI(name).replace('#', '*');
      const url = `https://api.battlemetrics.com/servers?filter[search]=${encodedName}&filter[game]=rust`;

      const response = await axios.get(url, this._getAxiosConfig());

      if (response.status !== 200) {
        console.error('❌ Battlemetrics 搜索失败');
        return null;
      }

      // 查找完全匹配的服务器
      for (const server of response.data.data) {
        if (server.attributes.name === name) {
          return server.id;
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Battlemetrics 搜索错误:', error.message);
      return null;
    }
  }

  /**
   * 通过 IP:Port 搜索服务器
   * @param {string} ip - 服务器IP
   * @param {string|number} port - Rust+ App 端口
   * @param {string} serverName - 服务器名称（用于精确匹配）
   */
  async searchServerByAddress(ip, port, serverName = null) {
    try {
      console.log(`🔍 搜索 Battlemetrics 服务器`);
      console.log(`   IP: ${ip}`);
      console.log(`   Rust+ 端口: ${port}`);
      if (serverName) {
        console.log(`   服务器名称: ${serverName}`);
      }

      const axiosConfig = this._getAxiosConfig();
      const targetPort = parseInt(port);
      const candidates = new Map(); // id -> server object

      // 定义搜索任务
      const tasks = [];

      // 任务 1: IP 搜索 (扩大范围到 50 条)
      tasks.push((async () => {
        try {
          console.log(`🔍 [1/2] 正在通过 IP 搜索...`);
          const url = `https://api.battlemetrics.com/servers?filter[search]=${ip}&filter[game]=rust&page[size]=50`;
          const response = await axios.get(url, axiosConfig);
          console.log(`   📈 IP 搜索返回 ${response.data.data.length} 个结果`);
          return response.data.data;
        } catch (e) {
          console.error(`   ❌ IP 搜索失败: ${e.message}`);
          return [];
        }
      })());

      // 任务 2: 名称搜索 (如果有)
      if (serverName) {
        tasks.push((async () => {
          try {
            console.log(`🔍 [2/2] 正在通过名称搜索...`);
            // 去除冒号后的部分(有时是端口)，去除特殊符号，只搜核心名称
            // 但为了保险，还是搜完整名称，依赖 BM 的搜索引擎
            const encodedName = encodeURI(serverName).replace('#', '*');
            const url = `https://api.battlemetrics.com/servers?filter[search]=${encodedName}&filter[game]=rust&page[size]=50`;
            const response = await axios.get(url, axiosConfig);
            console.log(`   📈 名称 搜索返回 ${response.data.data.length} 个结果`);
            return response.data.data;
          } catch (e) {
            console.error(`   ❌ 名称搜索失败: ${e.message}`);
            return [];
          }
        })());
      }

      // 并行执行搜索
      const results = await Promise.all(tasks);

      // 合并结果
      results.flat().forEach(server => {
        if (!candidates.has(server.id)) {
          candidates.set(server.id, server);
        }
      });

      console.log(`📊 合并后共找到 ${candidates.size} 个唯一候选服务器`);

      // ---------------------------------------------------------
      // 匹配逻辑
      // ---------------------------------------------------------

      // 1. 尝试寻找 IP 和 Port 完美匹配
      for (const server of candidates.values()) {
        const serverIp = server.attributes.ip;
        const serverPort = server.attributes.port;
        if (serverIp === ip && serverPort === targetPort) {
          console.log(`✅ ✅ 找到完美匹配 (IP + Port)!`);
          console.log(`   服务器: ${server.attributes.name}`);
          console.log(`   ID: ${server.id}`);
          return server.id;
        }
      }

      // 2. 尝试寻找 名称 完美匹配 (且 IP 相同)
      if (serverName) {
        for (const server of candidates.values()) {
          if (server.attributes.name === serverName && server.attributes.ip === ip) {
            console.log(`✅ 通过 名称+IP 匹配成功!`);
            console.log(`   ID: ${server.id}`);
            return server.id;
          }
        }
        // 放宽一点，只匹配名称
        for (const server of candidates.values()) {
          if (server.attributes.name === serverName) {
            console.log(`✅ 通过 名称精确匹配成功!`);
            console.log(`   ID: ${server.id}`);
            return server.id;
          }
        }
      }

      // 3. 如果通过 IP 搜到了唯一结果 (忽略端口)
      const ipMatches = Array.from(candidates.values()).filter(s => s.attributes.ip === ip);
      if (ipMatches.length === 1) {
        console.log(`✅ 找到唯一 IP 匹配 (端口不匹配: ${ipMatches[0].attributes.port} vs ${targetPort})`);
        console.log(`   自动认领: ${ipMatches[0].attributes.name}`);
        return ipMatches[0].id;
      }

      console.log(`❌ 无法自动匹配服务器。无法从 ${candidates.size} 个候选中确定目标。`);
      // 显示部分候选项
      Array.from(candidates.values()).slice(0, 10).forEach(server => {
        console.log(`  - [${server.id}] ${server.attributes.name} (${server.attributes.ip}:${server.attributes.port})`);
      });

      return null;
    } catch (error) {
      console.error('❌ Battlemetrics 搜索错误:', error.message);
      if (error.response) {
        console.error('   状态码:', error.response.status);
        console.error('   响应:', error.response.data);
      }
      return null;
    }
  }

  /**
   * 获取服务器详细信息
   */
  async getServerInfo(battlemetricsId) {
    try {
      // 并行请求：服务器基本信息 + 在线会话列表
      const [serverResponse, sessionsResponse] = await Promise.all([
        axios.get(`https://api.battlemetrics.com/servers/${battlemetricsId}`, this._getAxiosConfig()),
        this._getServerActiveSessions(battlemetricsId)
      ]);

      if (serverResponse.status !== 200) {
        throw new Error(`API 返回状态码 ${serverResponse.status}`);
      }

      const data = serverResponse.data;
      const attributes = data.data.attributes;
      const details = attributes.details;

      const serverInfo = {
        id: data.data.id,
        name: attributes.name,
        address: attributes.address,
        ip: attributes.ip,
        port: attributes.port,
        players: attributes.players,
        maxPlayers: attributes.maxPlayers,
        queuedPlayers: details.rust_queued_players || 0,
        rank: attributes.rank,
        location: attributes.location,
        country: attributes.country,
        status: attributes.status,

        // 服务器详情
        official: details.official,
        modded: details.rust_modded,
        pve: details.pve,
        map: details.map,
        mapSize: details.rust_world_size,
        worldSeed: details.rust_world_seed,
        gamemode: details.rust_gamemode,

        // 性能信息
        fps: details.rust_fps,
        fpsAvg: details.rust_fps_avg,
        uptime: details.rust_uptime,
        entityCount: details.rust_ent_cnt_i,

        // 时间信息
        lastWipe: details.rust_last_wipe,
        lastWipeEnt: details.rust_last_wipe_ent,
        lastSeedChange: details.rust_last_seed_change,
        born: details.rust_born,

        // 其他
        description: details.rust_description,
        url: details.rust_url,
        headerImage: details.rust_headerimage,

        // 地图信息
        rustMapsUrl: details.rust_maps?.url || null,
        rustMapsThumbnail: details.rust_maps?.thumbnailUrl || null,
        monuments: details.rust_maps?.monuments || null,
        mapDownloadUrl: details.rust_world_levelurl || null, // 地图文件下载 URL

        updatedAt: attributes.updatedAt,
      };

      // 使用活动会话获取完整的在线玩家列表
      serverInfo.onlinePlayers = sessionsResponse;

      // 预估清档周期 (基于服务器名称和历史)
      serverInfo.wipeCycle = this._estimateWipeCycle(attributes.name, details.rust_description);

      // 计算下一次清档时间 (简单估算)
      if (serverInfo.lastWipe) {
        const lastWipeDate = new Date(serverInfo.lastWipe);
        const nextWipeDate = new Date(lastWipeDate);
        if (serverInfo.wipeCycle === 'WEEKLY') nextWipeDate.setDate(lastWipeDate.getDate() + 7);
        else if (serverInfo.wipeCycle === 'BIWEEKLY') nextWipeDate.setDate(lastWipeDate.getDate() + 14);
        else if (serverInfo.wipeCycle === 'MONTHLY') nextWipeDate.setMonth(lastWipeDate.getMonth() + 1);
        else nextWipeDate.setDate(lastWipeDate.getDate() + 7); // 默认一周

        serverInfo.nextWipe = nextWipeDate.toISOString();
      }

      // 缓存数据
      this.servers.set(battlemetricsId, serverInfo);

      return serverInfo;
    } catch (error) {
      // 构建详细的错误信息
      let errorMessage = error.message;
      if (error.response) {
        errorMessage = `HTTP ${error.response.status}: ${error.response.statusText || '未知错误'}`;
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = '请求超时 (15秒)';
      } else if (error.code) {
        errorMessage = `${error.code}: ${error.message}`;
      }
      throw new Error(errorMessage);
    }
  }

  /**
   * 获取服务器当前活动会话（在线玩家完整列表）
   * 使用分页获取所有在线玩家
   * @param {string} serverId - Battlemetrics 服务器 ID
   * @returns {Promise<Array>} 在线玩家数组
   * @private
   */
  async _getServerActiveSessions(serverId) {
    try {
      const players = [];
      let nextUrl = `https://api.battlemetrics.com/servers/${serverId}/relationships/sessions?filter[online]=true&page[size]=100&include=player`;

      // 分页获取所有在线玩家（最多 5 页，500 人）
      let pageCount = 0;
      const maxPages = 5;

      while (nextUrl && pageCount < maxPages) {
        const response = await axios.get(nextUrl, this._getAxiosConfig());

        if (response.status !== 200) {
          break;
        }

        // 构建玩家 ID -> 名称的映射（从 included 中获取完整玩家信息）
        const playerMap = new Map();
        if (response.data.included) {
          for (const item of response.data.included) {
            if (item.type === 'player') {
              playerMap.set(item.id, {
                id: item.id,
                name: item.attributes?.name || 'Unknown',
                updatedAt: item.attributes?.updatedAt
              });
            }
          }
        }

        // 从会话数据中提取玩家
        for (const session of response.data.data) {
          if (session.type === 'session') {
            const playerRelation = session.relationships?.player?.data;
            if (playerRelation) {
              const playerInfo = playerMap.get(playerRelation.id);
              if (playerInfo) {
                players.push(playerInfo);
              } else {
                // 如果 included 中没有，使用会话中的名称
                players.push({
                  id: playerRelation.id,
                  name: session.attributes?.name || 'Unknown',
                  updatedAt: session.attributes?.start
                });
              }
            }
          }
        }

        // 检查是否有下一页
        nextUrl = response.data.links?.next || null;
        pageCount++;
      }

      return players;
    } catch (error) {
      // console.error('[BATTLEMETRICS] 获取服务器活动会话失败:', error.message);
      return [];
    }
  }

  /**
   * 预估服务器清档周期
   */
  _estimateWipeCycle(name, description) {
    const text = (name + (description || '')).toUpperCase();
    if (text.includes('MONTHLY') || text.includes('每个月')) return 'MONTHLY';
    if (text.includes('BIWEEKLY') || text.includes('双周')) return 'BIWEEKLY';
    if (text.includes('WEEKLY') || text.includes('周清')) return 'WEEKLY';
    if (text.includes('DAILY') || text.includes('日清')) return 'DAILY';

    // 如果没有任何关键词，官方服通常是月份或双周，普通服通常是周清
    if (text.includes('OFFICIAL')) return 'MONTHLY';
    return 'WEEKLY';
  }

  /**
   * 获取服务器在线玩家排行
   */
  async getTopPlayers(battlemetricsId, days = 30) {
    try {
      let period = 'AT'; // All-time
      if (days !== null) {
        const now = new Date().toISOString();
        const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        period = `${daysAgo}:${now}`;
      }

      const url = `https://api.battlemetrics.com/servers/${battlemetricsId}/relationships/leaderboards/time?filter[period]=${period}`;

      const response = await axios.get(url, this._getAxiosConfig());

      if (response.status !== 200) {
        return [];
      }

      const players = [];
      for (const entity of response.data.data) {
        if (entity.type === 'leaderboardPlayer') {
          players.push({
            id: entity.id,
            name: entity.attributes.name,
            time: entity.attributes.value,
            rank: entity.attributes.rank,
          });
        }
      }

      return players;
    } catch (error) {
      console.error('❌ 获取玩家排行错误:', error.message);
      return [];
    }
  }

  /**
   * 获取缓存的服务器信息
   */
  getCachedServerInfo(battlemetricsId) {
    return this.servers.get(battlemetricsId) || null;
  }

  /**
   * 清除缓存
   */
  clearCache(battlemetricsId = null) {
    if (battlemetricsId) {
      this.servers.delete(battlemetricsId);
    } else {
      this.servers.clear();
    }
  }

  // ============================================================
  // 玩家追踪相关接口
  // ============================================================

  /**
   * 通过 Steam ID 查找 Battlemetrics 玩家 ID
   * @param {string} steamId - Steam 64位 ID
   * @returns {Promise<{playerId: string, playerName: string} | null>}
   */
  async matchPlayerBySteamId(steamId) {
    try {
      const url = 'https://api.battlemetrics.com/players/match';
      const response = await axios.post(url, {
        data: [
          {
            type: 'identifier',
            attributes: {
              type: 'steamID',
              identifier: steamId
            }
          }
        ]
      }, this._getAxiosConfig());

      if (response.status !== 200 || !response.data.data || response.data.data.length === 0) {
        return null;
      }

      const player = response.data.data[0];
      return {
        playerId: player.id,
        playerName: player.attributes?.name || 'Unknown'
      };
    } catch (error) {
      // 404 表示玩家未找到，不是错误
      if (error.response?.status === 404) {
        return null;
      }
      console.error('matchPlayerBySteamId 错误:', error.message);
      return null;
    }
  }

  /**
   * 获取玩家详细信息
   * @param {string} playerId - Battlemetrics 玩家 ID
   * @returns {Promise<object | null>}
   */
  async getPlayerInfo(playerId) {
    try {
      const url = `https://api.battlemetrics.com/players/${playerId}`;
      const response = await axios.get(url, this._getAxiosConfig());

      if (response.status !== 200) {
        return null;
      }

      const data = response.data.data;
      const attrs = data.attributes;

      return {
        id: data.id,
        name: attrs.name,
        positiveMatch: attrs.positiveMatch,
        private: attrs.private,
        createdAt: attrs.createdAt,
        updatedAt: attrs.updatedAt
      };
    } catch (error) {
      console.error('getPlayerInfo 错误:', error.message);
      return null;
    }
  }

  /**
   * 获取玩家资料（包含历史名称）
   * 对应 rustplusplus 的 GET_PROFILE_DATA_API_CALL
   * @param {string} playerId - Battlemetrics 玩家 ID
   * @returns {Promise<object | null>}
   */
  async getPlayerProfile(playerId) {
    try {
      const url = `https://api.battlemetrics.com/players/${playerId}?include=identifier`;
      const response = await axios.get(url, this._getAxiosConfig());

      if (response.status !== 200) {
        return null;
      }

      const data = response.data.data;
      const attrs = data.attributes;

      // 解析玩家基本信息
      const profile = {
        id: data.id,
        name: attrs.name,
        positiveMatch: attrs.positiveMatch,
        private: attrs.private,
        createdAt: attrs.createdAt,
        updatedAt: attrs.updatedAt,
        nameHistory: [],
        identifiers: []
      };

      // 解析 identifiers (历史名称、Steam ID 等)
      if (response.data.included) {
        for (const item of response.data.included) {
          if (item.type !== 'identifier') continue;
          if (!item.attributes) continue;

          const identAttr = item.attributes;

          // 记录所有 identifier
          profile.identifiers.push({
            type: identAttr.type,
            identifier: identAttr.identifier,
            lastSeen: identAttr.lastSeen,
            private: identAttr.private,
            metadata: identAttr.metadata
          });

          // 单独提取历史名称
          if (identAttr.type === 'name') {
            profile.nameHistory.push({
              name: identAttr.identifier,
              lastSeen: identAttr.lastSeen
            });
          }
        }

        // 按最后出现时间排序名称历史
        profile.nameHistory.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
      }

      return profile;
    } catch (error) {
      console.error('getPlayerProfile 错误:', error.message);
      return null;
    }
  }

  /**
   * 获取玩家历史名称列表
   * @param {string} playerId - Battlemetrics 玩家 ID
   * @returns {Promise<Array<{name: string, lastSeen: string}>>}
   */
  async getPlayerNameHistory(playerId) {
    try {
      const profile = await this.getPlayerProfile(playerId);
      return profile?.nameHistory || [];
    } catch (error) {
      console.error('getPlayerNameHistory 错误:', error.message);
      return [];
    }
  }

  /**
   * 从玩家资料中提取 Steam ID
   * @param {string} playerId - Battlemetrics 玩家 ID
   * @returns {Promise<string | null>}
   */
  async getPlayerSteamId(playerId) {
    try {
      const profile = await this.getPlayerProfile(playerId);
      if (!profile?.identifiers) return null;

      const steamIdent = profile.identifiers.find(i => i.type === 'steamID');
      return steamIdent?.identifier || null;
    } catch (error) {
      console.error('getPlayerSteamId 错误:', error.message);
      return null;
    }
  }

  /**
   * 获取玩家会话历史（上下线记录）
   * @param {string} playerId - Battlemetrics 玩家 ID
   * @param {object} options - 可选参数
   * @param {string} options.serverId - 过滤特定服务器
   * @param {number} options.pageSize - 每页数量 (默认 20, 最大 100)
   * @returns {Promise<Array>}
   */
  async getPlayerSessions(playerId, options = {}) {
    try {
      const { serverId, pageSize = 20 } = options;

      let url = `https://api.battlemetrics.com/players/${playerId}/relationships/sessions?page[size]=${pageSize}&include=server`;

      if (serverId) {
        url += `&filter[servers]=${serverId}`;
      }

      const response = await axios.get(url, this._getAxiosConfig());

      if (response.status !== 200) {
        return [];
      }

      // 构建服务器 ID -> 名称的映射
      const serverMap = new Map();
      if (response.data.included) {
        for (const item of response.data.included) {
          if (item.type === 'server') {
            serverMap.set(item.id, {
              id: item.id,
              name: item.attributes?.name || 'Unknown',
              ip: item.attributes?.ip,
              port: item.attributes?.port
            });
          }
        }
      }

      const sessions = [];
      for (const session of response.data.data) {
        const attrs = session.attributes;
        const serverRelation = session.relationships?.server?.data;
        const serverInfo = serverRelation ? serverMap.get(serverRelation.id) : null;

        sessions.push({
          id: session.id,
          start: attrs.start,
          stop: attrs.stop,  // null 表示当前在线
          firstTime: attrs.firstTime,
          name: attrs.name,  // 会话期间使用的名称
          server: serverInfo
        });
      }

      return sessions;
    } catch (error) {
      console.error('getPlayerSessions 错误:', error.message);
      return [];
    }
  }

  /**
   * 获取玩家当前在线状态和所在服务器
   * @param {string} playerId - Battlemetrics 玩家 ID
   * @returns {Promise<{online: boolean, server: object | null, session: object | null}>}
   */
  async getPlayerOnlineStatus(playerId) {
    try {
      // 获取最近的会话，如果 stop 为 null 则表示在线
      const sessions = await this.getPlayerSessions(playerId, { pageSize: 1 });

      if (sessions.length === 0) {
        return { online: false, server: null, session: null };
      }

      const latestSession = sessions[0];
      const isOnline = latestSession.stop === null;

      return {
        online: isOnline,
        server: isOnline ? latestSession.server : null,
        session: latestSession
      };
    } catch (error) {
      console.error('getPlayerOnlineStatus 错误:', error.message);
      return { online: false, server: null, session: null };
    }
  }

  /**
   * 获取服务器当前在线玩家列表
   * 注意: 这是 getServerInfo 的简化版，只返回在线玩家
   * @param {string} serverId - Battlemetrics 服务器 ID
   * @returns {Promise<Array>}
   */
  async getServerOnlinePlayers(serverId) {
    try {
      const serverInfo = await this.getServerInfo(serverId);
      return serverInfo?.onlinePlayers || [];
    } catch (error) {
      console.error('getServerOnlinePlayers 错误:', error.message);
      return [];
    }
  }

  /**
   * 通过 Steam ID 获取玩家完整信息（组合接口）
   * @param {string} steamId - Steam 64位 ID
   * @returns {Promise<object | null>}
   */
  async getPlayerBySteamId(steamId) {
    try {
      // 1. 先匹配获取 playerId
      const matchResult = await this.matchPlayerBySteamId(steamId);
      if (!matchResult) {
        return null;
      }

      // 2. 获取玩家详细信息
      const playerInfo = await this.getPlayerInfo(matchResult.playerId);

      // 3. 获取在线状态
      const onlineStatus = await this.getPlayerOnlineStatus(matchResult.playerId);

      return {
        ...playerInfo,
        steamId,
        ...onlineStatus
      };
    } catch (error) {
      console.error('getPlayerBySteamId 错误:', error.message);
      return null;
    }
  }
}

export default new BattlemetricsService();

