// オーディオ処理に関する型定義

/** サンプルレート設定 */
export type SampleRate = 48000 | 96000 | 192000;

/** 空間オーディオモード */
export type SpatialMode = 'off' | 'stereo-wide' | 'surround-71' | 'atmos';

/** プリセットタイプ */
export type PresetType = 'music' | 'movie' | 'gaming' | 'custom';

/** 周波数拡張設定 */
export interface FrequencyExtensionSettings {
  enabled: boolean;
  /** 拡張上限周波数 (Hz) */
  maxFrequency: number;
  /** 拡張強度 0-100 */
  intensity: number;
}

/** アップサンプリング設定 */
export interface UpsamplingSettings {
  enabled: boolean;
  /** 出力サンプルレート */
  targetSampleRate: SampleRate;
  /** 補間品質 ('linear' | 'sinc') */
  quality: 'linear' | 'sinc';
}

/** 空間オーディオ設定 */
export interface SpatialAudioSettings {
  enabled: boolean;
  mode: SpatialMode;
  /** 空間の広がり 0-100 */
  width: number;
  /** 深さ（前後の距離感） 0-100 */
  depth: number;
  /** 高さ（上下の広がり） 0-100 */
  height: number;
}

/** 全体設定 */
export interface AudioSettings {
  /** 処理有効/無効 */
  enabled: boolean;
  /** 現在のプリセット */
  preset: PresetType;
  /** マスターボリューム 0-100 */
  masterVolume: number;
  /** アップサンプリング設定 */
  upsampling: UpsamplingSettings;
  /** 周波数拡張設定 */
  frequencyExtension: FrequencyExtensionSettings;
  /** 空間オーディオ設定 */
  spatialAudio: SpatialAudioSettings;
}

/** メッセージタイプ */
export type MessageType =
  | 'GET_SETTINGS'
  | 'SET_SETTINGS'
  | 'TOGGLE_ENABLED'
  | 'UPDATE_SETTING'
  | 'GET_STATUS'
  | 'AUDIO_STATUS';

/** 拡張機能間メッセージ */
export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

/** オーディオステータス */
export interface AudioStatus {
  /** 接続済みか */
  connected: boolean;
  /** 入力サンプルレート */
  inputSampleRate: number;
  /** 出力サンプルレート */
  outputSampleRate: number;
  /** 現在の遅延 (ms) */
  latency: number;
  /** CPU使用率 (%) */
  cpuUsage: number;
}

/** スペクトラムデータ */
export interface SpectrumData {
  /** 周波数ビン */
  frequencies: Float32Array;
  /** 各ビンの振幅 */
  magnitudes: Float32Array;
  /** タイムスタンプ */
  timestamp: number;
}
