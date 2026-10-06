
import React, { useRef, useEffect, useState } from 'react';
import { MindMapData } from '../types';
import { toPng } from 'html-to-image';

interface MindMapProps {
  data: MindMapData;
}

export const MindMap: React.FC<MindMapProps> = ({ data }) => {
  const posterRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<React.ReactElement[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  const CANVAS_WIDTH = 1400;
  const CANVAS_HEIGHT = 1000;
  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;
  const nodes = data?.nodes || [];
  const nodeCount = nodes.length;
  const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#2dd4bf'];
  const [positions, setPositions] = useState<Array<{x: number, y: number, color: string, scale: number}>>([]);

  useEffect(() => {
    if (!data || !nodes.length) return;
    const calculatedPositions: any[] = [];
    const innerThreshold = 6;
    const isTwoCircles = nodeCount > innerThreshold;
    const innerCount = isTwoCircles ? innerThreshold : nodeCount;
    const outerCount = isTwoCircles ? nodeCount - innerThreshold : 0;

    const innerRx = 340;
    const innerRy = 260;
    const outerRx = 560;
    const outerRy = 420;

    nodes.forEach((_, index) => {
      let tx, ty, scale;
      if (index < innerThreshold) {
        const angle = (index * (2 * Math.PI) / innerCount) - Math.PI / 2;
        tx = centerX + innerRx * Math.cos(angle);
        ty = centerY + innerRy * Math.sin(angle);
        scale = 1.0;
      } else {
        const outerIdx = index - innerThreshold;
        const angle = (outerIdx * (2 * Math.PI) / outerCount) - (Math.PI / 2) + (Math.PI / outerCount);
        tx = centerX + outerRx * Math.cos(angle);
        ty = centerY + outerRy * Math.sin(angle);
        scale = 0.85;
      }
      calculatedPositions.push({ x: tx, y: ty, color: colors[index % colors.length], scale });
    });
    setPositions(calculatedPositions);
    
    const newLines = calculatedPositions.map((pos, index) => {
      const isInner = index < innerThreshold;
      const cp1x = centerX + (pos.x - centerX) * 0.4;
      const cp1y = centerY + (pos.y - centerY) * 0.1;
      const cp2x = centerX + (pos.x - centerX) * 0.6;
      const cp2y = centerY + (pos.y - centerY) * 0.8;
      const pathData = `M ${centerX} ${centerY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pos.x} ${pos.y}`;
      return (
        <path key={index} d={pathData} fill="none" stroke={pos.color} strokeWidth={isInner ? 12 : 6} strokeLinecap="round" strokeOpacity="0.4" />
      );
    });
    setLines(newLines);
  }, [data, nodeCount]);

  const handleDownload = async () => {
    if (!posterRef.current) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(posterRef.current, { cacheBust: true, backgroundColor: '#ffffff', width: CANVAS_WIDTH, height: CANVAS_HEIGHT, pixelRatio: 3 });
      const link = document.createElement('a');
      link.download = `MindMap-LegendX5-${data.center?.title_en}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) { alert("Lỗi khi tạo ảnh!"); } finally { setIsDownloading(false); }
  };

  return (
    <div className="flex flex-col items-center w-full pb-10">
      <div className="mb-8">
        <button onClick={handleDownload} disabled={isDownloading} className="px-14 py-5 bg-brand-600 text-white rounded-[2rem] font-black text-2xl shadow-2xl hover:bg-brand-700 transition-all transform hover:scale-105 border-b-[10px] border-brand-800 active:border-b-0 uppercase">
          {isDownloading ? 'Đang vẽ sơ đồ...' : '🎨 Xuất Sơ Đồ Tony Buzan'}
        </button>
      </div>
      <div className="w-full max-w-full overflow-hidden flex justify-center bg-slate-50/50 p-6 md:p-10 rounded-[4rem] border-4 border-slate-100">
        <div ref={posterRef} className="relative bg-white rounded-[3rem] shadow-2xl border-[15px] border-brand-50 select-none overflow-hidden flex-shrink-0 origin-center scale-[0.4] sm:scale-[0.55] md:scale-[0.8] lg:scale-100" style={{ width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px` }}>
          <svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0 z-0">{lines}</svg>
          
          <div className="absolute top-10 right-12 z-40 flex flex-col items-center bg-white/80 p-4 rounded-3xl border border-brand-100 backdrop-blur-sm">
             <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center text-white text-2xl mb-1 shadow-lg">👩‍🏫</div>
             <span className="font-black text-[12px] uppercase tracking-widest text-brand-900">English Legend X5</span>
          </div>

          <div className="absolute z-30 flex flex-col items-center justify-center text-center bg-white border-[10px] border-brand-500 rounded-[3rem] shadow-2xl p-6" style={{ left: centerX, top: centerY, width: '320px', height: '220px', transform: 'translate(-50%, -50%) rotate(-1deg)' }}>
            <div className="text-7xl mb-1">{data.center?.emoji || '🌟'}</div>
            <h1 className="text-3xl font-black text-brand-900 uppercase leading-tight font-display">{data.center?.title_en}</h1>
            <p className="text-sm font-black text-brand-500 mt-1 uppercase tracking-widest">{data.center?.title_vi}</p>
          </div>

          {positions.map((pos, index) => {
             const node = nodes[index];
             if (!node) return null;
             return (
               <div key={index} className="absolute z-20 flex flex-col items-center bg-white rounded-[2rem] shadow-lg border-2 p-4 transition-all hover:scale-110" 
                 style={{ left: pos.x, top: pos.y, width: `${260 * pos.scale}px`, borderColor: pos.color, transform: 'translate(-50%, -50%)' }}>
                  <div className="flex items-center gap-4 w-full">
                    <span className="text-5xl shrink-0">{node.emoji}</span>
                    <div className="text-left overflow-hidden">
                       <div className="font-black text-slate-800 text-lg leading-tight truncate">{node.text_en}</div>
                       <div className="text-xs font-black uppercase tracking-wider mt-1 truncate" style={{ color: pos.color }}>{node.text_vi}</div>
                    </div>
                  </div>
               </div>
             );
          })}
        </div>
      </div>
    </div>
  );
};
