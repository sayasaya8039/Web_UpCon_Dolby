/**
 * Spatial Audio Processor AudioWorklet
 * シンプルなステレオ拡張と空間オーディオ処理
 */

type SpatialMode = 'off' | 'stereo-wide' | 'surround-71' | 'atmos';

interface SpatialSettings {
  enabled: boolean;
  mode: SpatialMode;
  width: number;
  depth: number;
  height: number;
  lowLatencyMode: boolean;
}

class SpatialProcessor extends AudioWorkletProcessor {
  private settings: SpatialSettings = {
    enabled: false,
    mode: 'stereo-wide',
    width: 0.6,
    depth: 0.4,
    height: 0.3,
    lowLatencyMode: false,
  };

  // 遅延バッファ（反響用）
  private readonly MAX_DELAY = 2048;
  private delayBufferL: Float32Array;
  private delayBufferR: Float32Array;
  private delayWritePos: number = 0;

  constructor() {
    super();

    this.delayBufferL = new Float32Array(this.MAX_DELAY);
    this.delayBufferR = new Float32Array(this.MAX_DELAY);

    // メッセージハンドラー
    this.port.onmessage = (event) => {
      if (event.data.type === 'updateSettings') {
        this.settings = {
          enabled: event.data.enabled ?? this.settings.enabled,
          mode: event.data.mode ?? this.settings.mode,
          width: event.data.width ?? this.settings.width,
          depth: event.data.depth ?? this.settings.depth,
          height: event.data.height ?? this.settings.height,
          lowLatencyMode: event.data.lowLatencyMode ?? this.settings.lowLatencyMode,
        };
      }
    };
  }

  /**
   * ステレオワイド処理（M/S処理）
   */
  private processStereoWide(
    left: Float32Array,
    right: Float32Array,
    outputLeft: Float32Array,
    outputRight: Float32Array
  ): void {
    const width = this.settings.width;

    for (let i = 0; i < left.length; i++) {
      // M/S変換
      const mid = (left[i] + right[i]) * 0.5;
      const side = (left[i] - right[i]) * 0.5;

      // サイド成分を強調（widthで調整）
      const enhancedSide = side * (1 + width);

      // M/S逆変換
      outputLeft[i] = Math.max(-1, Math.min(1, mid + enhancedSide));
      outputRight[i] = Math.max(-1, Math.min(1, mid - enhancedSide));
    }
  }

  /**
   * サラウンド風処理（遅延を使った擬似サラウンド）
   */
  private processSurround(
    left: Float32Array,
    right: Float32Array,
    outputLeft: Float32Array,
    outputRight: Float32Array
  ): void {
    const width = this.settings.width;
    const depth = this.settings.depth;
    const delayTime = Math.floor(depth * (this.settings.lowLatencyMode ? 30 : 100));

    for (let i = 0; i < left.length; i++) {
      // M/S処理でステレオ幅を調整
      const mid = (left[i] + right[i]) * 0.5;
      const side = (left[i] - right[i]) * 0.5;
      const enhancedSide = side * (1 + width * 0.5);

      // 遅延バッファから読み取り（擬似リア成分）
      const delayReadPos = (this.delayWritePos - delayTime + this.MAX_DELAY) % this.MAX_DELAY;
      const delayedL = this.delayBufferL[delayReadPos];
      const delayedR = this.delayBufferR[delayReadPos];

      // 遅延バッファに書き込み
      this.delayBufferL[this.delayWritePos] = left[i];
      this.delayBufferR[this.delayWritePos] = right[i];
      this.delayWritePos = (this.delayWritePos + 1) % this.MAX_DELAY;

      // 出力（直接音 + 遅延音）
      const directL = mid + enhancedSide;
      const directR = mid - enhancedSide;
      const reverbAmount = depth * 0.15;

      outputLeft[i] = Math.max(-1, Math.min(1, directL + delayedR * reverbAmount));
      outputRight[i] = Math.max(-1, Math.min(1, directR + delayedL * reverbAmount));
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

    // モノラル入力の場合
    if (input.length === 1) {
      output[0].set(input[0]);
      if (output.length > 1) output[1].set(input[0]);
      return true;
    }

    // 処理無効時またはOFF時はバイパス
    if (!this.settings.enabled || this.settings.mode === 'off') {
      output[0].set(input[0]);
      output[1].set(input[1]);
      return true;
    }

    // モード別処理
    switch (this.settings.mode) {
      case 'stereo-wide':
        this.processStereoWide(input[0], input[1], output[0], output[1]);
        break;

      case 'surround-71':
      case 'atmos':
        this.processSurround(input[0], input[1], output[0], output[1]);
        break;

      default:
        output[0].set(input[0]);
        output[1].set(input[1]);
    }

    return true;
  }
}

registerProcessor('spatial-processor', SpatialProcessor);
