import type { PresetType } from '@/types/audio.types';

interface PresetSelectorProps {
  currentPreset: PresetType;
  onPresetChange: (preset: PresetType) => void;
}

const PRESETS: { value: PresetType; label: string; icon: string }[] = [
  { value: 'music', label: '音楽', icon: '🎵' },
  { value: 'movie', label: '映画', icon: '🎬' },
  { value: 'gaming', label: 'ゲーム', icon: '🎮' },
  { value: 'custom', label: 'カスタム', icon: '⚙️' },
];

export default function PresetSelector({ currentPreset, onPresetChange }: PresetSelectorProps) {
  return (
    <section className="section">
      <div className="section-header">
        <span className="section-title">プリセット</span>
      </div>
      <div className="preset-buttons">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            className={`preset-btn ${currentPreset === preset.value ? 'active' : ''}`}
            onClick={() => onPresetChange(preset.value)}
          >
            <span style={{ marginRight: 4 }}>{preset.icon}</span>
            {preset.label}
          </button>
        ))}
      </div>
    </section>
  );
}
