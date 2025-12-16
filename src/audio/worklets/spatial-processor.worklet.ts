/**
 * Spatial Audio Processor AudioWorklet
 * HRTF風バイノーラル処理による空間オーディオ
 *
 * 技術要素:
 * - ITD (Interaural Time Difference): 両耳間時間差
 * - ILD (Interaural Level Difference): 両耳間レベル差
 * - 早期反射: 空間の広がり感
 * - クロスフィード: 自然なステレオ感
 */

type SpatialMode = 'off' | 'stereo-wide' | 'surround-71' | 'atmos';

interface SpatialSettings {
  enabled: boolean;
  mode: SpatialMode;
  width: number;    // ステレオ幅 (0-100)
  depth: number;    // 奥行き感 (0-100)
  height: number;   // 高さ感 (0-100)
  lowLatencyMode: boolean;
}

class SpatialProcessor extends AudioWorkletProcessor {
  private settings: SpatialSettings = {
    enabled: false,
    mode: 'stereo-wide',
    width: 50,
    depth: 30,
    height: 20,
    lowLatencyMode: false,
  };

  // ITD用ディレイバッファ（最大1ms = 48サンプル@48kHz）
  private readonly MAX_ITD_SAMPLES = 48;
  private itdBufferL: Float32Array;
  private itdBufferR: Float32Array;
  private itdWritePos: number = 0;

  // 早期反射用ディレイライン
  private readonly MAX_REFLECTION_DELAY = 2400; // 50ms @48kHz
  private reflectionDelays: Float32Array[];
  private reflectionWritePos: number = 0;

  // ILD用ローパスフィルタ状態（頭部による高周波遮蔽）
  private ildFilterState: { y1: number }[] = [{ y1: 0 }, { y1: 0 }];

  // クロスフィード用フィルタ状態
  private crossfeedFilterState: { y1: number }[] = [{ y1: 0 }, { y1: 0 }];
  private crossfeedDelay: Float32Array[];
  private crossfeedWritePos: number = 0;
  private readonly CROSSFEED_DELAY = 20; // サンプル（約0.4ms）

  // 高さ成分用コムフィルタ（耳介の共鳴シミュレーション）
  private pinnaCombDelay: Float32Array[];
  private pinnaCombWritePos: number = 0;
  private readonly PINNA_DELAY = 18; // 約0.375ms（耳介の共鳴）

  constructor() {
    super();

    // ITDバッファ
    this.itdBufferL = new Float32Array(this.MAX_ITD_SAMPLES);
    this.itdBufferR = new Float32Array(this.MAX_ITD_SAMPLES);

    // 早期反射バッファ（4本のディレイライン）
    this.reflectionDelays = [];
    for (let i = 0; i < 4; i++) {
      this.reflectionDelays.push(new Float32Array(this.MAX_REFLECTION_DELAY));
    }

    // クロスフィードバッファ
    this.crossfeedDelay = [
      new Float32Array(this.CROSSFEED_DELAY * 2),
      new Float32Array(this.CROSSFEED_DELAY * 2),
    ];

    // 耳介共鳴用バッファ
    this.pinnaCombDelay = [
      new Float32Array(this.PINNA_DELAY * 2),
      new Float32Array(this.PINNA_DELAY * 2),
    ];

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
   * 1次ローパスフィルタ（ILD用：頭部による高周波遮蔽）
   */
  private applyLowpass(sample: number, channel: number, cutoffHz: number): number {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sampleRate;
    const alpha = dt / (rc + dt);

    const state = this.ildFilterState[channel];
    const output = state.y1 + alpha * (sample - state.y1);
    state.y1 = output;

    return output;
  }

  /**
   * クロスフィード用ローパスフィルタ
   */
  private applyCrossfeedFilter(sample: number, channel: number): number {
    const cutoffHz = 700; // クロスフィードは低周波のみ
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sampleRate;
    const alpha = dt / (rc + dt);

    const state = this.crossfeedFilterState[channel];
    const output = state.y1 + alpha * (sample - state.y1);
    state.y1 = output;

    return output;
  }

  /**
   * ITD処理（両耳間時間差）
   * 音源の方向に応じて左右の遅延を調整
   */
  private applyITD(
    left: number,
    right: number,
    panAmount: number // -1.0（左）〜 1.0（右）
  ): [number, number] {
    // 遅延サンプル数を計算（最大約0.7ms = 頭部幅による最大ITD）
    const maxDelaySamples = Math.min(32, this.MAX_ITD_SAMPLES - 1);
    const delaySamples = Math.floor(Math.abs(panAmount) * maxDelaySamples);

    // バッファに書き込み
    this.itdBufferL[this.itdWritePos] = left;
    this.itdBufferR[this.itdWritePos] = right;

    // 遅延読み取り位置
    const readPosL = (this.itdWritePos - (panAmount > 0 ? delaySamples : 0) + this.MAX_ITD_SAMPLES) % this.MAX_ITD_SAMPLES;
    const readPosR = (this.itdWritePos - (panAmount < 0 ? delaySamples : 0) + this.MAX_ITD_SAMPLES) % this.MAX_ITD_SAMPLES;

    const outL = this.itdBufferL[readPosL];
    const outR = this.itdBufferR[readPosR];

    this.itdWritePos = (this.itdWritePos + 1) % this.MAX_ITD_SAMPLES;

    return [outL, outR];
  }

  /**
   * ILD処理（両耳間レベル差）
   * 頭部による高周波遮蔽をシミュレート
   */
  private applyILD(
    left: number,
    right: number,
    panAmount: number // -1.0（左）〜 1.0（右）
  ): [number, number] {
    // パン量に応じて反対側の高周波を減衰
    const ildAmount = Math.abs(panAmount) * 0.4; // 最大40%減衰

    let outL = left;
    let outR = right;

    if (panAmount > 0) {
      // 右寄りの音源：左耳で高周波減衰
      const filtered = this.applyLowpass(left, 0, 3000 + (1 - ildAmount) * 12000);
      outL = left * (1 - ildAmount) + filtered * ildAmount;
    } else if (panAmount < 0) {
      // 左寄りの音源：右耳で高周波減衰
      const filtered = this.applyLowpass(right, 1, 3000 + (1 - ildAmount) * 12000);
      outR = right * (1 - ildAmount) + filtered * ildAmount;
    }

    return [outL, outR];
  }

  /**
   * クロスフィード処理（自然なステレオ感）
   */
  private applyCrossfeed(
    left: number,
    right: number,
    amount: number
  ): [number, number] {
    // ディレイバッファに書き込み
    this.crossfeedDelay[0][this.crossfeedWritePos] = left;
    this.crossfeedDelay[1][this.crossfeedWritePos] = right;

    // 遅延読み取り
    const readPos = (this.crossfeedWritePos - this.CROSSFEED_DELAY + this.crossfeedDelay[0].length) % this.crossfeedDelay[0].length;
    const delayedL = this.crossfeedDelay[0][readPos];
    const delayedR = this.crossfeedDelay[1][readPos];

    this.crossfeedWritePos = (this.crossfeedWritePos + 1) % this.crossfeedDelay[0].length;

    // ローパスフィルタを通して反対チャンネルに加算
    const crossL = this.applyCrossfeedFilter(delayedR, 0) * amount * 0.15;
    const crossR = this.applyCrossfeedFilter(delayedL, 1) * amount * 0.15;

    return [left + crossL, right + crossR];
  }

  /**
   * 早期反射処理（空間の広がり感）
   */
  private applyEarlyReflections(
    left: number,
    right: number,
    depth: number
  ): [number, number] {
    // 4本のディレイライン（異なる遅延時間と減衰）
    const delays = this.settings.lowLatencyMode
      ? [120, 240, 380, 520]   // 低遅延モード
      : [240, 520, 880, 1200]; // 通常モード

    const gains = [0.35, 0.25, 0.18, 0.12];

    // 入力をディレイラインに書き込み
    const mono = (left + right) * 0.5;
    for (let i = 0; i < 4; i++) {
      this.reflectionDelays[i][this.reflectionWritePos] = mono;
    }

    let reflL = 0;
    let reflR = 0;

    // 各ディレイラインから読み取り
    for (let i = 0; i < 4; i++) {
      const readPos = (this.reflectionWritePos - delays[i] + this.MAX_REFLECTION_DELAY) % this.MAX_REFLECTION_DELAY;
      const sample = this.reflectionDelays[i][readPos] * gains[i] * depth;

      // 左右に交互に振り分け（広がり感）
      if (i % 2 === 0) {
        reflL += sample;
        reflR += sample * 0.6;
      } else {
        reflL += sample * 0.6;
        reflR += sample;
      }
    }

    this.reflectionWritePos = (this.reflectionWritePos + 1) % this.MAX_REFLECTION_DELAY;

    return [left + reflL, right + reflR];
  }

  /**
   * 高さ成分処理（耳介共鳴のシミュレーション）
   * 高周波成分にコムフィルタを適用して上方向の音を表現
   */
  private applyHeightCue(
    left: number,
    right: number,
    height: number
  ): [number, number] {
    // 高周波成分を抽出（差分）
    const prevL = this.pinnaCombDelay[0][(this.pinnaCombWritePos - 1 + this.pinnaCombDelay[0].length) % this.pinnaCombDelay[0].length];
    const prevR = this.pinnaCombDelay[1][(this.pinnaCombWritePos - 1 + this.pinnaCombDelay[1].length) % this.pinnaCombDelay[1].length];

    const highL = left - prevL;
    const highR = right - prevR;

    // ディレイに書き込み
    this.pinnaCombDelay[0][this.pinnaCombWritePos] = left;
    this.pinnaCombDelay[1][this.pinnaCombWritePos] = right;

    // コムフィルタ（耳介の共鳴をシミュレート）
    const combReadPos = (this.pinnaCombWritePos - this.PINNA_DELAY + this.pinnaCombDelay[0].length) % this.pinnaCombDelay[0].length;
    const combL = this.pinnaCombDelay[0][combReadPos];
    const combR = this.pinnaCombDelay[1][combReadPos];

    this.pinnaCombWritePos = (this.pinnaCombWritePos + 1) % this.pinnaCombDelay[0].length;

    // 高さ成分を追加
    const heightAmount = height * 0.2;
    return [
      left + (highL * 0.3 + combL * 0.1) * heightAmount,
      right + (highR * 0.3 + combR * 0.1) * heightAmount,
    ];
  }

  /**
   * ステレオワイド処理（M/S + ITD/ILD）
   */
  private processStereoWide(left: number, right: number): [number, number] {
    const width = this.settings.width / 100;

    // M/S処理
    const mid = (left + right) * 0.5;
    const side = (left - right) * 0.5;
    const enhancedSide = side * (1 + width);

    let outL = mid + enhancedSide;
    let outR = mid - enhancedSide;

    // サイド成分の強さから仮想パン位置を計算
    const panAmount = Math.tanh(side * 3) * width;

    // ITD/ILD適用
    [outL, outR] = this.applyITD(outL, outR, panAmount * 0.5);
    [outL, outR] = this.applyILD(outL, outR, panAmount * 0.3);

    // クロスフィード
    [outL, outR] = this.applyCrossfeed(outL, outR, 1 - width * 0.5);

    return [outL, outR];
  }

  /**
   * サラウンド処理（7.1ch風）
   */
  private processSurround(left: number, right: number): [number, number] {
    const width = this.settings.width / 100;
    const depth = this.settings.depth / 100;

    // ステレオワイド
    let [outL, outR] = this.processStereoWide(left, right);

    // 早期反射で空間感を追加
    [outL, outR] = this.applyEarlyReflections(outL, outR, depth);

    return [outL, outR];
  }

  /**
   * Atmos風処理（高さ成分追加）
   */
  private processAtmos(left: number, right: number): [number, number] {
    const height = this.settings.height / 100;

    // サラウンド処理
    let [outL, outR] = this.processSurround(left, right);

    // 高さ成分追加
    [outL, outR] = this.applyHeightCue(outL, outR, height);

    return [outL, outR];
  }

  /**
   * オーディオ処理
   */
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _params: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];

    if (!input?.length || !output?.length) return true;

    // モノラル入力
    if (input.length === 1) {
      output[0].set(input[0]);
      if (output.length > 1) output[1].set(input[0]);
      return true;
    }

    // バイパス
    if (!this.settings.enabled || this.settings.mode === 'off') {
      output[0].set(input[0]);
      output[1].set(input[1]);
      return true;
    }

    const frameSize = input[0].length;

    for (let i = 0; i < frameSize; i++) {
      const left = input[0][i];
      const right = input[1][i];
      let outL: number, outR: number;

      switch (this.settings.mode) {
        case 'stereo-wide':
          [outL, outR] = this.processStereoWide(left, right);
          break;
        case 'surround-71':
          [outL, outR] = this.processSurround(left, right);
          break;
        case 'atmos':
          [outL, outR] = this.processAtmos(left, right);
          break;
        default:
          outL = left;
          outR = right;
      }

      // クリッピング防止
      output[0][i] = Math.max(-1, Math.min(1, outL));
      output[1][i] = Math.max(-1, Math.min(1, outR));
    }

    return true;
  }
}

registerProcessor('spatial-processor', SpatialProcessor);
