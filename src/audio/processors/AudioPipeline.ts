/**
 * AudioPipeline
 * MediaElementからの音声をキャプチャし、各種処理を適用するメインパイプライン
 */

import type { AudioSettings, AudioStatus } from '@/types/audio.types';

// MediaElementが既にAudioSourceに接続されているかを追跡（グローバル）
// 同じMediaElementを複数回createMediaElementSourceに接続するとDOMExceptionが発生するため
const connectedElements = new WeakMap<HTMLMediaElement, { context: AudioContext; source: MediaElementAudioSourceNode }>();

export class AudioPipeline {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private makeupGainNode: GainNode | null = null;  // 処理による音量低下を補正

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

  // GPU/WebGPU
  private gpuDevice: GPUDevice | null = null;
  private gpuActive = false;

  // Workletが正常に読み込まれたか
  private workletsLoaded = false;

  /**
   * WebGPU初期化
   */
  private async initWebGPU(): Promise<boolean> {
    if (!('gpu' in navigator)) {
      console.log('[AudioPipeline] WebGPUは利用不可');
      return false;
    }

    try {
      const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter();
      if (!adapter) {
        console.log('[AudioPipeline] GPUアダプタが見つかりません');
        return false;
      }

      this.gpuDevice = await adapter.requestDevice();
      this.gpuActive = true;
      console.log('[AudioPipeline] WebGPU初期化完了');
      return true;
    } catch (error) {
      console.warn('[AudioPipeline] WebGPU初期化エラー:', error);
      return false;
    }
  }

  /**
   * 拡張機能コンテキストが有効かチェック
   */
  private isExtensionContextValid(): boolean {
    try {
      return typeof chrome !== 'undefined' &&
             chrome.runtime !== undefined &&
             typeof chrome.runtime.getURL === 'function';
    } catch {
      return false;
    }
  }

  /**
   * MediaElementに接続
   */
  async connect(element: HTMLMediaElement): Promise<void> {
    // 同じ要素に既に接続済みならスキップ
    if (this.currentElement === element && this.isConnected) {
      return;
    }

    // 拡張機能コンテキストが無効な場合はエラー
    if (!this.isExtensionContextValid()) {
      const error = new Error('拡張機能コンテキストが無効です。ページを再読み込みしてください。');
      console.error('[AudioPipeline]', error.message);
      throw error;
    }

    // 既存の接続をクリーンアップ
    await this.disconnect();

    try {
      // AudioContext作成
      // 注意: ブラウザによってはリクエストしたサンプルレートが無視される場合があります
      const targetSampleRate = this.settings?.upsampling?.targetSampleRate ?? 48000;
      this.audioContext = new AudioContext({
        sampleRate: targetSampleRate,
        latencyHint: 'interactive',
      });
      console.log(`[AudioPipeline] AudioContext作成: ${this.audioContext.sampleRate}Hz`);

      // AudioWorkletを登録
      await this.loadWorklets();

      // ソースノード作成（既存の接続を処理）
      const existing = connectedElements.get(element);
      if (existing && existing.context.state !== 'closed') {
        console.log('[AudioPipeline] 既存の接続を検出、再利用します');
        await existing.context.close();
        connectedElements.delete(element);
      }

      this.sourceNode = this.audioContext.createMediaElementSource(element);
      connectedElements.set(element, { context: this.audioContext, source: this.sourceNode });

      // ゲインノード（マスターボリューム）
      this.gainNode = this.audioContext.createGain();

      // メイクアップゲインノード（処理による音量低下を補正）
      this.makeupGainNode = this.audioContext.createGain();

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
      // DOMExceptionの詳細を出力
      if (error instanceof DOMException) {
        console.error(`[AudioPipeline] 接続エラー (${error.name}): ${error.message}`);
      } else {
        console.error('[AudioPipeline] 接続エラー:', error);
      }
      await this.disconnect();
      throw error;
    }
  }

  /**
   * AudioWorkletを読み込み
   */
  private async loadWorklets(): Promise<void> {
    if (!this.audioContext) return;

    // 拡張機能コンテキストが無効な場合はスキップ
    if (!this.isExtensionContextValid()) {
      console.warn('[AudioPipeline] 拡張機能コンテキストが無効です。Workletは読み込まれません。');
      this.workletsLoaded = false;
      return;
    }

    const workletPaths = [
      'src/audio/worklets/upsampler.worklet.js',
      'src/audio/worklets/spectral-extender.worklet.js',
      'src/audio/worklets/spatial-processor.worklet.js',
    ];

    let loadedCount = 0;
    for (const path of workletPaths) {
      try {
        const url = chrome.runtime.getURL(path);
        await this.audioContext.audioWorklet.addModule(url);
        loadedCount++;
      } catch (error) {
        console.warn(`[AudioPipeline] Worklet読み込みスキップ: ${path}`, error);
      }
    }

    this.workletsLoaded = loadedCount === workletPaths.length;
    if (this.workletsLoaded) {
      console.log('[AudioPipeline] 全Worklet読み込み完了');
    } else {
      console.warn(`[AudioPipeline] Worklet読み込み: ${loadedCount}/${workletPaths.length} (パススルーモードで動作)`);
    }
  }

  /**
   * 処理チェーンを構築
   */
  private async buildProcessingChain(): Promise<void> {
    if (!this.audioContext || !this.sourceNode || !this.gainNode || !this.makeupGainNode || !this.analyserNode) {
      return;
    }

    let currentNode: AudioNode = this.sourceNode;

    // Workletが読み込まれている場合のみAudioWorkletNodeを作成
    if (this.workletsLoaded) {
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
        console.log('[AudioPipeline] アップサンプラーをスキップ');
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
        console.log('[AudioPipeline] スペクトラル拡張をスキップ');
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
        console.log('[AudioPipeline] 空間処理をスキップ');
      }
    } else {
      console.log('[AudioPipeline] パススルーモード（Worklet未読込）');
    }

    // 最終段：メイクアップゲイン → マスターゲイン → 分析ノード → 出力
    currentNode.connect(this.makeupGainNode);
    this.makeupGainNode.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);
  }

  /**
   * 設定を更新
   */
  updateSettings(settings: AudioSettings): void {
    this.settings = settings;

    // GPU設定が有効になった場合
    if (settings.useGPU && !this.gpuDevice) {
      this.initWebGPU();
    } else if (!settings.useGPU && this.gpuDevice) {
      this.gpuDevice.destroy();
      this.gpuDevice = null;
      this.gpuActive = false;
    }

    // マスターボリューム
    if (this.gainNode) {
      const volume = settings.enabled ? settings.masterVolume / 100 : 0;
      this.gainNode.gain.setTargetAtTime(volume, this.audioContext?.currentTime ?? 0, 0.01);
    }

    // ハイレゾ設定（アップサンプリング + 周波数拡張）
    const hiResActive = settings.enabled && settings.hiResEnabled;

    // メイクアップゲイン（処理による音量低下を補正）
    if (this.makeupGainNode && this.audioContext) {
      let makeupGain = 1.0;

      // スペクトラル拡張時の補正（FFT窓関数による音量低下を補正）
      if (hiResActive && settings.frequencyExtension.enabled) {
        // 強度に応じて補正量を調整（強度が高いほど補正も大きく）
        const intensityFactor = settings.frequencyExtension.intensity / 100;
        makeupGain += 0.45 * intensityFactor;  // 最大+45%（約3.2dB）
      }

      // 空間オーディオ時の補正
      if (settings.enabled && settings.spatialEnabled && settings.spatialAudio.enabled) {
        // 早期反射やクロスフィードによる若干の音量変化を補正
        if (settings.spatialAudio.mode === 'surround-71' || settings.spatialAudio.mode === 'atmos') {
          makeupGain += 0.15;  // +15%（約1.2dB）
        } else if (settings.spatialAudio.mode === 'stereo-wide') {
          makeupGain += 0.08;  // +8%（約0.7dB）
        }
      }

      this.makeupGainNode.gain.setTargetAtTime(makeupGain, this.audioContext.currentTime, 0.05);
    }

    // アップサンプラー設定
    if (this.upsamplerNode) {
      this.upsamplerNode.port.postMessage({
        type: 'updateSettings',
        enabled: hiResActive && settings.upsampling.enabled,
        targetSampleRate: settings.upsampling.targetSampleRate,
        quality: settings.upsampling.quality,
        lowLatencyMode: settings.lowLatencyMode,
        useGPU: settings.useGPU && this.gpuActive,
      });
    }

    // スペクトラル拡張設定
    if (this.spectralExtenderNode) {
      this.spectralExtenderNode.port.postMessage({
        type: 'updateSettings',
        enabled: hiResActive && settings.frequencyExtension.enabled,
        maxFrequency: settings.frequencyExtension.maxFrequency,
        intensity: settings.frequencyExtension.intensity / 100,
        lowLatencyMode: settings.lowLatencyMode,
        useGPU: settings.useGPU && this.gpuActive,
      });
    }

    // 空間オーディオ設定
    const spatialActive = settings.enabled && settings.spatialEnabled;

    if (this.spatialNode) {
      this.spatialNode.port.postMessage({
        type: 'updateSettings',
        enabled: spatialActive && settings.spatialAudio.enabled,
        mode: settings.spatialAudio.mode,
        width: settings.spatialAudio.width,
        depth: settings.spatialAudio.depth,
        height: settings.spatialAudio.height,
        hrtfIntensity: settings.spatialAudio.hrtfIntensity,
        lowLatencyMode: settings.lowLatencyMode,
        useGPU: settings.useGPU && this.gpuActive,
      });
    }
  }

  /**
   * 処理遅延を計算（ミリ秒）
   * 設定に基づいて期待される遅延を計算（ノードの存在に依存しない）
   */
  private calculateProcessingLatency(): number {
    if (!this.audioContext || !this.settings) return 0;

    const sampleRate = this.audioContext.sampleRate;
    let totalSamples = 0;

    // 1. AudioWorkletのバッファサイズ（128サンプル × 処理ノード数）
    const workletBufferSize = 128;
    let activeNodes = 1; // 最低1つ（gainNode）

    // 2. アップサンプラーの遅延（設定が有効な場合）
    if (this.settings.hiResEnabled && this.settings.upsampling.enabled) {
      activeNodes++;
      // Sinc補間のウィンドウサイズ（低遅延モードで短縮）
      const sincWindow = this.settings.lowLatencyMode ? 4 : 16;
      totalSamples += sincWindow / 2;
    }

    // 3. スペクトラル拡張の遅延（設定が有効な場合）
    if (this.settings.hiResEnabled && this.settings.frequencyExtension.enabled) {
      activeNodes++;
      // FFTバッファサイズ（低遅延モードで短縮）
      totalSamples += this.settings.lowLatencyMode ? 256 : 512;
    }

    // 4. 空間オーディオの遅延（設定が有効な場合）
    if (this.settings.spatialEnabled && this.settings.spatialAudio.enabled) {
      activeNodes++;
      // 遅延ラインのサイズ（低遅延モードで短縮）
      const maxDelay = this.settings.lowLatencyMode ? 50 : 200;
      const depthDelay = maxDelay * (this.settings.spatialAudio.depth / 100);
      totalSamples += depthDelay;

      // Atmos時は高さ成分の遅延も追加
      if (this.settings.spatialAudio.mode === 'atmos') {
        const heightDelay = (this.settings.lowLatencyMode ? 25 : 100) * (this.settings.spatialAudio.height / 100);
        totalSamples += heightDelay;
      }
    }

    // 5. AudioWorkletバッファ遅延
    totalSamples += workletBufferSize * activeNodes;

    // 6. ハードウェア遅延
    const hardwareLatency = (this.audioContext.baseLatency + this.audioContext.outputLatency) * 1000;

    // 合計遅延（サンプル→ミリ秒変換 + ハードウェア遅延）
    const processingLatency = (totalSamples / sampleRate) * 1000;

    return hardwareLatency + processingLatency;
  }

  /**
   * ステータスを取得
   */
  getStatus(): AudioStatus {
    return {
      connected: this.isConnected,
      inputSampleRate: this.audioContext?.sampleRate ?? 0,
      outputSampleRate: this.settings?.upsampling.targetSampleRate ?? 48000,
      latency: this.calculateProcessingLatency(),
      cpuUsage: 0,
      gpuActive: this.gpuActive,
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

    if (this.makeupGainNode) {
      try {
        this.makeupGainNode.disconnect();
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

    // AudioContextを閉じる（connectedElementsから削除）
    if (this.audioContext && this.audioContext.state !== 'closed') {
      if (this.currentElement) {
        connectedElements.delete(this.currentElement);
      }
      await this.audioContext.close();
    }

    if (this.gpuDevice) {
      this.gpuDevice.destroy();
      this.gpuDevice = null;
    }

    this.audioContext = null;
    this.sourceNode = null;
    this.upsamplerNode = null;
    this.spectralExtenderNode = null;
    this.spatialNode = null;
    this.makeupGainNode = null;
    this.gainNode = null;
    this.analyserNode = null;
    this.frequencyData = null;
    this.currentElement = null;
    this.isConnected = false;
    this.gpuActive = false;
    this.workletsLoaded = false;

    console.log('[AudioPipeline] 切断完了');
  }
}
