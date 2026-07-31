import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes, FaWeixin } from 'react-icons/fa';

/** 模块级打开器：控制台 / 过期横幅等多处可调用 */
let openHandler = null;

export function openContactUs() {
  if (typeof openHandler === 'function') {
    openHandler();
  }
}

/**
 * 联系我们弹窗 — 展示微信二维码（扫码开通/续费/咨询）
 * 图片放在 frontend/public/wechat-qr.png
 */
export default function ContactUsModal() {
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    openHandler = () => {
      setImgError(false);
      setOpen(true);
    };
    return () => {
      openHandler = null;
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-ink-900/85"
      onClick={close}
      role="presentation"
    >
      <div
        className="tac-panel tac-corners relative w-full max-w-sm bg-ink-850 border border-ink-line shadow-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-us-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-line">
          <div className="min-w-0">
            <div className="tac-label mb-1">CONTACT // WECHAT</div>
            <h2 id="contact-us-title" className="text-sm font-bold text-fg">
              联系我们
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="w-9 h-9 flex items-center justify-center border border-ink-line text-fg-mute hover:text-hazard hover:border-hazard/40 transition-colors"
            aria-label="关闭"
          >
            <FaTimes />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-fg-dim text-xs">
            <FaWeixin className="text-hazard text-base" />
            <span>微信扫码 · 开通 / 续费 / 问题咨询</span>
          </div>

          <div className="text-center">
            <div className="text-sm font-bold text-fg">青山有风</div>
            <div className="tac-label mt-1 !normal-case !tracking-normal">WECHAT</div>
          </div>

          <div className="w-full max-w-[240px] bg-ink-800 border border-ink-line flex items-center justify-center p-3">
            {!imgError ? (
              <img
                src="/wechat-qr.png"
                alt="微信二维码 · 青山有风"
                className="w-full h-auto object-contain bg-white"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="text-center px-3 py-8 space-y-2">
                <div className="tac-label !text-hazard">QR MISSING</div>
                <p className="text-xs text-fg-dim leading-relaxed">
                  二维码图片未配置。请将微信二维码保存为
                  <span className="font-mono text-fg"> frontend/public/wechat-qr.png </span>
                  后重新构建部署。
                </p>
              </div>
            )}
          </div>

          <p className="text-[11px] text-fg-mute text-center leading-relaxed">
            当前为私有运营模式，扫码添加微信后由管理员为你开通或续期订阅。
          </p>

          <button type="button" onClick={close} className="tac-btn tac-btn-primary w-full !py-2.5">
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
