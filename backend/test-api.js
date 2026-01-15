import axios from 'axios';

const API_URL = 'http://localhost:3000/api';
let TOKEN = '';
let SERVER_ID = '';

async function login() {
  try {
    const res = await axios.post(API_URL + '/auth/login', {
      username: 'laoma',
      password: '999999999'
    });
    if (res.data.data?.token) {
      TOKEN = res.data.data.token;
      console.log('✅ 登录成功');
      return true;
    }
  } catch (e) {
    console.log('❌ 登录失败:', e.response?.data?.error || e.message);
  }
  return false;
}

async function getServers() {
  try {
    const res = await axios.get(API_URL + '/servers', {
      headers: { Authorization: 'Bearer ' + TOKEN }
    });
    const servers = res.data.servers || res.data;
    if (servers && servers.length > 0) {
      // 找一个已连接的服务器
      const connectedServer = servers.find(s => s.connected) || servers[0];
      SERVER_ID = connectedServer.id;
      console.log('✅ 获取服务器成功, ID:', SERVER_ID, '名称:', connectedServer.name);
      console.log('   连接状态:', connectedServer.connected ? '已连接' : '未连接');
      return true;
    } else {
      console.log('⚠️ 没有服务器');
    }
  } catch (e) {
    console.log('❌ 获取服务器失败:', e.response?.data?.error || e.message);
  }
  return false;
}

async function testExtendedTeammates() {
  console.log('\n========== 测试扩展队友接口 ==========');

  const times = [];

  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    try {
      const res = await axios.get(API_URL + '/servers/' + SERVER_ID + '/extended-teammates', {
        headers: { Authorization: 'Bearer ' + TOKEN }
      });
      const elapsed = Date.now() - start;
      times.push(elapsed);

      const teammates = res.data.teammates || [];
      const inTeam = teammates.filter(t => t.inTeam).length;
      console.log(`请求 ${i+1}: ${elapsed}ms | 总数: ${teammates.length} | 在队伍: ${inTeam}`);

      if (i === 0 && teammates.length > 0) {
        console.log('\n--- 示例数据 ---');
        const sample = teammates[0];
        console.log('玩家:', sample.name);
        console.log('在队伍:', sample.inTeam);
        console.log('头像:', sample.avatar ? '有' : '无');
        console.log('游戏时长:', sample.playtime, '分钟');
        console.log('贡献数据:', Object.keys(sample.contribution || {}).length, '项');
        console.log('----------------\n');
      }
    } catch (e) {
      const elapsed = Date.now() - start;
      times.push(elapsed);
      console.log(`请求 ${i+1}: 失败 - ${e.response?.data?.error || e.message}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  if (times.length > 0) {
    console.log('\n========== 统计结果 ==========');
    console.log('平均响应时间:', Math.round(times.reduce((a,b)=>a+b,0)/times.length), 'ms');
    console.log('最快:', Math.min(...times), 'ms');
    console.log('最慢:', Math.max(...times), 'ms');
  }
}

async function main() {
  console.log('🔍 测试扩展队友 API\n');

  if (!await login()) {
    console.log('\n请确保后端正在运行 (npm run dev)');
    return;
  }

  if (!await getServers()) {
    console.log('\n请先添加服务器');
    return;
  }

  await testExtendedTeammates();
}

main().catch(console.error);
