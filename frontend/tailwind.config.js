/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ===== 新设计系统：Tactical Telemetry（暗色战术遥测） =====
        ink: {
          900: '#0A0A0A', // 主背景（停用的 CRT，避免纯黑）
          850: '#0F0F0F', // 面板底
          800: '#141414', // 抬升面板
          700: '#1A1A1A', // 输入/凹陷区
          line: '#2A2A2A', // 发丝线 / 边框
          line2: '#3A3A3A', // 高亮边框
        },
        fg: {
          DEFAULT: '#EAEAEA', // 主文字（白磷光）
          dim: '#9A9A9A',     // 次要文字（对比 >AA）
          mute: '#6A6A6A',    // 弱（仅大字 / 装饰，不用于正文）
        },
        hazard: {
          DEFAULT: '#E0452E', // 唯一强调色：Rust hazard red
          bright: '#FF5A3C',
          dim: 'rgba(224, 69, 46, 0.12)',
        },
        terminal: '#4AF626', // 终端绿，仅用于单点状态

        // ===== 旧系统（兼容尚未迁移的页面，勿在新页使用） =====
        dark: {
          900: '#09090b', 800: '#18181b', 700: '#27272a',
          600: '#3f3f46', 500: '#52525b', surface: '#18181b',
        },
        rust: {
          accent: '#ce422b', hover: '#e0523b', dim: 'rgba(206, 66, 43, 0.1)',
          orange: '#cd5241', dark: '#8a2c21',
        },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', '"Source Han Sans SC"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"IBM Plex Mono"', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.045em',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'tac-flicker': 'tacFlicker 5s steps(3) infinite',
        'tac-blink': 'tacBlink 1.4s steps(1) infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: { '0%': { transform: 'translateX(-20px)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
        tacFlicker: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.94' } },
        tacBlink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
    },
  },
  plugins: [],
}
