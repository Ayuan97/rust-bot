/**
 * 代理节点分配器(连接器侧)
 *
 * Mihomo 提供节点池(一个 select 组 AUTO,成员=所有机场节点);本分配器在"每条连接"维度上挑节点:
 *  - 目标可达感知:某节点连某台 Rust 服失败 → 给 (服务器,节点) 打冷却,下次换别的节点(Mihomo 自带的
 *    url-test 只按通用延迟、不知道能不能连上具体 Rust 服,所以这里自己做)。
 *  - 按服务器分散:限制"同一节点出口对同一批连接"的并发数(MAX_PER_NODE,对标 Rust 的 app.maxconnectionsperip),
 *    优先挑负载最低的节点,避免全堆一个出口 IP 撞官方限制。
 *  - 串行选节点:挑节点 + 在 Mihomo 里选中 + 建连这一段加锁,避免并发把 AUTO 选成别的节点(已建立的连接
 *    会固定在建连时选中的节点上,所以连上后即可释放锁)。
 */

const CONTROLLER = process.env.PROXY_CONTROLLER || '127.0.0.1:9899';
const GROUP = process.env.PROXY_GROUP || 'AUTO';
const MAX_PER_NODE = Number(process.env.PROXY_MAX_PER_NODE || 4);
const COOLDOWN_MS = Number(process.env.PROXY_NODE_COOLDOWN_MS || 10 * 60 * 1000);

async function api(pathname, opts = {}) {
  const res = await fetch(`http://${CONTROLLER}${pathname}`, {
    signal: AbortSignal.timeout(6000),
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`mihomo api ${pathname} HTTP ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

class ProxyPool {
  constructor() {
    this.usage = new Map(); // node -> 当前占用连接数
    this.cooldown = new Map(); // `${serverKey}|${node}` -> 冷却到期时间戳
    this.serverNode = new Map(); // serverId -> 该连接用的节点(断开时回收 usage)
    this._lock = Promise.resolve();
    this._release = null;
  }

  // 列出 AUTO 组里"健康"的机场节点
  async listNodes() {
    const data = await api('/proxies');
    const proxies = data.proxies || {};
    const group = proxies[GROUP] || {};
    const groupTypes = new Set(['Selector', 'URLTest', 'Fallback', 'LoadBalance', 'Relay']);
    return (group.all || []).filter((n) => {
      const p = proxies[n];
      return p && p.alive !== false && !groupTypes.has(p.type);
    });
  }

  _cooldownActive(serverKey, node, now) {
    const key = `${serverKey}|${node}`;
    const until = this.cooldown.get(key);
    if (until == null) return false;
    if (now > until) { this.cooldown.delete(key); return false; }
    return true;
  }

  async _pick(serverKey, exclude) {
    const nodes = await this.listNodes();
    if (nodes.length === 0) return null;
    const now = Date.now();
    const usable = nodes.filter((n) => !exclude.has(n) && !this._cooldownActive(serverKey, n, now));
    if (usable.length === 0) return null;
    const underCap = usable.filter((n) => (this.usage.get(n) || 0) < MAX_PER_NODE);
    const pool = underCap.length ? underCap : usable; // 都满了也别让它连不上,放宽容量
    pool.sort((a, b) => (this.usage.get(a) || 0) - (this.usage.get(b) || 0));
    return pool[0];
  }

  _unlock() {
    if (this._release) {
      const release = this._release;
      this._release = null;
      release();
    }
  }

  /**
   * 取锁 + 挑节点 + 在 Mihomo 里选中。返回节点名(无可用节点返回 null 并已释放锁)。
   * 调用方建连后必须调用 endSuccess / endFailure 释放锁。
   */
  async begin(serverKey, exclude = new Set()) {
    const prev = this._lock;
    let release;
    this._lock = new Promise((r) => { release = r; });
    await prev;
    this._release = release;
    try {
      const node = await this._pick(serverKey, exclude);
      if (!node) { this._unlock(); return null; }
      await api(`/proxies/${encodeURIComponent(GROUP)}`, {
        method: 'PUT',
        body: JSON.stringify({ name: node }),
      });
      return node;
    } catch (error) {
      this._unlock();
      throw error;
    }
  }

  endSuccess(serverId, node) {
    this.usage.set(node, (this.usage.get(node) || 0) + 1);
    this.serverNode.set(serverId, node);
    this._unlock();
  }

  endFailure(serverKey, node) {
    this.cooldown.set(`${serverKey}|${node}`, Date.now() + COOLDOWN_MS);
    this._unlock();
  }

  releaseServer(serverId) {
    const node = this.serverNode.get(serverId);
    if (!node) return;
    this.serverNode.delete(serverId);
    const count = (this.usage.get(node) || 0) - 1;
    if (count <= 0) this.usage.delete(node);
    else this.usage.set(node, count);
  }
}

export default ProxyPool;
