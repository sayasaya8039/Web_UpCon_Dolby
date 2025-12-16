import { useState, useEffect, useRef } from 'react';

interface SpectrumVisualizerProps {
  enabled: boolean;
}

const BAR_COUNT = 32;

export default function SpectrumVisualizer({ enabled }: SpectrumVisualizerProps) {
  const [bars, setBars] = useState<number[]>(Array.from({ length: BAR_COUNT }, () => 4));
  const animationRef = useRef<number | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const enabledRef = useRef(enabled);

  // enabledの値をrefに保持（useEffectの再実行を防ぐ）
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // アニメーションは一度だけ開始し、enabledの変化で停止しない
  useEffect(() => {
    const animate = () => {
      if (!enabledRef.current) {
        // 無効時は低いバーを表示
        setBars(Array.from({ length: BAR_COUNT }, () => 4));
        return;
      }

      setBars((prevBars) =>
        prevBars.map((_, i) => {
          const centerWeight = 1 - Math.abs(i - BAR_COUNT / 2) / (BAR_COUNT / 2);
          const baseHeight = 10 + centerWeight * 30;
          const variation = Math.random() * 20 - 10;
          return Math.max(4, Math.min(52, baseHeight + variation));
        })
      );
    };

    // 50ms間隔で更新
    intervalRef.current = setInterval(animate, 50);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []); // 空の依存配列：マウント時に一度だけ実行

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
