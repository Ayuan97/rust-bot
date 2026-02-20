/**
 * Rust 游戏地图文件解析器
 * 解析 .map 文件获取精确的地图数据
 *
 * 文件格式:
 * - [4字节] uint32 版本号 (当前为 9 或 10)
 * - [8字节] int64 时间戳 (版本 >= 10)
 * - [剩余] LZ4 压缩的 ProtoBuf WorldData
 *
 * 参考: https://wiki.facepunch.com/rust/Map_Data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import protobuf from 'protobufjs';
import lz4 from 'lz4js';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RustMapParser {
  constructor() {
    this.proto = null;
    this.WorldData = null;
    this.initialized = false;
    this.cache = new Map(); // url -> parsed data
  }

  /**
   * 初始化 ProtoBuf 定义
   */
  async init() {
    if (this.initialized) return;

    try {
      const protoPath = path.join(__dirname, '../proto/world.proto');
      this.proto = await protobuf.load(protoPath);
      this.WorldData = this.proto.lookupType('WorldData');
      this.initialized = true;
      console.log('[MapParser] ProtoBuf 定义加载成功');
    } catch (error) {
      console.error('[MapParser] ProtoBuf 定义加载失败:', error.message);
      throw error;
    }
  }

  /**
   * 从 URL 下载并解析地图文件
   * @param {string} url - 地图文件下载地址
   * @param {object} options - 选项
   * @param {boolean} options.useCache - 是否使用缓存 (默认 true)
   * @returns {Promise<object>} 解析后的地图数据
   */
  async parseFromUrl(url, options = {}) {
    const { useCache = true } = options;

    // 检查缓存
    if (useCache && this.cache.has(url)) {
      console.log('[MapParser] 使用缓存数据:', url);
      return this.cache.get(url);
    }

    await this.init();

    console.log('[MapParser] 下载地图文件:', url);
    const buffer = await this.downloadFile(url);
    console.log('[MapParser] 下载完成, 大小:', (buffer.length / 1024 / 1024).toFixed(2), 'MB');

    const result = this.parse(buffer);

    // 缓存结果
    if (useCache) {
      this.cache.set(url, result);
    }

    return result;
  }

  /**
   * 从本地文件解析地图
   * @param {string} filePath - 文件路径
   * @returns {Promise<object>} 解析后的地图数据
   */
  async parseFromFile(filePath) {
    await this.init();

    console.log('[MapParser] 读取地图文件:', filePath);
    const buffer = fs.readFileSync(filePath);
    console.log('[MapParser] 文件大小:', (buffer.length / 1024 / 1024).toFixed(2), 'MB');

    return this.parse(buffer);
  }

  /**
   * 解析地图数据
   * @param {Buffer} buffer - 地图文件二进制数据
   * @returns {object} 解析后的地图数据
   */
  parse(buffer) {
    // 读取版本号 (前4字节, Little Endian)
    const version = buffer.readUInt32LE(0);
    console.log('[MapParser] 地图版本:', version);

    // 确定数据偏移量
    // 版本 >= 10: 4字节版本 + 8字节时间戳 = 12字节
    // 版本 < 10: 4字节版本
    let offset = 4;
    let timestamp = null;

    if (version >= 10) {
      // 读取时间戳 (8字节 int64)
      timestamp = buffer.readBigInt64LE(4);
      offset = 12;
      console.log('[MapParser] 时间戳:', new Date(Number(timestamp)).toISOString());
    }

    // 获取数据部分
    const dataSection = buffer.slice(offset);
    console.log('[MapParser] 数据部分大小:', (dataSection.length / 1024 / 1024).toFixed(2), 'MB');

    // 尝试解析数据
    let decompressed;

    // 首先尝试直接解析 ProtoBuf (可能未压缩)
    try {
      const worldData = this.WorldData.decode(dataSection);
      if (worldData && (worldData.size > 0 || worldData.prefabs?.length > 0)) {
        console.log('[MapParser] 数据未压缩, 直接解析 ProtoBuf 成功');
        decompressed = dataSection;
      }
    } catch (e) {
      // 不是未压缩的 ProtoBuf, 继续尝试解压
    }

    // 如果直接解析失败, 尝试 LZ4 解压
    if (!decompressed) {
      try {
        decompressed = this.decompressLZ4(dataSection);
        console.log('[MapParser] LZ4 解压后大小:', (decompressed.length / 1024 / 1024).toFixed(2), 'MB');
      } catch (error) {
        console.error('[MapParser] LZ4 解压失败:', error.message);
        throw new Error('LZ4 解压失败: ' + error.message);
      }
    }

    // ProtoBuf 解析
    let worldData;
    try {
      worldData = this.WorldData.decode(decompressed);
      console.log('[MapParser] ProtoBuf 解析成功');
    } catch (error) {
      console.error('[MapParser] ProtoBuf 解析失败:', error.message);
      throw new Error('ProtoBuf 解析失败: ' + error.message);
    }

    // 处理数据
    const result = {
      version,
      timestamp: timestamp ? new Date(Number(timestamp)) : null,
      size: worldData.size || 4500,
      maps: this.processMaps(worldData.maps || []),
      prefabs: this.processPrefabs(worldData.prefabs || []),
      paths: this.processPaths(worldData.paths || [])
    };

    console.log('[MapParser] 解析完成:');
    console.log('  - 地图大小:', result.size);
    console.log('  - 地形层数:', result.maps.length);
    console.log('  - 预制体数:', result.prefabs.length);
    console.log('  - 路径数:', result.paths.length);

    return result;
  }

  /**
   * LZ4 解压 (Legacy Stream 格式)
   */
  decompressLZ4(compressedData) {
    // 尝试 lz4net Legacy Stream 格式
    try {
      const result = this.decompressLZ4NetStream(compressedData);
      if (result && result.length > 0) {
        return result;
      }
    } catch (e) {
      console.log('[MapParser] lz4net 格式解压失败:', e.message);
    }

    // 尝试直接解压 (单块)
    try {
      const decompressed = lz4.decompress(compressedData);
      if (decompressed && decompressed.length > 0) {
        return Buffer.from(decompressed);
      }
    } catch (e) {
      console.log('[MapParser] 直接解压失败:', e.message);
    }

    throw new Error('所有 LZ4 解压方式都失败');
  }

  /**
   * 读取 varint (lz4net 格式)
   */
  readVarint(buffer, offset) {
    let result = 0;
    let shift = 0;
    let bytesRead = 0;

    while (offset + bytesRead < buffer.length) {
      const byte = buffer[offset + bytesRead];
      result |= (byte & 0x7f) << shift;
      bytesRead++;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (bytesRead > 10) break; // 防止无限循环
    }

    return { value: result, bytesRead };
  }

  /**
   * lz4net LZ4Stream 解压
   * 格式: 每块 [varint flags] [varint 原始长度] [varint 压缩长度?] [数据]
   * flags & 0x01 = Compressed
   */
  decompressLZ4NetStream(data) {
    const chunks = [];
    let offset = 0;
    let totalDecompressed = 0;

    while (offset < data.length) {
      // 读取 flags
      const flagsResult = this.readVarint(data, offset);
      if (flagsResult.bytesRead === 0) break;
      offset += flagsResult.bytesRead;

      const flags = flagsResult.value;
      const isCompressed = (flags & 0x01) !== 0;

      // 读取原始数据长度
      const originalLengthResult = this.readVarint(data, offset);
      if (originalLengthResult.bytesRead === 0) break;
      offset += originalLengthResult.bytesRead;

      const originalLength = originalLengthResult.value;
      if (originalLength === 0) break; // 流结束

      let compressedLength = originalLength;

      // 如果压缩了，读取压缩后长度
      if (isCompressed) {
        const compressedLengthResult = this.readVarint(data, offset);
        if (compressedLengthResult.bytesRead === 0) break;
        offset += compressedLengthResult.bytesRead;
        compressedLength = compressedLengthResult.value;
      }

      // 检查数据边界
      if (offset + compressedLength > data.length) {
        console.log('[MapParser] 块数据超出文件边界, 停止');
        break;
      }

      // 读取数据
      const blockData = data.slice(offset, offset + compressedLength);
      offset += compressedLength;

      if (isCompressed) {
        // 解压
        try {
          const output = new Uint8Array(originalLength);
          const decompressedSize = lz4.decompressBlock(blockData, output, 0, blockData.length, 0);
          if (decompressedSize > 0) {
            chunks.push(Buffer.from(output.slice(0, decompressedSize)));
            totalDecompressed += decompressedSize;
          } else {
            console.log('[MapParser] 块解压返回 0');
          }
        } catch (e) {
          console.log('[MapParser] 块解压异常:', e.message);
          // 尝试作为未压缩数据处理
          chunks.push(blockData);
          totalDecompressed += blockData.length;
        }
      } else {
        // 未压缩块
        chunks.push(blockData);
        totalDecompressed += blockData.length;
      }
    }

    if (chunks.length === 0) {
      throw new Error('未能解压任何块');
    }

    console.log('[MapParser] 解压了', chunks.length, '个块, 总大小:', totalDecompressed);
    return Buffer.concat(chunks);
  }

  /**
   * 处理地形层数据
   */
  processMaps(maps) {
    return maps.map(m => ({
      name: m.name,
      dataSize: m.data ? m.data.length : 0,
      // 原始数据太大,不直接返回
      // data: m.data
    }));
  }

  /**
   * 处理预制体数据 (纪念碑、建筑等)
   */
  processPrefabs(prefabs) {
    return prefabs.map(p => ({
      category: p.category,
      id: p.id,
      position: p.position ? {
        x: p.position.x,
        y: p.position.y,
        z: p.position.z
      } : null,
      rotation: p.rotation ? {
        x: p.rotation.x,
        y: p.rotation.y,
        z: p.rotation.z
      } : null,
      scale: p.scale ? {
        x: p.scale.x,
        y: p.scale.y,
        z: p.scale.z
      } : null
    }));
  }

  /**
   * 处理路径数据 (道路、河流等)
   */
  processPaths(paths) {
    return paths.map(p => ({
      name: p.name,
      spline: p.spline,
      start: p.start,
      end: p.end,
      width: p.width,
      innerPadding: p.innerPadding,
      outerPadding: p.outerPadding,
      nodeCount: p.nodes ? p.nodes.length : 0,
      nodes: p.nodes ? p.nodes.map(n => ({
        x: n.x,
        y: n.y,
        z: n.z
      })) : []
    }));
  }

  /**
   * 下载文件
   */
  downloadFile(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const options = {
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      const request = protocol.get(url, options, (response) => {
        // 处理重定向
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log('[MapParser] 重定向到:', response.headers.location);
          this.downloadFile(response.headers.location)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        let downloadedSize = 0;
        const totalSize = parseInt(response.headers['content-length'], 10);

        response.on('data', (chunk) => {
          chunks.push(chunk);
          downloadedSize += chunk.length;

          if (totalSize) {
            const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
            process.stdout.write(`\r[MapParser] 下载进度: ${percent}%`);
          }
        });

        response.on('end', () => {
          if (totalSize) {
            process.stdout.write('\n');
          }
          resolve(Buffer.concat(chunks));
        });

        response.on('error', reject);
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('下载超时'));
      });
    });
  }

  /**
   * 清除缓存
   */
  clearCache(url = null) {
    if (url) {
      this.cache.delete(url);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 获取纪念碑列表 (从 prefabs 中提取)
   */
  getMonuments(parsedData) {
    const monumentCategories = ['Monument', 'monument'];
    return parsedData.prefabs.filter(p =>
      monumentCategories.some(cat => p.category?.toLowerCase().includes(cat.toLowerCase()))
    );
  }

  /**
   * 获取道路路径
   */
  getRoads(parsedData) {
    return parsedData.paths.filter(p =>
      p.name?.toLowerCase().includes('road')
    );
  }

  /**
   * 获取河流路径
   */
  getRivers(parsedData) {
    return parsedData.paths.filter(p =>
      p.name?.toLowerCase().includes('river')
    );
  }
}

// 导出单例
export default new RustMapParser();
