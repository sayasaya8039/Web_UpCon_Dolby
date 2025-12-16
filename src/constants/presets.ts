import type { AudioSettings, PresetType } from '@/types/audio.types';

/** デフォルト設定（安全のため初期状態は全てオフ） */
export const DEFAULT_SETTINGS: AudioSettings = {
  enabled: true,
  hiResEnabled: false,
  spatialEnabled: false,
  useGPU: false,
  lowLatencyMode: false,
  preset: 'custom',
  masterVolume: 100,
  upsampling: {
    enabled: false,
    targetSampleRate: 48000,
    quality: 'linear',
  },
  frequencyExtension: {
    enabled: false,
    maxFrequency: 24000,
    intensity: 30,
  },
  spatialAudio: {
    enabled: false,
    mode: 'off',
    width: 50,
    depth: 30,
    height: 20,
  },
};

/** プリセット定義 */
export const PRESETS: Record<PresetType, Partial<AudioSettings>> = {
  music: {
    preset: 'music',
    hiResEnabled: true,
    spatialEnabled: true,
    lowLatencyMode: false,
    upsampling: {
      enabled: true,
      targetSampleRate: 96000,
      quality: 'sinc',
    },
    frequencyExtension: {
      enabled: true,
      maxFrequency: 32000,
      intensity: 50,
    },
    spatialAudio: {
      enabled: true,
      mode: 'stereo-wide',
      width: 60,
      depth: 40,
      height: 30,
    },
  },
  movie: {
    preset: 'movie',
    hiResEnabled: true,
    spatialEnabled: true,
    lowLatencyMode: false,
    upsampling: {
      enabled: true,
      targetSampleRate: 48000,
      quality: 'sinc',
    },
    frequencyExtension: {
      enabled: true,
      maxFrequency: 24000,
      intensity: 30,
    },
    spatialAudio: {
      enabled: true,
      mode: 'surround-71',
      width: 80,
      depth: 70,
      height: 50,
    },
  },
  gaming: {
    preset: 'gaming',
    hiResEnabled: false,
    spatialEnabled: true,
    lowLatencyMode: true,
    upsampling: {
      enabled: true,
      targetSampleRate: 48000,
      quality: 'linear',
    },
    frequencyExtension: {
      enabled: false,
      maxFrequency: 20000,
      intensity: 0,
    },
    spatialAudio: {
      enabled: true,
      mode: 'atmos',
      width: 100,
      depth: 100,
      height: 80,
    },
  },
  custom: {
    preset: 'custom',
  },
};

/** サンプルレートオプション */
export const SAMPLE_RATE_OPTIONS = [
  { value: 48000, label: '48 kHz' },
  { value: 96000, label: '96 kHz (Hi-Res)' },
  { value: 192000, label: '192 kHz (Hi-Res)' },
] as const;

/** 空間オーディオモードオプション */
export const SPATIAL_MODE_OPTIONS = [
  { value: 'off', label: 'OFF' },
  { value: 'stereo-wide', label: 'ステレオワイド' },
  { value: 'surround-71', label: '7.1ch サラウンド' },
  { value: 'atmos', label: 'Dolby Atmos風' },
] as const;

/** 周波数拡張上限オプション（96kHzサンプルレート対応） */
export const FREQUENCY_OPTIONS = [
  { value: 20000, label: '20 kHz' },
  { value: 24000, label: '24 kHz' },
  { value: 32000, label: '32 kHz' },
  { value: 40000, label: '40 kHz' },
  { value: 48000, label: '48 kHz (96kHz必須)' },
] as const;
