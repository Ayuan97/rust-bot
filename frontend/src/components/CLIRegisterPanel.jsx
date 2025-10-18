import { FaTerminal, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

function CLIRegisterPanel({ onClose }) {
  return (
    <div className="card max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-rust-gray">
        <div className="flex items-center gap-2">
          <FaTerminal className="text-rust-orange text-xl" />
          <h2 className="text-xl font-bold">使用官方 CLI 注册</h2>
        </div>
      </div>

      {/* 为什么需要 CLI */}
      <div className="mb-6 p-4 bg-rust-orange bg-opacity-20 border border-rust-orange rounded-lg">
        <div className="flex items-start gap-3">
          <FaExclamationTriangle className="text-rust-orange text-xl mt-1 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold mb-2">为什么需要使用 CLI？</p>
            <p className="text-gray-300">
              companion-rust.facepunch.com 网页只提供基本的 GCM 凭证，
              无法完成完整的推送注册流程。要接收游戏内的配对推送，
              必须使用官方 CLI 完成完整的注册流程。
            </p>
          </div>
        </div>
      </div>

      {/* 注册步骤 */}
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="bg-rust-orange text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
            打开终端
          </h3>
          <div className="ml-8 p-3 bg-rust-gray rounded-lg">
            <p className="text-sm text-gray-300 mb-2">
              在后端项目目录打开终端（或者任意目录都可以）
            </p>
            <code className="text-xs bg-rust-dark px-2 py-1 rounded">
              cd /Users/administer/Desktop/go/rust-bot-new/backend
            </code>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="bg-rust-orange text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
            运行注册命令
          </h3>
          <div className="ml-8 p-3 bg-rust-gray rounded-lg">
            <p className="text-sm text-gray-300 mb-2">执行以下命令：</p>
            <div className="bg-rust-dark p-3 rounded font-mono text-xs overflow-x-auto">
              npx @liamcottle/rustplus.js fcm-register
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="bg-rust-orange text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span>
            完成 Steam 登录
          </h3>
          <div className="ml-8 p-3 bg-rust-gray rounded-lg">
            <p className="text-sm text-gray-300">
              命令会自动打开浏览器，使用你的 Steam 账号登录即可。
              登录成功后，终端会显示注册成功的消息。
            </p>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="bg-rust-orange text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">4</span>
            凭证自动保存
          </h3>
          <div className="ml-8 p-3 bg-rust-gray rounded-lg">
            <p className="text-sm text-gray-300 mb-2">
              凭证会自动保存到：
            </p>
            <code className="text-xs bg-rust-dark px-2 py-1 rounded block">
              ~/.rustplus/credentials
            </code>
            <p className="text-sm text-gray-300 mt-2">
              重启后端服务，会自动加载这个凭证文件并开始监听推送。
            </p>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <FaCheckCircle className="text-green-500" />
            完成
          </h3>
          <div className="ml-8 p-3 bg-green-500 bg-opacity-20 border border-green-500 rounded-lg">
            <p className="text-sm text-gray-300">
              重启后端后，返回此页面，应该会看到"FCM 凭证：已保存"的状态。
              然后就可以在游戏中进行服务器配对了！
            </p>
          </div>
        </div>
      </div>

      {/* 提示 */}
      <div className="mt-6 p-3 bg-rust-gray rounded-lg text-xs text-gray-400">
        <p className="font-semibold mb-2">注意事项：</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>确保已安装 Node.js（建议 v16 或更高版本）</li>
          <li>首次运行会自动下载依赖，可能需要几秒钟</li>
          <li>凭证有效期约 2 周，过期后需要重新注册</li>
          <li>一个 Steam 账号可以注册多个设备</li>
        </ul>
      </div>

      <div className="mt-6">
        <button
          className="btn btn-secondary w-full"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
}

export default CLIRegisterPanel;
