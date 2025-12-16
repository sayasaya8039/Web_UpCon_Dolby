import { useState, useEffect, useCallback } from 'react';
import type { AudioSettings, PresetType, SampleRate, SpatialMode } from '@/types/audio.types';
import { DEFAULT_SETTINGS, PRESETS, SAMPLE_RATE_OPTIONS, SPATIAL_MODE_OPTIONS, FREQUENCY_OPTIONS } from '@/constants/presets';
import { loadSettings, saveSettings } from '@/utils/storage';
import { sendSettingsToCurrentTab, getStatusFromCurrentTab } from '@/utils/messaging';
import PresetSelector from './components/PresetSelector';
import SampleRateControl from './components/SampleRateControl';
import FrequencyExtender from './components/FrequencyExtender';
import SpatialAudioControl from './components/SpatialAudioControl';
import SpectrumVisualizer from './components/SpectrumVisualizer';

export default function App() {
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_SETTINGS);
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState(0);

  // 設定読み込み
  useEffect(() => {
    loadSettings().then(setSettings);

    // ステータス取得
    const checkStatus = async () => {
      const status = await getStatusFromCurrentTab();
      if (status) {
        setIsConnected(status.connected);
        setLatency(status.latency);
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

        {/* スペクトラムビジュアライザー */}
        <SpectrumVisualizer enabled={settings.enabled && isConnected} />

        {/* アップサンプリング */}
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

        {/* 周波数拡張 */}
        <FrequencyExtender
          settings={settings.frequencyExtension}
          onChange={handleFrequencyExtensionChange}
        />

        {/* 空間オーディオ */}
        <SpatialAudioControl
          settings={settings.spatialAudio}
          onChange={handleSpatialAudioChange}
        />
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
      </footer>
    </div>
  );
}
