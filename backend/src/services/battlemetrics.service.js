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

      // 方法1: 优先通过服务器名称搜索（最可靠）
      if (serverName) {
        console.log(`\n🎯 方法1: 通过服务器名称搜索`);
        const encodedName = encodeURI(serverName).replace('#', '*');
        let url = `https://api.battlemetrics.com/servers?filter[search]=${encodedName}&filter[game]=rust`;
        let response = await axios.get(url);

        console.log(`📊 名称搜索结果: ${response.data.data.length} 个`);

        // 精确匹配服务器名称
        for (const server of response.data.data) {
          if (server.attributes.name === serverName) {
            console.log(`✅ 通过名称精确匹配成功!`);
            console.log(`   服务器: ${server.attributes.name}`);
            console.log(`   IP: ${server.attributes.ip}:${server.attributes.port}`);
            console.log(`   Battlemetrics ID: ${server.id}`);
            return server.id;
          }
        }

        console.log(`⚠️  名称精确匹配失败，尝试其他方法...`);
      }

      // 方法2: 通过 IP 搜索，然后根据名称或端口匹配
      console.log(`\n🔍 方法2: 通过 IP 搜索`);
      let url = `https://api.battlemetrics.com/servers?filter[search]=${ip}&filter[game]=rust`;
      let response = await axios.get(url);

      console.log(`📊 IP 搜索结果: ${response.data.data.length} 个`);

      if (response.data.data.length === 0) {
        console.log(`❌ 未找到匹配的服务器`);
        return null;
      }

      // 显示所有找到的服务器
      response.data.data.forEach(server => {
        console.log(`  - ${server.attributes.name}`);
        console.log(`    IP:Port = ${server.attributes.ip}:${server.attributes.port}`);
        console.log(`    玩家: ${server.attributes.players}/${server.attributes.maxPlayers}`);
      });

      // 2.1 如果有服务器名称，优先通过名称匹配
      if (serverName) {
        const serverByName = response.data.data.find(s => s.attributes.name === serverName);
        if (serverByName) {
          console.log(`\n✅ 通过 IP + 名称匹配成功!`);
          console.log(`   服务器: ${serverByName.attributes.name}`);
          console.log(`   Battlemetrics ID: ${serverByName.id}`);
          return serverByName.id;
        }
      }

      // 2.2 如果只有一个服务器，直接返回
      const sameIpServers = response.data.data.filter(s => s.attributes.ip === ip);
      if (sameIpServers.length === 1) {
        console.log(`\n✅ 该 IP 只有一个服务器，自动选择`);
        console.log(`   服务器: ${sameIpServers[0].attributes.name}`);
        console.log(`   Battlemetrics ID: ${sameIpServers[0].id}`);
        return sameIpServers[0].id;
      }

      // 2.3 多个服务器且无法确定
      console.log(`\n❌ 该 IP 有 ${sameIpServers.length} 个服务器，无法自动确定`);
      console.log(`   提示: 需要服务器名称来精确匹配`);
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

