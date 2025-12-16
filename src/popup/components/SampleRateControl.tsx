import type { SampleRate } from '@/types/audio.types';
import { SAMPLE_RATE_OPTIONS } from '@/constants/presets';

interface SampleRateControlProps {
  sampleRate: SampleRate;
  enabled: boolean;
  quality: 'linear' | 'sinc';
  onSampleRateChange: (sampleRate: SampleRate) => void;
  onEnabledChange: (enabled: boolean) => void;
  onQualityChange: (quality: 'linear' | 'sinc') => void;
}

export default function SampleRateControl({
  sampleRate,
  enabled,
  quality,
  onSampleRateChange,
  onEnabledChange,
  onQualityChange,
}: SampleRateControlProps) {
  return (
    <section className="section">
      <div className="section-header">
        <span className="section-title">アップサンプリング</span>
        <div
          className="checkbox-group"
          onClick={() => onEnabledChange(!enabled)}
        >
          <div className={`checkbox ${enabled ? 'checked' : ''}`}>
            {enabled && '✓'}
          </div>
        </div>
      </div>

      <div className={!enabled ? 'disabled' : ''}>
        <div className="select-group">
          <div className="slider-label">
            <span>出力サンプルレート</span>
          </div>
          <select
            className="select"
            value={sampleRate}
            onChange={(e) => onSampleRateChange(Number(e.target.value) as SampleRate)}
          >
            {SAMPLE_RATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="select-group" style={{ marginTop: 12 }}>
          <div className="slider-label">
            <span>補間品質</span>
          </div>
          <select
            className="select"
            value={quality}
            onChange={(e) => onQualityChange(e.target.value as 'linear' | 'sinc')}
          >
            <option value="linear">リニア（低遅延）</option>
            <option value="sinc">Sinc（高品質）</option>
          </select>
        </div>
      </div>
    </section>
  );
}
