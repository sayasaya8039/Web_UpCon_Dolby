/**
 * Upsampler AudioWorklet Processor
 *
 * 注意: Web Audio APIでは、AudioWorklet内で真のアップサンプリングは不可能です。
 * 入出力のサンプル数は常に同じ（128サンプル）であり、サンプルレートの変更は
 * AudioContextレベルで行う必要があります。
 *
 * このプロセッサは将来的な拡張（オーバーサンプリング処理など）のために
 * 残していますが、現在はパススルーとして動作します。
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

  constructor() {
    super();

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
   * オーディオ処理
   *
   * AudioWorkletの制限により、真のアップサンプリングは不可能です。
   * ここではパススルーのみを行います。
   *
   * 実際のサンプルレート変更はAudioContextの設定で行ってください。
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

    // パススルー（入力をそのまま出力にコピー）
    for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
      output[channel].set(input[channel]);
    }

    return true;
  }
}

registerProcessor('upsampler-processor', UpsamplerProcessor);
