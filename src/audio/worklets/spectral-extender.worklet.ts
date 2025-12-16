/**
 * Spectral Extender AudioWorklet Processor
 * FFTベースの高域補間（upconvfe/SBR風処理）
 *
 * 低ビットレート音源で失われた高周波成分を、スペクトラルバンドレプリケーション
 * によって補完・復元します。
 */

interface SpectralExtenderSettings {
  enabled: boolean;
  maxFrequency: number;
  intensity: number;
}

class SpectralExtenderProcessor extends AudioWorkletProcessor {
  private settings: SpectralExtenderSettings = {
    enabled: false,
    maxFrequency: 24000,
    intensity: 50,
  };

  // FFT設定（小さめのサイズで安定性を優先）
  private readonly FFT_SIZE = 1024;
  private readonly HOP_SIZE = 256;  // 75%オーバーラップ

  // 各チャンネルのバッファ
  private inputRing: Float32Array[] = [];
  private outputRing: Float32Array[] = [];
  private inputPos: number = 0;
  private outputPos: number = 0;
  private hopCounter: number = 0;

  // FFTバッファ
  private fftReal: Float32Array;
  private fftImag: Float32Array;
  private window: Float32Array;
  private windowSum: number = 0;

  // 位相オフセット
  private phaseOffset: Float32Array;

  // 初期レイテンシ用
  private initialized: boolean = false;
  private initCounter: number = 0;

  constructor() {
    super();

    // 2チャンネル分のバッファ
    for (let ch = 0; ch < 2; ch++) {
      this.inputRing.push(new Float32Array(this.FFT_SIZE * 2));
      this.outputRing.push(new Float32Array(this.FFT_SIZE * 2));
    }

    this.fftReal = new Float32Array(this.FFT_SIZE);
    this.fftImag = new Float32Array(this.FFT_SIZE);

    // Hann窓
    this.window = new Float32Array(this.FFT_SIZE);
    for (let i = 0; i < this.FFT_SIZE; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / this.FFT_SIZE));
      this.windowSum += this.window[i] * this.window[i];
    }
    // 正規化係数
    this.windowSum = this.windowSum * this.FFT_SIZE / this.HOP_SIZE;

    // 位相オフセット（固定パターン）
    this.phaseOffset = new Float32Array(this.FFT_SIZE / 2);
    for (let i = 0; i < this.phaseOffset.length; i++) {
      // 擬似ランダムだが再現可能
      this.phaseOffset[i] = ((i * 137) % 100) / 100 * 2 * Math.PI;
    }

    this.port.onmessage = (event) => {
      if (event.data.type === 'updateSettings') {
        this.settings = {
          enabled: event.data.enabled ?? this.settings.enabled,
          maxFrequency: event.data.maxFrequency ?? this.settings.maxFrequency,
          intensity: event.data.intensity ?? this.settings.intensity,
        };
      }
    };
  }

  /**
   * インプレースFFT
   */
  private fft(real: Float32Array, imag: Float32Array, inverse: boolean): void {
    const n = real.length;
    const levels = Math.round(Math.log2(n));

    // ビットリバーサル
    for (let i = 0; i < n; i++) {
      let j = 0;
      for (let k = 0; k < levels; k++) {
        j = (j << 1) | ((i >> k) & 1);
      }
      if (j > i) {
        let tmp = real[i]; real[i] = real[j]; real[j] = tmp;
        tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
      }
    }

    // バタフライ演算
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = (inverse ? 2 : -2) * Math.PI / size;

      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const angle = step * j;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);

          const evenIdx = i + j;
          const oddIdx = i + j + half;

          const tr = real[oddIdx] * cos - imag[oddIdx] * sin;
          const ti = real[oddIdx] * sin + imag[oddIdx] * cos;

          real[oddIdx] = real[evenIdx] - tr;
          imag[oddIdx] = imag[evenIdx] - ti;
          real[evenIdx] = real[evenIdx] + tr;
          imag[evenIdx] = imag[evenIdx] + ti;
        }
      }
    }

    if (inverse) {
      for (let i = 0; i < n; i++) {
        real[i] /= n;
        imag[i] /= n;
      }
    }
  }

  /**
   * SBR処理
   */
  private applySBR(): void {
    const nyquist = sampleRate / 2;
    const binCount = this.FFT_SIZE / 2;
    const hzPerBin = nyquist / binCount;

    // カットオフ推定（MP3/AACは通常16kHz付近でカット）
    const cutoffHz = 15000;
    const cutoffBin = Math.min(Math.floor(cutoffHz / hzPerBin), binCount - 1);

    // 目標周波数
    const targetHz = Math.min(this.settings.maxFrequency, nyquist * 0.9);
    const targetBin = Math.min(Math.floor(targetHz / hzPerBin), binCount - 1);

    if (targetBin <= cutoffBin) return;

    const intensity = this.settings.intensity / 100;

    // ソース帯域（8kHz〜15kHz付近）
    const srcStartBin = Math.floor(8000 / hzPerBin);
    const srcEndBin = cutoffBin;
    const srcWidth = srcEndBin - srcStartBin;

    if (srcWidth <= 0) return;

    // 高域を補完
    for (let destBin = cutoffBin + 1; destBin <= targetBin; destBin++) {
      // ソース帯域からマッピング
      const srcBin = srcStartBin + ((destBin - cutoffBin - 1) % srcWidth);

      // 振幅と位相を取得
      const re = this.fftReal[srcBin];
      const im = this.fftImag[srcBin];
      const mag = Math.sqrt(re * re + im * im);
      const phase = Math.atan2(im, re);

      // 減衰（高周波ほど弱く）
      const ratio = (destBin - cutoffBin) / (targetBin - cutoffBin);
      const atten = (1 - ratio * 0.7) * intensity;

      // 位相シフト
      const newPhase = phase + this.phaseOffset[destBin % this.phaseOffset.length];
      const newMag = mag * atten;

      // 正の周波数
      this.fftReal[destBin] = newMag * Math.cos(newPhase);
      this.fftImag[destBin] = newMag * Math.sin(newPhase);

      // 負の周波数（対称）
      const mirrorBin = this.FFT_SIZE - destBin;
      if (mirrorBin > 0 && mirrorBin < this.FFT_SIZE) {
        this.fftReal[mirrorBin] = newMag * Math.cos(-newPhase);
        this.fftImag[mirrorBin] = newMag * Math.sin(-newPhase);
      }
    }
  }

  /**
   * 1フレーム処理
   */
  private processFrame(channel: number): void {
    const inRing = this.inputRing[channel];
    const outRing = this.outputRing[channel];

    // 窓関数適用してFFTバッファにコピー
    for (let i = 0; i < this.FFT_SIZE; i++) {
      const idx = (this.inputPos - this.FFT_SIZE + i + inRing.length) % inRing.length;
      this.fftReal[i] = inRing[idx] * this.window[i];
      this.fftImag[i] = 0;
    }

    // FFT
    this.fft(this.fftReal, this.fftImag, false);

    // SBR
    this.applySBR();

    // IFFT
    this.fft(this.fftReal, this.fftImag, true);

    // オーバーラップアド
    const scale = this.HOP_SIZE / this.windowSum * 2;
    for (let i = 0; i < this.FFT_SIZE; i++) {
      const idx = (this.outputPos + i) % outRing.length;
      outRing[idx] += this.fftReal[i] * this.window[i] * scale;
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _params: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];

    if (!input?.length || !output?.length) return true;

    const numCh = Math.min(input.length, output.length, 2);
    const frameSize = input[0].length;

    // バイパス
    if (!this.settings.enabled || this.settings.intensity <= 0) {
      for (let ch = 0; ch < numCh; ch++) {
        output[ch].set(input[ch]);
      }
      return true;
    }

    // 初期化期間（バッファを埋める）
    if (!this.initialized) {
      for (let ch = 0; ch < numCh; ch++) {
        output[ch].set(input[ch]);
        for (let i = 0; i < frameSize; i++) {
          this.inputRing[ch][this.inputPos + i] = input[ch][i];
        }
      }
      this.inputPos = (this.inputPos + frameSize) % this.inputRing[0].length;
      this.initCounter += frameSize;
      if (this.initCounter >= this.FFT_SIZE) {
        this.initialized = true;
        this.outputPos = this.inputPos;
      }
      return true;
    }

    // メイン処理
    for (let i = 0; i < frameSize; i++) {
      // 入力をリングバッファに書き込み
      for (let ch = 0; ch < numCh; ch++) {
        this.inputRing[ch][this.inputPos] = input[ch][i];
      }
      this.inputPos = (this.inputPos + 1) % this.inputRing[0].length;

      this.hopCounter++;

      // HOP_SIZEごとにFFT処理
      if (this.hopCounter >= this.HOP_SIZE) {
        for (let ch = 0; ch < numCh; ch++) {
          this.processFrame(ch);
        }
        this.hopCounter = 0;
      }

      // 出力をリングバッファから読み取り
      for (let ch = 0; ch < numCh; ch++) {
        output[ch][i] = this.outputRing[ch][this.outputPos];
        this.outputRing[ch][this.outputPos] = 0; // クリア
      }
      this.outputPos = (this.outputPos + 1) % this.outputRing[0].length;
    }

    return true;
  }
}

registerProcessor('spectral-extender-processor', SpectralExtenderProcessor);
