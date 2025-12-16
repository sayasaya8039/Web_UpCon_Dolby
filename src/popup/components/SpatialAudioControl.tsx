import type { SpatialAudioSettings, SpatialMode } from '@/types/audio.types';
import { SPATIAL_MODE_OPTIONS } from '@/constants/presets';

interface SpatialAudioControlProps {
  settings: SpatialAudioSettings;
  onChange: (key: string, value: number | boolean | SpatialMode) => void;
}

export default function SpatialAudioControl({ settings, onChange }: SpatialAudioControlProps) {
  return (
    <section className="section">
      <div className="section-header">
        <span className="section-title">空間オーディオ</span>
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
            <span>モード</span>
          </div>
          <select
            className="select"
            value={settings.mode}
            onChange={(e) => onChange('mode', e.target.value as SpatialMode)}
          >
            {SPATIAL_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {settings.mode !== 'off' && (
          <>
            <div className="slider-group" style={{ marginTop: 12 }}>
              <div className="slider-label">
                <span>横の広がり</span>
                <span className="slider-value">{settings.width}%</span>
              </div>
              <input
                type="range"
                className="slider"
                min="0"
                max="100"
                value={settings.width}
                onChange={(e) => onChange('width', Number(e.target.value))}
              />
            </div>

            <div className="slider-group" style={{ marginTop: 8 }}>
              <div className="slider-label">
                <span>奥行き</span>
                <span className="slider-value">{settings.depth}%</span>
              </div>
              <input
                type="range"
                className="slider"
                min="0"
                max="100"
                value={settings.depth}
                onChange={(e) => onChange('depth', Number(e.target.value))}
              />
            </div>

            {(settings.mode === 'surround-71' || settings.mode === 'atmos') && (
              <div className="slider-group" style={{ marginTop: 8 }}>
                <div className="slider-label">
                  <span>高さ</span>
                  <span className="slider-value">{settings.height}%</span>
                </div>
                <input
                  type="range"
                  className="slider"
                  min="0"
                  max="100"
                  value={settings.height}
                  onChange={(e) => onChange('height', Number(e.target.value))}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
