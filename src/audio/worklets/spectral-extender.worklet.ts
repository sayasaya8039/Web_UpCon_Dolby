/**
 * Spectral Extender AudioWorklet Processor
 * 周波数帯域を拡張（シンプル版）
 *
 * 注意: 複雑なFFT処理は音声の同期問題を引き起こすため、
 * シンプルな高調波生成による帯域拡張を実装しています。
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
    intensity: 0.5,
  };

  // シンプルな高域強調用のフィルタ状態
  private prevSample: number[] = [0, 0];

  constructor() {
    super();

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
    if (!this.settings.enabled || this.settings.intensity <= 0) {
      for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
        output[channel].set(input[channel]);
      }
      return true;
    }

    // シンプルな高域強調
    // 高周波成分（サンプル間の差分）を加算することで擬似的に高域を強調
    const intensity = this.settings.intensity * 0.3; // 控えめに適用

    for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        const sample = inputChannel[i];
        // 差分（高周波成分の近似）
        const highFreq = sample - this.prevSample[channel];
        // 元の信号に高周波成分を少量加算
        outputChannel[i] = sample + highFreq * intensity;
        // クリッピング防止
        outputChannel[i] = Math.max(-1, Math.min(1, outputChannel[i]));
        this.prevSample[channel] = sample;
      }
    }

    return true;
  }
}

registerProcessor('spectral-extender-processor', SpectralExtenderProcessor);
