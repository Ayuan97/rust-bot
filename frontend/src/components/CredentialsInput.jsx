import { useState } from 'react';
import { FaKey, FaInfoCircle, FaSteam } from 'react-icons/fa';

function CredentialsInput({ onSubmit, onClose }) {
  const [manualInput, setManualInput] = useState({
    gcm_android_id: '',
    gcm_security_token: '',
    steam_id: '',
    issued_date: '',
    expire_date: ''
  });
  const [error, setError] = useState('');

  const handleSteamLogin = () => {
    // 在新窗口打开 Steam 登录页面
    window.open('https://companion-rust.facepunch.com/login', '_blank', 'width=800,height=600');
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
    <div className="card max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-rust-gray">
        <div className="flex items-center gap-2">
          <FaKey className="text-rust-orange text-xl" />
          <h2 className="text-xl font-bold">获取 FCM 凭证</h2>
        </div>
      </div>

      {/* 重要提示 */}
      <div className="mb-6 p-4 bg-rust-orange bg-opacity-20 border border-rust-orange rounded-lg">
        <div className="flex items-start gap-3">
          <FaInfoCircle className="text-rust-orange text-xl mt-1 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold mb-2">⚠️ 如何获取凭证</p>
            <ol className="text-gray-300 space-y-2 list-decimal list-inside">
              <li>点击下方"Steam 登录"按钮</li>
              <li>在弹出的窗口中使用 Steam 账号登录</li>
              <li>登录成功后，页面会显示类似这样的凭证信息：
                <div className="mt-2 p-2 bg-rust-dark rounded text-xs font-mono">
                  /credentials add gcm_android_id:5346984656978408915 gcm_security_token:4579341590924378429 steam_id:76561198385127796 issued_date:1760759239 expire_date:1761968839
                </div>
              </li>
              <li>将这些参数复制并填写到下方表单中</li>
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

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-500 bg-opacity-20 border border-red-500 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 凭证输入表单 */}
      <form onSubmit={handleManualSubmit}>
        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              GCM Android ID <span className="text-red-500">*</span>
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
            <label className="block text-sm font-medium mb-2">
              GCM Security Token <span className="text-red-500">*</span>
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
            <label className="block text-sm font-medium mb-2">
              Steam ID <span className="text-red-500">*</span>
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
            <label className="block text-sm font-medium mb-2">
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
            <label className="block text-sm font-medium mb-2">
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
