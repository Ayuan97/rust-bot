import React from 'react';
import { FaServer } from 'react-icons/fa';

function ServerSidebarItem({ server, isActive, onSelect }) {
  return (
    <div
      className={`group relative flex items-center gap-3 p-3 rounded-xl transition-all duration-200 cursor-pointer border ${
        isActive
          ? 'bg-rust-accent/10 border-rust-accent/50 shadow-[0_0_15px_rgba(206,66,43,0.15)]'
          : 'bg-transparent border-transparent hover:bg-dark-700/50 hover:border-dark-600'
      }`}
      onClick={() => onSelect(server)}
    >
      {/* Active Indicator Bar */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-rust-accent rounded-r-full shadow-[0_0_10px_#ce422b]" />
      )}

      {/* Server Icon/Image */}
      <div className="relative flex-shrink-0">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden border ${
            isActive ? 'border-rust-accent/30' : 'border-dark-600 group-hover:border-dark-500'
        } bg-dark-800`}>
            {server.img || server.logo ? (
            <img src={server.img || server.logo} alt="" className="w-full h-full object-cover" />
            ) : (
            <FaServer className={`text-sm ${isActive ? 'text-rust-accent' : 'text-gray-500'}`} />
            )}
        </div>
        
        {/* Status Dot */}
        <div className="absolute -bottom-1 -right-1 bg-dark-900 rounded-full p-0.5">
            {server.connected ? (
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
            ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-dark-600 border border-dark-500" />
            )}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>
          {server.name}
        </h3>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="truncate">{server.ip}:{server.port}</span>
        </div>
      </div>
    </div>
  );
}

export default ServerSidebarItem;



