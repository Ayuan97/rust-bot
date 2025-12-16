import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import AdmZip from 'adm-zip';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Xray-Core 下载器
 * 自动下载适配当前系统的 xray-core 二进制文件
 */
class XrayDownloader {
  constructor() {
    this.binDir = path.join(__dirname, '../../bin');
    this.version = '1.8.23'; // Xray-core 版本
    this.baseUrl = 'https://github.com/XTLS/Xray-core/releases/download';

    // GitHub 镜像列表（国内加速）
    this.mirrors = [
      'https://ghfast.top',           // ghfast 镜像
      'https://gh-proxy.com',          // gh-proxy 镜像
      'https://mirror.ghproxy.com',    // ghproxy 镜像
      ''                               // 直连（最后尝试）
    ];
  }

  /**
   * 获取当前系统信息
   */
  getSystemInfo() {
    const platform = process.platform; // 'win32', 'linux', 'darwin'
    const arch = process.arch;         // 'x64', 'arm64', etc.

    let osName, archName, fileName, executableName;

    // 确定操作系统
    if (platform === 'win32') {
      osName = 'windows';
      executableName = 'xray.exe';
    } else if (platform === 'linux') {
      osName = 'linux';
      executableName = 'xray';
    } else if (platform === 'darwin') {
      osName = 'macos';
      executableName = 'xray';
    } else {
      throw new Error(`不支持的操作系统: ${platform}`);
    }

    // 确定架构
    if (arch === 'x64') {
      archName = '64';
    } else if (arch === 'arm64') {
      archName = 'arm64-v8a';
    } else if (arch === 'arm') {
      archName = 'arm32-v7a';
    } else {
      throw new Error(`不支持的架构: ${arch}`);
    }

    // 构建文件名
    fileName = `Xray-${osName}-${archName}.zip`;

    return {
      platform,
      arch,
      osName,
      archName,
      fileName,
      executableName,
      executablePath: path.join(this.binDir, executableName),
    };
  }

  /**
   * 检查 xray 是否已存在
   */
  isXrayInstalled() {
    const { executablePath } = this.getSystemInfo();
    return fs.existsSync(executablePath);
  }

  /**
   * 下载 xray-core（支持镜像自动切换）
   */
  async downloadXray() {
    const systemInfo = this.getSystemInfo();
    const { fileName, executablePath } = systemInfo;

    // 创建 bin 目录
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
      logger.info('📁 创建 bin 目录');
    }

    // 如果已存在，跳过下载
    if (this.isXrayInstalled()) {
      logger.info('✅ Xray-core 已存在，跳过下载');
      return executablePath;
    }

    logger.info('📦 开始下载 Xray-core...');
    logger.info(`   系统: ${systemInfo.osName}-${systemInfo.archName}`);
    logger.info(`   版本: v${this.version}`);

    const originalUrl = `${this.baseUrl}/v${this.version}/${fileName}`;
    const zipPath = path.join(this.binDir, fileName);

    // 尝试每个镜像
    let lastError = null;
    for (const mirror of this.mirrors) {
      const downloadUrl = mirror
        ? `${mirror}/${originalUrl}`
        : originalUrl;

      const mirrorName = mirror || '直连 GitHub';
      logger.info(`   尝试: ${mirrorName}`);
      logger.info(`   URL: ${downloadUrl}`);

      try {
        await this.downloadFile(downloadUrl, zipPath);

        // 下载成功，解压
        logger.info('📦 正在解压...');
        await this.extractZip(zipPath, this.binDir);

        // 删除 zip 文件
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }

        // 设置可执行权限（Linux/Mac）
        if (systemInfo.platform !== 'win32') {
          logger.info('🔧 设置可执行权限...');
          fs.chmodSync(executablePath, '755');
        }

        logger.info('✅ Xray-core 下载完成！');
        logger.info(`   路径: ${executablePath}`);

        return executablePath;
      } catch (error) {
        lastError = error;
        logger.warn(`   ⚠️ ${mirrorName} 失败: ${error.message}`);
        // 清理可能的不完整文件
        if (fs.existsSync(zipPath)) {
          try { fs.unlinkSync(zipPath); } catch {}
        }
        // 继续尝试下一个镜像
      }
    }

    // 所有镜像都失败
    logger.error('❌ 所有下载源都失败');
    logger.error('   请手动下载 Xray-core 并放置到 backend/bin/ 目录');
    logger.error(`   下载地址: ${originalUrl}`);
    throw lastError || new Error('所有下载源都失败');
  }

  /**
   * 下载文件（支持进度显示和超时）
   */
  downloadFile(url, dest, timeout = 30000) {
    return new Promise((resolve, reject) => {
      // 清理可能存在的旧文件
      if (fs.existsSync(dest)) {
        try { fs.unlinkSync(dest); } catch {}
      }

      const file = fs.createWriteStream(dest);
      let receivedBytes = 0;
      let totalBytes = 0;
      let timeoutId;

      const protocol = url.startsWith('https://') ? https : http;

      const request = protocol.get(url, { timeout }, (response) => {
        // 清除超时计时器
        if (timeoutId) clearTimeout(timeoutId);

        // 处理重定向
        if (response.statusCode === 302 || response.statusCode === 301) {
          file.close();
          const redirectUrl = response.headers.location;
          logger.info(`   重定向到: ${redirectUrl.substring(0, 80)}...`);
          return this.downloadFile(redirectUrl, dest, timeout).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'], 10) || 0;

        // 设置数据超时（30秒无数据则超时）
        let lastDataTime = Date.now();
        const dataTimeoutCheck = setInterval(() => {
          if (Date.now() - lastDataTime > 30000) {
            clearInterval(dataTimeoutCheck);
            request.destroy();
            file.close();
            reject(new Error('下载超时（无数据）'));
          }
        }, 5000);

        response.on('data', (chunk) => {
          lastDataTime = Date.now();
          receivedBytes += chunk.length;
          file.write(chunk);

          // 显示进度（每 1MB 显示一次）
          if (totalBytes > 0 && (receivedBytes % (1024 * 1024) < chunk.length || receivedBytes === totalBytes)) {
            const percent = ((receivedBytes / totalBytes) * 100).toFixed(1);
            const mbReceived = (receivedBytes / 1024 / 1024).toFixed(1);
            const mbTotal = (totalBytes / 1024 / 1024).toFixed(1);
            logger.info(`   下载进度: ${percent}% (${mbReceived}MB / ${mbTotal}MB)`);
          }
        });

        response.on('end', () => {
          clearInterval(dataTimeoutCheck);
          file.end();
          logger.info('   下载完成');
          resolve();
        });

        response.on('error', (err) => {
          clearInterval(dataTimeoutCheck);
          file.close();
          reject(err);
        });
      });

      // 设置连接超时
      timeoutId = setTimeout(() => {
        request.destroy();
        file.close();
        reject(new Error('连接超时'));
      }, timeout);

      request.on('error', (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        file.close();
        if (fs.existsSync(dest)) {
          try { fs.unlinkSync(dest); } catch {}
        }
        reject(err);
      });

      request.on('timeout', () => {
        if (timeoutId) clearTimeout(timeoutId);
        request.destroy();
        file.close();
        reject(new Error('请求超时'));
      });
    });
  }

  /**
   * 解压 ZIP 文件
   */
  async extractZip(zipPath, targetDir) {
    try {
      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();

      // 只提取 xray 可执行文件
      for (const entry of zipEntries) {
        if (entry.entryName.includes('xray') && !entry.isDirectory) {
          logger.info(`   提取: ${entry.entryName}`);
          zip.extractEntryTo(entry, targetDir, false, true);
        }
      }
    } catch (error) {
      logger.error('解压失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取 xray 可执行文件路径
   */
  getXrayPath() {
    const { executablePath } = this.getSystemInfo();
    return executablePath;
  }
}

export default new XrayDownloader();
