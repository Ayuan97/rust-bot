import axios from 'axios';
import EventEmitter from 'events';

class BattlemetricsService extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map(); // serverId -> battlemetrics data
  }

  /**
   * 通过服务器名称搜索 Battlemetrics ID
   */
  async searchServerByName(name) {
    try {
      const encodedName = encodeURI(name).replace('#', '*');
      const url = `https://api.battlemetrics.com/servers?filter[search]=${encodedName}&filter[game]=rust`;
      
      const response = await axios.get(url);
      
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
   * @param {string|number} port - Rust+ App 端口（通常是游戏端口+2）
   */
  async searchServerByAddress(ip, port) {
    try {
      const rustPlusPort = parseInt(port);
      // Rust+ 端口通常是游戏端口 + 2
      // 例如: 游戏端口 28015, Rust+ 端口 28017
      const gamePort = rustPlusPort - 2;

      console.log(`🔍 搜索 Battlemetrics 服务器: ${ip}:${port}`);
      console.log(`   Rust+ 端口: ${rustPlusPort}, 推测游戏端口: ${gamePort}`);

      // 方法1: 使用推测的游戏端口搜索
      let url = `https://api.battlemetrics.com/servers?filter[search]=${ip}:${gamePort}&filter[game]=rust`;
      let response = await axios.get(url);

      console.log(`📊 搜索结果数量 (游戏端口): ${response.data.data.length}`);

      // 查找匹配的服务器
      for (const server of response.data.data) {
        console.log(`  - 检查服务器: ${server.attributes.name} (${server.attributes.ip}:${server.attributes.port})`);
        if (server.attributes.ip === ip && server.attributes.port === gamePort) {
          console.log(`✅ 找到匹配服务器 ID: ${server.id}`);
          return server.id;
        }
      }

      // 方法2: 搜索 IP（不带端口），然后匹配
      console.log(`🔍 尝试仅搜索 IP: ${ip}`);
      url = `https://api.battlemetrics.com/servers?filter[search]=${ip}&filter[game]=rust`;
      response = await axios.get(url);

      console.log(`📊 IP 搜索结果数量: ${response.data.data.length}`);

      // 优先匹配推测的游戏端口
      for (const server of response.data.data) {
        console.log(`  - 检查服务器: ${server.attributes.name} (${server.attributes.ip}:${server.attributes.port})`);
        if (server.attributes.ip === ip && server.attributes.port === gamePort) {
          console.log(`✅ 找到匹配服务器 ID (游戏端口): ${server.id}`);
          return server.id;
        }
      }

      // 如果游戏端口没找到，尝试匹配 Rust+ 端口（某些特殊配置）
      for (const server of response.data.data) {
        if (server.attributes.ip === ip && server.attributes.port === rustPlusPort) {
          console.log(`✅ 找到匹配服务器 ID (Rust+端口): ${server.id}`);
          return server.id;
        }
      }

      // 方法3: IP 匹配，返回第一个（如果只有一个服务器）
      const sameIpServers = response.data.data.filter(s => s.attributes.ip === ip);
      if (sameIpServers.length === 1) {
        console.log(`✅ 找到同IP唯一服务器 ID: ${sameIpServers[0].id}`);
        return sameIpServers[0].id;
      }

      console.log(`❌ 未找到匹配的服务器`);
      console.log(`   提示: IP ${ip} 上可能有多个服务器，端口不匹配`);
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
      
      const response = await axios.get(url);
      
      if (response.status !== 200) {
        console.error('❌ 获取 Battlemetrics 服务器信息失败');
        return null;
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

      // 缓存数据
      this.servers.set(battlemetricsId, serverInfo);

      return serverInfo;
    } catch (error) {
      console.error('❌ 获取 Battlemetrics 服务器信息错误:', error.message);
      return null;
    }
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
      
      const response = await axios.get(url);
      
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

