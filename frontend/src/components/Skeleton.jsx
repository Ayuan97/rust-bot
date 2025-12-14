/**
 * Skeleton - 加载骨架屏组件
 * 用于在数据加载时显示占位符，减少内容跳动
 */

function Skeleton({ className = '', variant = 'text', width, height, count = 1 }) {
  const baseClass = 'animate-pulse bg-dark-700 rounded';

  const variants = {
    text: 'h-4 rounded',
    title: 'h-6 rounded',
    avatar: 'rounded-full',
    card: 'rounded-xl',
    button: 'h-10 rounded-lg',
  };

  const items = Array.from({ length: count }, (_, i) => i);

  const style = {
    width: width || (variant === 'avatar' ? '40px' : '100%'),
    height: height || (variant === 'avatar' ? '40px' : undefined),
  };

  if (count === 1) {
    return (
      <div
        className={`${baseClass} ${variants[variant]} ${className}`}
        style={style}
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="space-y-2" aria-hidden="true">
      {items.map((i) => (
        <div
          key={i}
          className={`${baseClass} ${variants[variant]} ${className}`}
          style={style}
        />
      ))}
    </div>
  );
}

// 预设骨架屏布局
export function ServerCardSkeleton() {
  return (
    <div className="p-5 rounded-xl bg-dark-800/50 border border-white/5 space-y-4" aria-label="加载中">
      <div className="flex items-start gap-4">
        <Skeleton variant="avatar" width="96px" height="96px" className="rounded-lg" />
        <div className="flex-1 space-y-3">
          <Skeleton variant="title" width="60%" />
          <Skeleton variant="text" width="40%" />
          <div className="pt-2">
            <Skeleton variant="text" width="100%" height="8px" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Skeleton variant="card" height="80px" />
        <Skeleton variant="card" height="80px" />
        <Skeleton variant="card" height="80px" />
      </div>
      <Skeleton variant="button" />
    </div>
  );
}

export function DeviceListSkeleton() {
  return (
    <div className="space-y-2" aria-label="加载中">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 bg-dark-700/50 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton variant="avatar" width="40px" height="40px" />
            <div className="space-y-2">
              <Skeleton variant="text" width="120px" />
              <Skeleton variant="text" width="80px" height="12px" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton variant="button" width="40px" height="40px" />
            <Skeleton variant="button" width="100px" height="40px" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ServerInfoSkeleton() {
  return (
    <div className="space-y-4" aria-label="加载中">
      {/* Banner skeleton */}
      <Skeleton variant="card" height="200px" />

      {/* Stats grid */}
      <div className="panel p-4">
        <Skeleton variant="text" width="100px" className="mb-3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3 bg-dark-900/30 rounded-lg">
              <Skeleton variant="text" width="60px" height="12px" className="mb-2" />
              <Skeleton variant="title" width="80px" />
            </div>
          ))}
        </div>
      </div>

      {/* Team skeleton */}
      <div className="panel p-4">
        <Skeleton variant="text" width="120px" className="mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3 bg-dark-900/30 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton variant="avatar" width="32px" height="32px" />
                <Skeleton variant="text" width="100px" />
              </div>
              <Skeleton variant="text" width="60px" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChatMessageSkeleton() {
  return (
    <div className="space-y-3" aria-label="加载中">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`p-3 rounded-xl max-w-[80%] bg-dark-700/50 ${i % 2 === 0 ? 'ml-auto' : 'mr-auto'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <Skeleton variant="text" width="60px" height="12px" />
            <Skeleton variant="text" width="40px" height="10px" />
          </div>
          <Skeleton variant="text" width={`${60 + Math.random() * 40}%`} />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
