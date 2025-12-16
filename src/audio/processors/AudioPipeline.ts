/**
 * AudioPipeline
 * MediaElementからの音声をキャプチャし、各種処理を適用するメインパイプライン
 */

import type { AudioSettings, AudioStatus } from '@/types/audio.types';

export class AudioPipeline {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;

  // AudioWorkletノード
  private upsamplerNode: AudioWorkletNode | null = null;
  private spectralExtenderNode: AudioWorkletNode | null = null;
  private spatialNode: AudioWorkletNode | null = null;

  // 分析用
  private analyserNode: AnalyserNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;

  private isConnected = false;
  private currentElement: HTMLMediaElement | null = null;
  private settings: AudioSettings | null = null;

  /**
   * MediaElementに接続
   */
  async connect(element: HTMLMediaElement): Promise<void> {
    // 同じ要素に既に接続済みならスキップ
    if (this.currentElement === element && this.isConnected) {
      return;
    }

    // 既存の接続をクリーンアップ
    await this.disconnect();

    try {
      // AudioContext作成
      this.audioContext = new AudioContext({
        sampleRate: 48000, // 初期サンプルレート
        latencyHint: 'interactive',
      });

      // AudioWorkletを登録
      await this.loadWorklets();

      // ソースノード作成
      this.sourceNode = this.audioContext.createMediaElementSource(element);

      // ゲインノード（マスターボリューム）
      this.gainNode = this.audioContext.createGain();

      // 分析ノード
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);

      // 処理チェーンを構築
      await this.buildProcessingChain();

      this.currentElement = element;
      this.isConnected = true;

      console.log('[AudioPipeline] 接続完了');
    } catch (error) {
      console.error('[AudioPipeline] 接続エラー:', error);
      await this.disconnect();
      throw error;
    }
  }

  /**
   * AudioWorkletを読み込み
   */
  private async loadWorklets(): Promise<void> {
    if (!this.audioContext) return;

    const workletPaths = [
      '/src/audio/worklets/upsampler.worklet.js',
      '/src/audio/worklets/spectral-extender.worklet.js',
      '/src/audio/worklets/spatial-processor.worklet.js',
    ];

    for (const path of workletPaths) {
      try {
        const url = chrome.runtime.getURL(path);
        await this.audioContext.audioWorklet.addModule(url);
      } catch (error) {
        console.warn(`[AudioPipeline] Worklet読み込みスキップ: ${path}`, error);
      }
    }
  }

  /**
   * 処理チェーンを構築
   */
  private async buildProcessingChain(): Promise<void> {
    if (!this.audioContext || !this.sourceNode || !this.gainNode || !this.analyserNode) {
      return;
    }

    let currentNode: AudioNode = this.sourceNode;

    // アップサンプラーノード
    try {
      this.upsamplerNode = new AudioWorkletNode(this.audioContext, 'upsampler-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      currentNode.connect(this.upsamplerNode);
      currentNode = this.upsamplerNode;
    } catch {
      console.log('[AudioPipeline] アップサンプラーをスキップ（フォールバック）');
    }

    // スペクトラル拡張ノード
    try {
      this.spectralExtenderNode = new AudioWorkletNode(this.audioContext, 'spectral-extender-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      currentNode.connect(this.spectralExtenderNode);
      currentNode = this.spectralExtenderNode;
    } catch {
      console.log('[AudioPipeline] スペクトラル拡張をスキップ（フォールバック）');
    }

    // 空間オーディオノード
    try {
      this.spatialNode = new AudioWorkletNode(this.audioContext, 'spatial-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      currentNode.connect(this.spatialNode);
      currentNode = this.spatialNode;
    } catch {
      console.log('[AudioPipeline] 空間処理をスキップ（フォールバック）');
    }

    // 最終段：ゲインノード → 分析ノード → 出力
    currentNode.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);
  }

  /**
   * 設定を更新
   */
  updateSettings(settings: AudioSettings): void {
    this.settings = settings;

    // マスターボリューム
    if (this.gainNode) {
      const volume = settings.enabled ? settings.masterVolume / 100 : 0;
      this.gainNode.gain.setTargetAtTime(volume, this.audioContext?.currentTime ?? 0, 0.01);
    }

    // 各Workletに設定を送信
    if (this.upsamplerNode) {
      this.upsamplerNode.port.postMessage({
        type: 'updateSettings',
        enabled: settings.enabled && settings.upsampling.enabled,
        targetSampleRate: settings.upsampling.targetSampleRate,
        quality: settings.upsampling.quality,
      });
    }

    if (this.spectralExtenderNode) {
      this.spectralExtenderNode.port.postMessage({
        type: 'updateSettings',
        enabled: settings.enabled && settings.frequencyExtension.enabled,
        maxFrequency: settings.frequencyExtension.maxFrequency,
        intensity: settings.frequencyExtension.intensity / 100,
      });
    }

    if (this.spatialNode) {
      this.spatialNode.port.postMessage({
        type: 'updateSettings',
        enabled: settings.enabled && settings.spatialAudio.enabled,
        mode: settings.spatialAudio.mode,
        width: settings.spatialAudio.width / 100,
        depth: settings.spatialAudio.depth / 100,
        height: settings.spatialAudio.height / 100,
      });
    }
  }

  /**
   * ステータスを取得
   */
  getStatus(): AudioStatus {
    const latency = this.audioContext
      ? (this.audioContext.baseLatency + this.audioContext.outputLatency) * 1000
      : 0;

    return {
      connected: this.isConnected,
      inputSampleRate: this.audioContext?.sampleRate ?? 0,
      outputSampleRate: this.settings?.upsampling.targetSampleRate ?? 48000,
      latency,
      cpuUsage: 0, // Web APIでは直接取得不可
    };
  }

  /**
   * 周波数データを取得
   */
  getFrequencyData(): Uint8Array | null {
    if (this.analyserNode && this.frequencyData) {
      this.analyserNode.getByteFrequencyData(this.frequencyData);
      return this.frequencyData;
    }
    return null;
  }

  /**
   * 切断
   */
  async disconnect(): Promise<void> {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
    }

    if (this.upsamplerNode) {
      try {
        this.upsamplerNode.disconnect();
      } catch {}
    }

    if (this.spectralExtenderNode) {
      try {
        this.spectralExtenderNode.disconnect();
      } catch {}
    }

    if (this.spatialNode) {
      try {
        this.spatialNode.disconnect();
      } catch {}
    }

    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {}
    }

    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {}
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }

    this.audioContext = null;
    this.sourceNode = null;
    this.upsamplerNode = null;
    this.spectralExtenderNode = null;
    this.spatialNode = null;
    this.gainNode = null;
    this.analyserNode = null;
    this.frequencyData = null;
    this.currentElement = null;
    this.isConnected = false;

    console.log('[AudioPipeline] 切断完了');
  }
}
