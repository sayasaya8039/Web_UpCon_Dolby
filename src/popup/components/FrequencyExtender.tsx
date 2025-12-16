import type { FrequencyExtensionSettings } from '@/types/audio.types';
import { FREQUENCY_OPTIONS } from '@/constants/presets';

interface FrequencyExtenderProps {
  settings: FrequencyExtensionSettings;
  onChange: (key: string, value: number | boolean) => void;
}

export default function FrequencyExtender({ settings, onChange }: FrequencyExtenderProps) {
  return (
    <section className="section">
      <div className="section-header">
        <span className="section-title">周波数拡張 (SBR)</span>
        <div
          className="checkbox-group"
          onClick={() => onChange('enabled', !settings.enabled)}
        >
          <div className={`checkbox ${settings.enabled ? 'checked' : ''}`}>
            {settings.enabled && '✓'}
          </div>
        </div>
      </div>

      <div className={!settings.enabled ? 'disabled' : ''}>
        <div className="select-group">
          <div className="slider-label">
            <span>拡張上限周波数</span>
          </div>
          <select
            className="select"
            value={settings.maxFrequency}
            onChange={(e) => onChange('maxFrequency', Number(e.target.value))}
          >
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="slider-group" style={{ marginTop: 12 }}>
          <div className="slider-label">
            <span>拡張強度</span>
            <span className="slider-value">{settings.intensity}%</span>
          </div>
          <input
            type="range"
            className="slider"
            min="0"
            max="100"
            value={settings.intensity}
            onChange={(e) => onChange('intensity', Number(e.target.value))}
          />
        </div>
      </div>
    </section>
  );
}
