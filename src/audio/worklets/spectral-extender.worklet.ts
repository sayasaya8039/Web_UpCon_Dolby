/**
 * Spectral Extender AudioWorklet Processor
 * 周波数帯域を拡張（SBR: Spectral Band Replication風）
 */

interface SpectralExtenderSettings {
  enabled: boolean;
  maxFrequency: number;
  intensity: number;
}

class SpectralExtenderProcessor extends AudioWorkletProcessor {
  private settings: SpectralExtenderSettings = {
    enabled: true,
    maxFrequency: 24000,
    intensity: 0.5,
  };

  // FFT関連
  private readonly FFT_SIZE = 2048;
  private readonly HOP_SIZE = 512;

  // 入力バッファ
  private inputBuffer: Float32Array[];
  private inputWritePos: number[];

  // 出力バッファ（オーバーラップアド用）
  private outputBuffer: Float32Array[];
  private outputReadPos: number[];

  // FFT作業用バッファ
  private fftReal: Float32Array;
  private fftImag: Float32Array;

  // 窓関数
  private window: Float32Array;

  // 前フレームの位相（位相連続性のため）
  private previousPhase: Float32Array[];

  constructor() {
    super();

    // バッファ初期化
    this.inputBuffer = [
      new Float32Array(this.FFT_SIZE * 2),
      new Float32Array(this.FFT_SIZE * 2),
    ];
    this.inputWritePos = [0, 0];

    this.outputBuffer = [
      new Float32Array(this.FFT_SIZE * 2),
      new Float32Array(this.FFT_SIZE * 2),
    ];
    this.outputReadPos = [0, 0];

    this.fftReal = new Float32Array(this.FFT_SIZE);
    this.fftImag = new Float32Array(this.FFT_SIZE);

    this.previousPhase = [
      new Float32Array(this.FFT_SIZE / 2),
      new Float32Array(this.FFT_SIZE / 2),
    ];

    // Hann窓を生成
    this.window = new Float32Array(this.FFT_SIZE);
    for (let i = 0; i < this.FFT_SIZE; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.FFT_SIZE - 1)));
    }

    // メッセージハンドラー
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
   * 簡易FFT（Cooley-Tukey）
   */
  private fft(real: Float32Array, imag: Float32Array, inverse: boolean = false): void {
    const n = real.length;
    const levels = Math.log2(n);

    // ビットリバーサル
    for (let i = 0; i < n; i++) {
      let j = 0;
      for (let k = 0; k < levels; k++) {
        j = (j << 1) | ((i >> k) & 1);
      }
      if (j > i) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    // バタフライ演算
    for (let size = 2; size <= n; size *= 2) {
      const halfSize = size / 2;
      const angle = (inverse ? 2 : -2) * Math.PI / size;

      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const theta = angle * j;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);

          const idx1 = i + j;
          const idx2 = i + j + halfSize;

          const tReal = real[idx2] * cos - imag[idx2] * sin;
          const tImag = real[idx2] * sin + imag[idx2] * cos;

          real[idx2] = real[idx1] - tReal;
          imag[idx2] = imag[idx1] - tImag;
          real[idx1] = real[idx1] + tReal;
          imag[idx1] = imag[idx1] + tImag;
        }
      }
    }

    // 逆変換時のスケーリング
    if (inverse) {
      for (let i = 0; i < n; i++) {
        real[i] /= n;
        imag[i] /= n;
      }
    }
  }

  /**
   * スペクトラル拡張処理
   */
  private extendSpectrum(channel: number): void {
    const nyquist = sampleRate / 2;
    const sourceCutoff = Math.min(nyquist * 0.8, 16000); // ソース帯域上限
    const targetCutoff = Math.min(this.settings.maxFrequency, nyquist * 0.95);

    if (targetCutoff <= sourceCutoff) return;

    const binCount = this.FFT_SIZE / 2;
    const sourceBin = Math.floor((sourceCutoff / nyquist) * binCount);
    const targetBin = Math.floor((targetCutoff / nyquist) * binCount);

    // 高調波生成による帯域拡張
    for (let i = sourceBin; i < targetBin; i++) {
      // ソース帯域からミラーリング
      const sourceIdx = sourceBin - (i - sourceBin) % (sourceBin / 2);
      if (sourceIdx > 0 && sourceIdx < sourceBin) {
        // 振幅を取得してスケーリング
        const mag = Math.sqrt(
          this.fftReal[sourceIdx] ** 2 + this.fftImag[sourceIdx] ** 2
        );

        // 高周波ほど減衰
        const freqRatio = i / binCount;
        const attenuation = Math.exp(-3 * freqRatio) * this.settings.intensity;

        // 位相はソースから継続（または乱数化）
        const phase = Math.atan2(this.fftImag[sourceIdx], this.fftReal[sourceIdx]);

        // 拡張された成分を追加
        this.fftReal[i] += mag * attenuation * Math.cos(phase);
        this.fftImag[i] += mag * attenuation * Math.sin(phase);
      }
    }
  }

  /**
   * 1フレーム分の処理
   */
  private processFrame(channel: number): void {
    const inputBuf = this.inputBuffer[channel];
    const outputBuf = this.outputBuffer[channel];

    // 入力を窓関数で乗算
    for (let i = 0; i < this.FFT_SIZE; i++) {
      this.fftReal[i] = inputBuf[i] * this.window[i];
      this.fftImag[i] = 0;
    }

    // FFT
    this.fft(this.fftReal, this.fftImag, false);

    // スペクトラル拡張
    if (this.settings.enabled && this.settings.intensity > 0) {
      this.extendSpectrum(channel);
    }

    // IFFT
    this.fft(this.fftReal, this.fftImag, true);

    // オーバーラップアド
    for (let i = 0; i < this.FFT_SIZE; i++) {
      const outIdx = (this.outputReadPos[channel] + i) % outputBuf.length;
      outputBuf[outIdx] += this.fftReal[i] * this.window[i];
    }
  }

  /**
   * オーディオ処理
   */
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input.length || !output || !output.length) {
      return true;
    }

    // 処理無効時はバイパス
    if (!this.settings.enabled) {
      for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
        output[channel].set(input[channel]);
      }
      return true;
    }

    const frameSize = input[0].length;

    for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      const inputBuf = this.inputBuffer[channel];
      const outputBuf = this.outputBuffer[channel];

      // 入力をバッファに追加
      for (let i = 0; i < frameSize; i++) {
        inputBuf[this.inputWritePos[channel]] = inputChannel[i];
        this.inputWritePos[channel] = (this.inputWritePos[channel] + 1) % inputBuf.length;
      }

      // フレーム処理（簡略化：毎フレーム処理）
      if (this.inputWritePos[channel] % this.HOP_SIZE === 0) {
        this.processFrame(channel);
      }

      // 出力バッファから読み出し
      for (let i = 0; i < frameSize; i++) {
        outputChannel[i] = outputBuf[this.outputReadPos[channel]];
        outputBuf[this.outputReadPos[channel]] = 0; // クリア
        this.outputReadPos[channel] = (this.outputReadPos[channel] + 1) % outputBuf.length;
      }
    }

    return true;
  }
}

registerProcessor('spectral-extender-processor', SpectralExtenderProcessor);
