import { useState, useEffect, useCallback } from 'react';
import type { AudioSettings, PresetType, SampleRate, SpatialMode } from '@/types/audio.types';
import { DEFAULT_SETTINGS, PRESETS } from '@/constants/presets';
import { loadSettings, saveSettings } from '@/utils/storage';
import { sendSettingsToCurrentTab, getStatusFromCurrentTab } from '@/utils/messaging';
import PresetSelector from './components/PresetSelector';
import SampleRateControl from './components/SampleRateControl';
import FrequencyExtender from './components/FrequencyExtender';
import SpatialAudioControl from './components/SpatialAudioControl';
import SpectrumVisualizer from './components/SpectrumVisualizer';

// スイッチコンポーネント
interface ToggleSwitchProps {
  label: string;
  sublabel?: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  color?: string;
}

function ToggleSwitch({ label, sublabel, enabled, onChange, color }: ToggleSwitchProps) {
  return (
    <div className="toggle-row" onClick={() => onChange(!enabled)}>
      <div className="toggle-info">
        <span className="toggle-label">{label}</span>
        {sublabel && <span className="toggle-sublabel">{sublabel}</span>}
      </div>
      <div className={`switch ${enabled ? 'active' : ''}`} style={enabled && color ? { background: color } : {}}>
        <div className="switch-knob" />
      </div>
    </div>
  );
}

export default function App() {
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_SETTINGS);
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState(0);
  const [gpuAvailable, setGpuAvailable] = useState(false);
  const [gpuActive, setGpuActive] = useState(false);

  // GPU可用性チェック
  useEffect(() => {
    const checkGPU = async () => {
      if ('gpu' in navigator) {
        try {
          const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter();
          setGpuAvailable(!!adapter);
        } catch {
          setGpuAvailable(false);
        }
      }
    };
    checkGPU();
  }, []);

  // 設定読み込み
  useEffect(() => {
    loadSettings().then(setSettings);

    // ステータス取得
    const checkStatus = async () => {
      const status = await getStatusFromCurrentTab();
      if (status) {
        setIsConnected(status.connected);
        setLatency(status.latency);
        setGpuActive(status.gpuActive || false);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  // 設定更新ハンドラー
  const updateSettings = useCallback(async (newSettings: AudioSettings) => {
    setSettings(newSettings);
    await saveSettings(newSettings);
    await sendSettingsToCurrentTab(newSettings);
  }, []);

  // メインスイッチ切り替え
  const toggleEnabled = useCallback(() => {
    updateSettings({ ...settings, enabled: !settings.enabled });
  }, [settings, updateSettings]);

  // ハイレゾ切り替え
  const toggleHiRes = useCallback(() => {
    updateSettings({ ...settings, hiResEnabled: !settings.hiResEnabled, preset: 'custom' });
  }, [settings, updateSettings]);

  // 空間オーディオ切り替え
  const toggleSpatial = useCallback(() => {
    updateSettings({ ...settings, spatialEnabled: !settings.spatialEnabled, preset: 'custom' });
  }, [settings, updateSettings]);

  // GPU切り替え
  const toggleGPU = useCallback(() => {
    updateSettings({ ...settings, useGPU: !settings.useGPU });
  }, [settings, updateSettings]);

  // プリセット変更
  const handlePresetChange = useCallback((preset: PresetType) => {
    const presetSettings = PRESETS[preset];
    updateSettings({
      ...settings,
      ...presetSettings,
      preset,
    });
  }, [settings, updateSettings]);

  // サンプルレート変更
  const handleSampleRateChange = useCallback((sampleRate: SampleRate) => {
    updateSettings({
      ...settings,
      preset: 'custom',
      upsampling: { ...settings.upsampling, targetSampleRate: sampleRate },
    });
  }, [settings, updateSettings]);

  // 周波数拡張設定変更
  const handleFrequencyExtensionChange = useCallback((key: string, value: number | boolean) => {
    updateSettings({
      ...settings,
      preset: 'custom',
      frequencyExtension: { ...settings.frequencyExtension, [key]: value },
    });
  }, [settings, updateSettings]);

  // 空間オーディオ設定変更
  const handleSpatialAudioChange = useCallback((key: string, value: number | boolean | SpatialMode) => {
    updateSettings({
      ...settings,
      preset: 'custom',
      spatialAudio: { ...settings.spatialAudio, [key]: value },
    });
  }, [settings, updateSettings]);

  return (
    <div className="popup">
      {/* ヘッダー */}
      <header className="header">
        <div className="header-title">
          <div className="logo">🎵</div>
          <h1>Web UpCon Dolby</h1>
        </div>
        <div className="main-switch">
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {settings.enabled ? 'ON' : 'OFF'}
          </span>
          <div
            className={`switch ${settings.enabled ? 'active' : ''}`}
            onClick={toggleEnabled}
          >
            <div className="switch-knob" />
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className={`content ${!settings.enabled ? 'disabled' : ''}`}>
        {/* プリセット */}
        <PresetSelector
          currentPreset={settings.preset}
          onPresetChange={handlePresetChange}
        />

        {/* メイントグル */}
        <section className="section toggle-section">
          <ToggleSwitch
            label="ハイレゾ"
            sublabel="アップサンプリング + 周波数拡張"
            enabled={settings.hiResEnabled}
            onChange={toggleHiRes}
            color="#f59e0b"
          />
          <ToggleSwitch
            label="空間オーディオ"
            sublabel="サラウンド / Dolby Atmos風"
            enabled={settings.spatialEnabled}
            onChange={toggleSpatial}
            color="#8b5cf6"
          />
          {gpuAvailable && (
            <ToggleSwitch
              label="GPUアクセラレーション"
              sublabel={gpuActive ? 'WebGPU使用中' : 'WebGPU利用可能'}
              enabled={settings.useGPU}
              onChange={toggleGPU}
              color="#10b981"
            />
          )}
        </section>

        {/* スペクトラムビジュアライザー */}
        <SpectrumVisualizer enabled={settings.enabled && isConnected} />

        {/* ハイレゾ設定（展開可能） */}
        {settings.hiResEnabled && (
          <>
            <SampleRateControl
              sampleRate={settings.upsampling.targetSampleRate}
              enabled={settings.upsampling.enabled}
              quality={settings.upsampling.quality}
              onSampleRateChange={handleSampleRateChange}
              onEnabledChange={(enabled) => {
                updateSettings({
                  ...settings,
                  preset: 'custom',
                  upsampling: { ...settings.upsampling, enabled },
                });
              }}
              onQualityChange={(quality) => {
                updateSettings({
                  ...settings,
                  preset: 'custom',
                  upsampling: { ...settings.upsampling, quality },
                });
              }}
            />

            <FrequencyExtender
              settings={settings.frequencyExtension}
              onChange={handleFrequencyExtensionChange}
            />
          </>
        )}

        {/* 空間オーディオ設定（展開可能） */}
        {settings.spatialEnabled && (
          <SpatialAudioControl
            settings={settings.spatialAudio}
            onChange={handleSpatialAudioChange}
          />
        )}
      </main>

      {/* ステータスバー */}
      <footer className="status-bar">
        <div className="status-item">
          <div className={`status-dot ${isConnected ? 'connected' : ''}`} />
          <span>{isConnected ? '接続中' : '未接続'}</span>
        </div>
        <div className="status-item">
          <span>遅延: {latency.toFixed(1)} ms</span>
        </div>
        <div className="status-item">
          <span>{settings.upsampling.targetSampleRate / 1000} kHz</span>
        </div>
        {settings.useGPU && gpuActive && (
          <div className="status-item">
            <span style={{ color: '#10b981' }}>GPU</span>
          </div>
        )}
      </footer>
    </div>
  );
}
