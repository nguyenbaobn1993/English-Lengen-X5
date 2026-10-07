import React, { useEffect, useRef, useState } from 'react';

/** Thương hiệu English Legend X5: logo, slogan, ảnh bìa chiến binh và đội ngũ. */

export const BRAND_NAME = 'ENGLISH LEGEND X5';
export const BRAND_SLOGAN = 'LEGEND X5 - CONNECT THE WORLD';

export const TEAM_MEMBERS = [
  { key: 'luu-tuyen', name: 'Lưu Tuyền', title: 'Chiến binh Công nghệ', badge: '⚔️' },
  { key: 'mrs-ly', name: 'Mrs Lý', title: 'Chiến binh Truyền cảm hứng', badge: '💎' },
  { key: 'trang-xinh', name: 'Trang xinh', title: 'Thủ lĩnh Legend X5', badge: '👑' },
  { key: 'ngoc-ha', name: 'Ngọc Hà', title: 'Chiến binh Sáng tạo', badge: '✨' },
  { key: 'dang-thuong', name: 'Đăng Thương', title: 'Chiến binh Bền bỉ', badge: '🏆' }
];

const COVERS = [
  { src: '/brand/cover-racing.jpg', alt: 'Đội Legend X5 – đồng phục đua' },
  { src: '/brand/cover-armor.jpg', alt: 'Đội Legend X5 – chiến giáp' },
  { src: '/brand/cover-palace.jpg', alt: 'Vua App Legend X5 – cung điện' },
  { src: '/brand/cover-gold.jpg', alt: 'Vua App Legend X5 – sân khấu vàng' },
  { src: '/brand/cover-kol.jpg', alt: 'KOL AI Legend X5' }
];

export const LegendLogo = ({ className = 'w-12 h-12' }: { className?: string }) => (
  <img
    src="/brand/logo.jpg"
    alt="Logo Legend X5"
    className={`${className} object-cover rounded-xl border border-highlight-400/70 shadow-lg flex-shrink-0`}
  />
);

export const GoldText = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span
    className={className}
    style={{
      background: 'linear-gradient(180deg,#fff6c9 0%,#ffd76a 35%,#f5b301 60%,#b77900 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent'
    }}
  >
    {children}
  </span>
);

// Nền xanh hoàng gia sáng: ánh trắng-xanh ở giữa trên, ánh vàng & xanh lơ ở hai góc dưới (theo ảnh bìa Legend X5)
export const royalBg: React.CSSProperties = {
  background:
    'radial-gradient(900px 420px at 50% -12%, rgba(150,215,255,.55), transparent 62%),' +
    'radial-gradient(700px 320px at 100% 105%, rgba(255,200,60,.38), transparent 60%),' +
    'radial-gradient(650px 320px at 0% 105%, rgba(60,200,255,.35), transparent 60%),' +
    'linear-gradient(135deg,#0b2e9e 0%,#1554e8 48%,#0c3cc0 100%)'
};

/** Ảnh bìa trượt – 16:9 trên mọi màn hình, vuốt được trên điện thoại. */
export const HeroCarousel = ({ className = '' }: { className?: string }) => {
  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % COVERS.length), 5000);
    return () => clearInterval(t);
  }, [idx]);

  const go = (step: number) => setIdx(i => (i + step + COVERS.length) % COVERS.length);

  return (
    <div
      className={`relative overflow-hidden rounded-[24px] border-2 border-highlight-400/60 shadow-2xl bg-brand-900 ${className}`}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {COVERS.map((c, i) => (
          <div key={c.src} className="flex-[0_0_100%] aspect-video">
            <img src={c.src} alt={c.alt} loading={i === 0 ? 'eager' : 'lazy'} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
      <button type="button" onClick={() => go(-1)} aria-label="Ảnh trước" className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white items-center justify-center">‹</button>
      <button type="button" onClick={() => go(1)} aria-label="Ảnh sau" className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white items-center justify-center">›</button>
      <div className="absolute bottom-2.5 inset-x-0 flex justify-center gap-1.5">
        {COVERS.map((c, i) => (
          <button
            type="button"
            key={c.src}
            aria-label={`Ảnh ${i + 1}`}
            onClick={() => setIdx(i)}
            className={`h-2 rounded-full transition-all ${i === idx ? 'w-6 bg-highlight-400' : 'w-2 bg-white/50'}`}
          />
        ))}
      </div>
    </div>
  );
};

/** Giới thiệu 5 thành viên tham gia. */
export const TeamShowcase = ({ compact = false }: { compact?: boolean }) => (
  <div className="rounded-[24px] p-4 sm:p-6 text-white border-2 border-highlight-400/50 shadow-xl font-sans" style={royalBg}>
    <div className="flex items-end justify-between gap-3 mb-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-highlight-300">Các thành viên tham gia</p>
        <h3 className="text-xl sm:text-2xl font-bold uppercase" style={{ fontFamily: "'Chakra Petch', sans-serif" }}>
          <GoldText>Legend X5</GoldText> Team
        </h3>
      </div>
    </div>
    <div className="flex md:grid md:grid-cols-5 gap-3 overflow-x-auto snap-x snap-mandatory pb-1">
      {TEAM_MEMBERS.map(m => (
        <div key={m.key} className="snap-start flex-shrink-0 w-[42%] sm:w-[30%] md:w-auto rounded-2xl overflow-hidden border border-highlight-400/40 bg-white/5">
          <div className="relative aspect-[3/4] overflow-hidden">
            <img src={`/brand/m-${m.key}.jpg`} alt={m.name} loading="lazy" className="w-full h-full object-cover hover:scale-105 transition duration-500" />
            <span className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/50 border border-highlight-400/60 flex items-center justify-center">{m.badge}</span>
          </div>
          <div className="p-2.5 text-center">
            <div className="font-extrabold text-sm text-highlight-300">{m.name}</div>
            {!compact && <div className="text-[10px] text-brand-200 truncate">{m.title}</div>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** Chân trang – chỉ logo, slogan và đội ngũ (không có thông tin liên hệ). */
export const BrandFooter = ({ children }: { children?: React.ReactNode }) => (
  <footer className="text-white border-t-4 border-highlight-400/60 pt-12 pb-10 font-sans" style={royalBg}>
    <div className="max-w-[1500px] mx-auto px-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center mb-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <LegendLogo className="w-20 h-20" />
          <div>
            <h3 className="text-2xl font-bold uppercase leading-none" style={{ fontFamily: "'Chakra Petch', sans-serif" }}>
              English <GoldText>Legend X5</GoldText>
            </h3>
            <p className="text-sky-100 text-xs mt-2">Lưu Tuyền • Mrs Lý • Trang xinh • Ngọc Hà • Đăng Thương</p>
          </div>
        </div>
        <div>{children}</div>
        <div className="p-5 rounded-2xl bg-white/5 border border-highlight-400/30 text-center space-y-2">
          <p className="text-lg sm:text-xl font-extrabold text-highlight-300 tracking-wide">{BRAND_SLOGAN}</p>
          <div className="w-12 h-0.5 bg-highlight-400/50 mx-auto" />
          <p className="text-xs font-black tracking-wider uppercase">🌏 Kết nối thế giới bằng tiếng Anh</p>
        </div>
      </div>
      <div className="pt-6 border-t border-white/10 text-center text-xs text-brand-200/80">
        © 2026 English Legend X5 • {BRAND_SLOGAN}
      </div>
    </div>
  </footer>
);
