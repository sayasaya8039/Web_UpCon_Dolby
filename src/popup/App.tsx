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

/**
 * 設定に基づいて期待される遅延を計算（ミリ秒）
 */
function calculateExpectedLatency(settings: AudioSettings): number {
  const sampleRate = 48000; // 基本サンプルレート
  let totalSamples = 0;
  const workletBufferSize = 128;
  let activeNodes = 1;

  // アップサンプラーの遅延
  if (settings.hiResEnabled && settings.upsampling.enabled) {
    activeNodes++;
    const sincWindow = settings.lowLatencyMode ? 4 : 16;
    totalSamples += sincWindow / 2;
  }

  // スペクトラル拡張の遅延
  if (settings.hiResEnabled && settings.frequencyExtension.enabled) {
    activeNodes++;
    totalSamples += settings.lowLatencyMode ? 256 : 512;
  }

  // 空間オーディオの遅延
  if (settings.spatialEnabled && settings.spatialAudio.enabled) {
    activeNodes++;
    const maxDelay = settings.lowLatencyMode ? 50 : 200;
    totalSamples += maxDelay * (settings.spatialAudio.depth / 100);

    if (settings.spatialAudio.mode === 'atmos') {
      const heightDelay = (settings.lowLatencyMode ? 25 : 100) * (settings.spatialAudio.height / 100);
      totalSamples += heightDelay;
    }
  }

  totalSamples += workletBufferSize * activeNodes;

  // 処理遅延のみ（ハードウェア遅延は接続時に加算される）
  return (totalSamples / sampleRate) * 1000;
}

export default function App() {
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_SETTINGS);
  const [isConnected, setIsConnected] = useState(false);
  const [actualLatency, setActualLatency] = useState(0);
  const [gpuAvailable, setGpuAvailable] = useState(false);
  const [gpuActive, setGpuActive] = useState(false);

  // 表示する遅延（接続時は実測値、未接続時は期待値）
  const displayLatency = isConnected ? actualLatency : calculateExpectedLatency(settings);

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

    // ステータス取得（エラー時は無視）
    const checkStatus = async () => {
      try {
        const status = await getStatusFromCurrentTab();
        if (status) {
          setIsConnected(status.connected);
          setActualLatency(status.latency);
          setGpuActive(status.gpuActive || false);
        }
      } catch (e) {
        // エラーは無視（未接続時など）
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  // 設定更新ハンドラー（非ブロッキング）
  const updateSettings = useCallback((newSettings: AudioSettings) => {
    // UIを即座に更新（楽観的更新）
    setSettings(newSettings);

    // バックグラウンドで保存・送信（エラーは無視）
    Promise.resolve().then(async () => {
      try {
        await saveSettings(newSettings);
      } catch (e) {
        console.warn('[App] 設定保存エラー:', e);
      }
      try {
        await sendSettingsToCurrentTab(newSettings);
      } catch (e) {
        console.warn('[App] 設定送信エラー:', e);
      }
    });
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

  // 低遅延モード切り替え
  const toggleLowLatency = useCallback(() => {
    updateSettings({ ...settings, lowLatencyMode: !settings.lowLatencyMode, preset: 'custom' });
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
          <ToggleSwitch
            label="低遅延モード"
            sublabel={settings.lowLatencyMode ? '遅延最小化（音質↓）' : '高音質（遅延↑）'}
            enabled={settings.lowLatencyMode}
            onChange={toggleLowLatency}
            color="#ef4444"
          />
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
        <div className="status-item" title={!isConnected ? '設定はストレージ経由で同期されます' : ''}>
          <div className={`status-dot ${isConnected ? 'connected' : ''}`} />
          <span>{isConnected ? '接続中' : '待機中'}</span>
        </div>
        <div className="status-item">
          <span>遅延: {displayLatency.toFixed(1)} ms</span>
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
