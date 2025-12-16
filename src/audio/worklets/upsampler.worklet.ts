/**
 * Upsampler AudioWorklet Processor
 * リアルタイムでオーディオをアップサンプリング
 */

interface UpsamplerSettings {
  enabled: boolean;
  targetSampleRate: number;
  quality: 'linear' | 'sinc';
  lowLatencyMode: boolean;
}

class UpsamplerProcessor extends AudioWorkletProcessor {
  private settings: UpsamplerSettings = {
    enabled: true,
    targetSampleRate: 96000,
    quality: 'sinc',
    lowLatencyMode: false,
  };

  // Sinc補間用のフィルタ係数キャッシュ
  private sincTable: Float32Array;
  private sincTableFast: Float32Array;
  private readonly SINC_WINDOW_SIZE = 16;
  private readonly SINC_WINDOW_SIZE_FAST = 4; // 低遅延モード用

  // 前サンプルの保持（補間用）
  private previousSamples: Float32Array[];
  private readonly BUFFER_SIZE = 32;

  constructor() {
    super();

    // Sinc関数テーブルを事前計算
    this.sincTable = this.generateSincTable(this.SINC_WINDOW_SIZE);
    this.sincTableFast = this.generateSincTable(this.SINC_WINDOW_SIZE_FAST);

    // 各チャンネルのバッファを初期化
    this.previousSamples = [
      new Float32Array(this.BUFFER_SIZE),
      new Float32Array(this.BUFFER_SIZE),
    ];

    // メッセージハンドラー
    this.port.onmessage = (event) => {
      if (event.data.type === 'updateSettings') {
        this.settings = {
          enabled: event.data.enabled ?? this.settings.enabled,
          targetSampleRate: event.data.targetSampleRate ?? this.settings.targetSampleRate,
          quality: event.data.quality ?? this.settings.quality,
          lowLatencyMode: event.data.lowLatencyMode ?? this.settings.lowLatencyMode,
        };
      }
    };
  }

  /**
   * Sinc関数テーブルを生成
   */
  private generateSincTable(windowSize: number): Float32Array {
    const size = windowSize * 256; // 高精度補間用
    const table = new Float32Array(size);

    for (let i = 0; i < size; i++) {
      const x = (i / 256) - windowSize / 2;
      if (Math.abs(x) < 0.0001) {
        table[i] = 1;
      } else {
        // Windowed Sinc (Lanczos window)
        const sinc = Math.sin(Math.PI * x) / (Math.PI * x);
        const window = Math.sin(Math.PI * x / (windowSize / 2)) /
                       (Math.PI * x / (windowSize / 2));
        table[i] = sinc * window;
      }
    }

    return table;
  }

  /**
   * 線形補間
   */
  private linearInterpolate(
    samples: Float32Array,
    position: number
  ): number {
    const index = Math.floor(position);
    const fraction = position - index;

    const sample0 = samples[index] ?? 0;
    const sample1 = samples[index + 1] ?? sample0;

    return sample0 + fraction * (sample1 - sample0);
  }

  /**
   * Sinc補間（高品質）
   */
  private sincInterpolate(
    samples: Float32Array,
    position: number,
    bufferOffset: number
  ): number {
    const index = Math.floor(position);
    const fraction = position - index;

    // 低遅延モードでは短いウィンドウを使用
    const windowSize = this.settings.lowLatencyMode ? this.SINC_WINDOW_SIZE_FAST : this.SINC_WINDOW_SIZE;
    const table = this.settings.lowLatencyMode ? this.sincTableFast : this.sincTable;
    const halfWindow = windowSize / 2;

    let result = 0;

    for (let i = -halfWindow; i < halfWindow; i++) {
      const sampleIndex = index + i + bufferOffset;
      if (sampleIndex >= 0 && sampleIndex < samples.length) {
        // Sincテーブルから補間係数を取得
        const tableIndex = Math.round((i - fraction + halfWindow) * 256);
        const coef = table[tableIndex] ?? 0;
        result += samples[sampleIndex] * coef;
      }
    }

    return result;
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

    // アップサンプリング係数（実際のサンプルレート変更はAudioContextレベルで行う）
    // ここでは補間によるオーバーサンプリング処理のみ実行
    const ratio = this.settings.targetSampleRate / sampleRate;

    for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      const prevSamples = this.previousSamples[channel];

      // 処理
      if (ratio <= 1) {
        // ダウンサンプリングまたは同一レートの場合はそのまま
        outputChannel.set(inputChannel);
      } else {
        // 補間処理（低遅延モードでは線形補間を優先）
        const useSinc = this.settings.quality === 'sinc' && !this.settings.lowLatencyMode;

        for (let i = 0; i < outputChannel.length; i++) {
          const srcPosition = i / ratio;

          if (useSinc) {
            outputChannel[i] = this.sincInterpolate(inputChannel, srcPosition, 0);
          } else {
            outputChannel[i] = this.linearInterpolate(inputChannel, srcPosition);
          }
        }
      }

      // 前サンプルを保持
      prevSamples.set(inputChannel.slice(-this.BUFFER_SIZE));
    }

    return true;
  }
}

registerProcessor('upsampler-processor', UpsamplerProcessor);
