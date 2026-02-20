/**
 * 环境变量验证
 * 在应用启动时验证必需的环境变量
 */

/**
 * 必需的环境变量列表
 */
const REQUIRED_ENV_VARS = [
  'JWT_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
];

/**
 * 可选但推荐的环境变量
 */
const RECOMMENDED_ENV_VARS = [
  'FRONTEND_URL',
  'ALIPAY_APP_ID',
  'ALIPAY_PRIVATE_KEY',
  'ALIPAY_PUBLIC_KEY',
];

/**
 * 验证环境变量
 * @throws {Error} 如果必需的环境变量缺失
 */
export function validateEnv() {
  const missing = [];
  const warnings = [];

  // 检查必需的环境变量
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // 检查 JWT_SECRET 强度
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      warnings.push('JWT_SECRET 长度应至少为 32 个字符以确保安全性');
    }
    if (process.env.JWT_SECRET === 'your-secret-key' ||
        process.env.JWT_SECRET === 'your-secret-key-here') {
      missing.push('JWT_SECRET (当前使用默认值，必须修改)');
    }
  }

  // 检查推荐的环境变量
  for (const key of RECOMMENDED_ENV_VARS) {
    if (!process.env[key]) {
      warnings.push(`推荐配置 ${key}`);
    }
  }

  if (!process.env.INTERNAL_API_TOKEN) {
    missing.push('INTERNAL_API_TOKEN');
  }
  if (String(process.env.AUTOSCALER_ENABLED || 'false') === 'true') {
    if (!process.env.AUTOSCALER_WEBHOOK_URL &&
        !process.env.AUTOSCALER_SCALE_UP_COMMAND &&
        !process.env.AUTOSCALER_SCALE_DOWN_COMMAND) {
      warnings.push('AUTOSCALER_ENABLED=true but no webhook or scale commands are configured');
    }
  }

  // 输出警告
  if (warnings.length > 0) {
    console.warn('\n⚠️  环境变量警告:');
    warnings.forEach(w => console.warn(`   - ${w}`));
    console.warn('');
  }

  // 如果有缺失的必需变量，抛出错误
  if (missing.length > 0) {
    console.error('\n❌ 缺少必需的环境变量:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n请在项目根目录 .env 文件中配置这些变量\n');
    throw new Error(`缺少必需的环境变量: ${missing.join(', ')}`);
  }

  console.log('✅ 环境变量验证通过');
}

/**
 * 获取 JWT 密钥
 * @returns {string} JWT 密钥
 * @throws {Error} 如果 JWT_SECRET 未配置
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET 环境变量未配置');
  }
  return secret;
}

export default { validateEnv, getJwtSecret };
