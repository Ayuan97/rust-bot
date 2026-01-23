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

      // 方法1: 优先通过 IP 搜索 (Battlemetrics 搜索 IP 会返回该 IP 下的所有服务器)
      console.log(`\n🔍 开始搜索 Battlemetrics...`);
      // 注意: filter[search] 搜索 IP 时通常比较准，但有时也会返回无关结果
      let url = `https://api.battlemetrics.com/servers?filter[search]=${ip}&filter[game]=rust`;
      let response = await axios.get(url, axiosConfig);

      console.log(`📊 搜索结果: ${response.data.data.length} 个`);

      if (response.data.data.length === 0) {
        // 如果 IP 搜不到，尝试通过名称搜 (作为备选方案)
        if (serverName) {
          console.log(`⚠️  IP 搜索无结果，尝试通过名称搜索...`);
          const encodedName = encodeURI(serverName).replace('#', '*');
          url = `https://api.battlemetrics.com/servers?filter[search]=${encodedName}&filter[game]=rust`;
          response = await axios.get(url, axiosConfig);
          console.log(`📊 名称搜索结果: ${response.data.data.length} 个`);
        } else {
          console.log(`❌ 未找到匹配的服务器`);
          return null;
        }
      }

      // 遍历所有搜索结果，寻找 IP 和 Port 完全匹配的
      const targetPort = parseInt(port);
      for (const server of response.data.data) {
        const serverIp = server.attributes.ip;
        const serverPort = server.attributes.port;

        // 调试日志：显示找到的候选项
        // console.log(`   检查候选项: ${server.attributes.name} (${serverIp}:${serverPort})`);

        if (serverIp === ip && serverPort === targetPort) {
          console.log(`✅ ✅ 找到完美匹配 (IP + Port)!`);
          console.log(`   服务器: ${server.attributes.name}`);
          console.log(`   ID: ${server.id}`);
          return server.id;
        }
      }

      console.log(`⚠️  未找到 IP:Port 完全匹配的服务器，尝试模糊匹配...`);

      // 如果没有完全匹配 (可能是端口映射问题，或者 Battlemetrics 显示的端口和 Rust+ 端口不一致)
      // 尝试通过名称精确匹配
      if (serverName) {
        const serverByName = response.data.data.find(s => s.attributes.name === serverName);
        if (serverByName) {
          console.log(`✅ 通过名称精确匹配成功!`);
          console.log(`   服务器: ${serverByName.attributes.name}`);
          console.log(`   ID: ${serverByName.id}`);
          return serverByName.id;
        }
      }

      // 如果搜索结果中，所有结果的 IP 都匹配当前 IP (共享宿主)，且找不到端口匹配
      // 这里的逻辑比较危险，因为可能是同一 IP 下的不同服。
      // 所以我们只在 "结果只有一个 且 IP 匹配" 时才敢自动认领
      const sameIpServers = response.data.data.filter(s => s.attributes.ip === ip);
      if (sameIpServers.length === 1) {
        console.log(`✅ 该 IP 只有一个服务器，自动选择 (端口不匹配但 IP 唯一)`);
        console.log(`   服务器: ${sameIpServers[0].attributes.name}`);
        console.log(`   Battlemetrics Port: ${sameIpServers[0].attributes.port} (目标: ${port})`);
        return sameIpServers[0].id;
      }

      console.log(`❌ 无法自动匹配服务器。找到 ${response.data.data.length} 个结果，但无一匹配 IP:Port 或名称。`);
      // 显示候选项供调试
      response.data.data.forEach(server => {
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
      const url = `https://api.battlemetrics.com/servers/${battlemetricsId}?include=player`;

      const response = await axios.get(url, this._getAxiosConfig());

      if (response.status !== 200) {
        throw new Error(`API 返回状态码 ${response.status}`);
      }

      const data = response.data;
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

      // 解析在线玩家
      const players = [];
      if (data.included) {
        for (const entity of data.included) {
          if (entity.type === 'player') {
            players.push({
              id: entity.id,
              name: entity.attributes.name,
              updatedAt: entity.attributes.updatedAt,
            });
          }
        }
      }

      serverInfo.onlinePlayers = players;

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
}

export default new BattlemetricsService();

