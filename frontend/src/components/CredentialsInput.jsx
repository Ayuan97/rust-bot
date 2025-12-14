import { useState } from 'react';
import { FaKey, FaInfoCircle, FaSteam, FaMagic } from 'react-icons/fa';
import { useToast } from './Toast';

function CredentialsInput({ onSubmit, onClose }) {
  const [manualInput, setManualInput] = useState({
    gcm_android_id: '',
    gcm_security_token: '',
    steam_id: '',
    issued_date: '',
    expire_date: '',
    fcm_token: '',
    auth_token: ''
  });
  const [rawInput, setRawInput] = useState('');
  const [error, setError] = useState('');

  const toast = useToast();

  const handleSteamLogin = () => {
    // 在新窗口打开 Steam 登录页面
    const steamWin = window.open('https://companion-rust.facepunch.com/login', '_blank', 'width=800,height=600');

    // 检查弹窗是否被阻止
    if (!steamWin || steamWin.closed || typeof steamWin.closed === 'undefined') {
      setError('浏览器阻止了弹窗，请允许弹窗后重试或手动访问链接');
    }
  };

  const parseCredentialsCommand = (command) => {
    try {
      // 移除 /credentials add 前缀
      const cleanCommand = command.replace(/^\/credentials\s+add\s+/, '').trim();

      // 解析参数
      const params = {};
      const regex = /(\w+):(\S+)/g;
      let match;

      while ((match = regex.exec(cleanCommand)) !== null) {
        params[match[1]] = match[2];
      }

      // 验证必填字段
      if (!params.gcm_android_id || !params.gcm_security_token || !params.steam_id) {
        throw new Error('缺少必填字段');
      }

      return params;
    } catch (err) {
      throw new Error('解析失败，请检查格式');
    }
  };

  const handleRawInputParse = () => {
    setError('');
    try {
      const parsed = parseCredentialsCommand(rawInput);
      setManualInput(parsed);
      setError('');
      toast.success('凭证解析成功，请检查并提交');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    setError('');

    // 验证必填字段
    if (!manualInput.gcm_android_id || !manualInput.gcm_security_token || !manualInput.steam_id) {
      setError('请填写所有必填字段（gcm_android_id, gcm_security_token, steam_id）');
      return;
    }

    // 提交凭证
    onSubmit(manualInput);
  };

  return (
    <div className="panel p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <FaKey className="text-rust-accent text-xl" />
          <h2 className="text-xl font-bold text-white">获取 FCM 凭证</h2>
        </div>
      </div>

      {/* 重要提示 */}
      <div className="mb-6 p-4 bg-rust-accent/10 border border-rust-accent/30 rounded-lg">
        <div className="flex items-start gap-3">
          <FaInfoCircle className="text-rust-accent text-xl mt-1 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold mb-2 text-rust-accent">⚠️ 如何获取凭证</p>
            <ol className="text-gray-300 space-y-2 list-decimal list-inside">
              <li>点击下方"Steam 登录"按钮</li>
              <li>在弹出的窗口中使用 Steam 账号登录</li>
              <li>登录成功后，页面会显示类似这样的凭证信息：
                <div className="mt-2 p-2 bg-black/40 rounded text-xs font-mono border border-white/5 text-gray-400">
                  /credentials add gcm_android_id:5346984656978408915 gcm_security_token:4579341590924378429 steam_id:76561198385127796 issued_date:1760759239 expire_date:1761968839 fcm_token:xxx auth_token:xxx
                </div>
              </li>
              <li>将完整的命令粘贴到下方"快捷输入"框中点击"解析"</li>
              <li>或者手动填写各个字段</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Steam 登录按钮 */}
      <div className="mb-6">
        <button
          className="btn btn-primary w-full flex items-center justify-center gap-2 text-lg py-4"
          onClick={handleSteamLogin}
        >
          <FaSteam className="text-2xl" />
          Steam 登录获取凭证
        </button>
      </div>

      {/* 快捷输入 */}
      <div className="mb-6 p-4 bg-dark-700/50 rounded-lg border border-white/5">
        <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider flex items-center gap-2">
          <FaMagic className="text-rust-accent" />
          快捷输入（粘贴完整命令）
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            className="input flex-1 font-mono text-xs"
            placeholder="/credentials add gcm_android_id:xxx gcm_security_token:xxx steam_id:xxx ..."
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary px-4"
            onClick={handleRawInputParse}
          >
            解析
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-2">
          将 Steam 登录后获取的完整命令粘贴到此处，然后点击"解析"
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 凭证输入表单 */}
      <form onSubmit={handleManualSubmit}>
        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              GCM Android ID <span className="text-rust-accent">*</span>
            </label>
            <input
              type="text"
              className="input w-full font-mono"
              placeholder="5346984656978408915"
              value={manualInput.gcm_android_id}
              onChange={(e) => setManualInput({...manualInput, gcm_android_id: e.target.value})}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              GCM Security Token <span className="text-rust-accent">*</span>
            </label>
            <input
              type="text"
              className="input w-full font-mono"
              placeholder="4579341590924378429"
              value={manualInput.gcm_security_token}
              onChange={(e) => setManualInput({...manualInput, gcm_security_token: e.target.value})}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Steam ID <span className="text-rust-accent">*</span>
            </label>
            <input
              type="text"
              className="input w-full font-mono"
              placeholder="76561198385127796"
              value={manualInput.steam_id}
              onChange={(e) => setManualInput({...manualInput, steam_id: e.target.value})}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Issued Date <span className="text-gray-500">(可选)</span>
            </label>
            <input
              type="text"
              className="input w-full font-mono"
              placeholder="1760759239"
              value={manualInput.issued_date}
              onChange={(e) => setManualInput({...manualInput, issued_date: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Expire Date <span className="text-gray-500">(可选)</span>
            </label>
            <input
              type="text"
              className="input w-full font-mono"
              placeholder="1761968839"
              value={manualInput.expire_date}
              onChange={(e) => setManualInput({...manualInput, expire_date: e.target.value})}
            />
          </div>

          <div className="col-span-1 pt-4 border-t border-white/10">
            <p className="text-sm text-rust-accent mb-2">
              ⚡ 可选字段（提供后可自动完成推送注册）
            </p>
            <p className="text-xs text-gray-400">
              注意：companion-rust.facepunch.com/login 页面可能不提供这些字段。
              如果没有，请使用官方 CLI: npx @liamcottle/rustplus.js fcm-register
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              FCM Token <span className="text-gray-500">(可选，但推荐)</span>
            </label>
            <input
              type="text"
              className="input w-full font-mono text-xs"
              placeholder="如果 companion 页面提供了 fcm_token，请填写"
              value={manualInput.fcm_token}
              onChange={(e) => setManualInput({...manualInput, fcm_token: e.target.value})}
            />
            <p className="text-[10px] text-gray-500 mt-1">
              用于获取 Expo Push Token，实现推送通知
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Auth Token <span className="text-gray-500">(可选，但推荐)</span>
            </label>
            <input
              type="text"
              className="input w-full font-mono text-xs"
              placeholder="如果 companion 页面提供了 auth_token，请填写"
              value={manualInput.auth_token}
              onChange={(e) => setManualInput({...manualInput, auth_token: e.target.value})}
            />
            <p className="text-[10px] text-gray-500 mt-1">
              用于注册到 Rust+ API，实现推送通知
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary flex-1">
            保存并开始监听
          </button>
          <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
            取消
          </button>
        </div>
      </form>

    </div>
  );
}

export default CredentialsInput;
