import { useState, useEffect, useRef } from 'react';

interface SpectrumVisualizerProps {
  enabled: boolean;
}

const BAR_COUNT = 32;

export default function SpectrumVisualizer({ enabled }: SpectrumVisualizerProps) {
  const [bars, setBars] = useState<number[]>(Array.from({ length: BAR_COUNT }, () => 4));
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setBars(Array.from({ length: BAR_COUNT }, () => 4));
      return;
    }

    // デモ用のアニメーション（実際の実装ではContent Scriptから周波数データを受信）
    const animate = () => {
      setBars((prevBars) =>
        prevBars.map((_, i) => {
          // 中央が高く、端が低い形状をベースに
          const centerWeight = 1 - Math.abs(i - BAR_COUNT / 2) / (BAR_COUNT / 2);
          const baseHeight = 10 + centerWeight * 30;
          const variation = Math.random() * 20 - 10;
          return Math.max(4, Math.min(52, baseHeight + variation));
        })
      );
      animationRef.current = requestAnimationFrame(animate);
    };

    // 60fps相当の更新間隔
    const interval = setInterval(() => {
      cancelAnimationFrame(animationRef.current!);
      animationRef.current = requestAnimationFrame(animate);
    }, 50);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(animationRef.current!);
    };
  }, [enabled]);

  return (
    <section className="section" style={{ padding: 8 }}>
      <div className="spectrum">
        {bars.map((height, index) => (
          <div
            key={index}
            className="spectrum-bar"
            style={{ height: `${height}px` }}
          />
        ))}
      </div>
    </section>
  );
}
