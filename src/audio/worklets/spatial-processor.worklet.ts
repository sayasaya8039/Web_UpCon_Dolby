/**
 * Spatial Audio Processor AudioWorklet
 * HRTF空間オーディオと7.1chサラウンド仮想化
 */

type SpatialMode = 'off' | 'stereo-wide' | 'surround-71' | 'atmos';

interface SpatialSettings {
  enabled: boolean;
  mode: SpatialMode;
  width: number;
  depth: number;
  height: number;
}

class SpatialProcessor extends AudioWorkletProcessor {
  private settings: SpatialSettings = {
    enabled: true,
    mode: 'stereo-wide',
    width: 0.6,
    depth: 0.4,
    height: 0.3,
  };

  // 簡易HRTFフィルタ係数（実際はもっと長いインパルス応答を使用）
  private readonly HRTF_LENGTH = 64;

  // 各方向のHRTFフィルタ（左耳用）
  private hrtfFilters: Map<string, { left: Float32Array; right: Float32Array }>;

  // 畳み込み用バッファ
  private convolutionBuffer: Float32Array[];

  // オールパスフィルタ係数（空間の広がり）
  private allpassCoefs: Float32Array;
  private allpassDelays: Float32Array[];
  private allpassStates: Float32Array[];

  // クロスフィードフィルタ
  private crossfeedBuffer: Float32Array[];
  private crossfeedDelay: number;

  // 遅延ライン（反響用）
  private delayLines: Float32Array[];
  private delayWritePos: number[];
  private readonly MAX_DELAY = 4096;

  constructor() {
    super();

    // 簡易HRTFフィルタを初期化（実際はMIT/CIPICデータを使用）
    this.hrtfFilters = this.generateSimplifiedHRTF();

    // 畳み込みバッファ
    this.convolutionBuffer = [
      new Float32Array(this.HRTF_LENGTH),
      new Float32Array(this.HRTF_LENGTH),
    ];

    // オールパスフィルタ
    this.allpassCoefs = new Float32Array([0.6, -0.6, 0.5, -0.5]);
    this.allpassDelays = [
      new Float32Array(1024),
      new Float32Array(1024),
    ];
    this.allpassStates = [
      new Float32Array(4),
      new Float32Array(4),
    ];

    // クロスフィード
    this.crossfeedBuffer = [
      new Float32Array(256),
      new Float32Array(256),
    ];
    this.crossfeedDelay = 20; // サンプル

    // 遅延ライン
    this.delayLines = [
      new Float32Array(this.MAX_DELAY),
      new Float32Array(this.MAX_DELAY),
      new Float32Array(this.MAX_DELAY),
      new Float32Array(this.MAX_DELAY),
    ];
    this.delayWritePos = [0, 0, 0, 0];

    // メッセージハンドラー
    this.port.onmessage = (event) => {
      if (event.data.type === 'updateSettings') {
        this.settings = {
          enabled: event.data.enabled ?? this.settings.enabled,
          mode: event.data.mode ?? this.settings.mode,
          width: event.data.width ?? this.settings.width,
          depth: event.data.depth ?? this.settings.depth,
          height: event.data.height ?? this.settings.height,
        };
      }
    };
  }

  /**
   * 簡易HRTFフィルタを生成
   */
  private generateSimplifiedHRTF(): Map<string, { left: Float32Array; right: Float32Array }> {
    const filters = new Map();

    // 方向ごとの特性（実際のHRTFはもっと複雑）
    const directions = [
      { name: 'front', azimuth: 0, elevation: 0 },
      { name: 'front-left', azimuth: -30, elevation: 0 },
      { name: 'front-right', azimuth: 30, elevation: 0 },
      { name: 'side-left', azimuth: -90, elevation: 0 },
      { name: 'side-right', azimuth: 90, elevation: 0 },
      { name: 'rear-left', azimuth: -135, elevation: 0 },
      { name: 'rear-right', azimuth: 135, elevation: 0 },
      { name: 'top-front', azimuth: 0, elevation: 45 },
      { name: 'top-rear', azimuth: 180, elevation: 45 },
    ];

    for (const dir of directions) {
      const left = new Float32Array(this.HRTF_LENGTH);
      const right = new Float32Array(this.HRTF_LENGTH);

      // 方向に基づく簡易フィルタ生成
      const azimuthRad = (dir.azimuth * Math.PI) / 180;
      const elevationRad = (dir.elevation * Math.PI) / 180;

      // ITD (Interaural Time Difference)
      const itdSamples = Math.round(8 * Math.sin(azimuthRad));

      // ILD (Interaural Level Difference)
      const ildLeft = 0.5 + 0.5 * Math.cos(azimuthRad - Math.PI / 2);
      const ildRight = 0.5 + 0.5 * Math.cos(azimuthRad + Math.PI / 2);

      // インパルス応答生成（簡易版）
      for (let i = 0; i < this.HRTF_LENGTH; i++) {
        // 基本的なインパルス
        const baseImpulse = Math.exp(-i / 10) * Math.sin(i * 0.5);

        // 仰角による高周波特性変化
        const elevationMod = 1 - 0.3 * Math.abs(Math.sin(elevationRad));

        // ITDを考慮した遅延
        const leftDelay = Math.max(0, itdSamples);
        const rightDelay = Math.max(0, -itdSamples);

        if (i >= leftDelay) {
          left[i - leftDelay] = baseImpulse * ildLeft * elevationMod;
        }
        if (i >= rightDelay) {
          right[i - rightDelay] = baseImpulse * ildRight * elevationMod;
        }
      }

      filters.set(dir.name, { left, right });
    }

    return filters;
  }

  /**
   * 畳み込み処理
   */
  private convolve(
    input: number,
    filter: Float32Array,
    buffer: Float32Array,
    writePos: number
  ): number {
    buffer[writePos] = input;

    let output = 0;
    for (let i = 0; i < filter.length; i++) {
      const bufIdx = (writePos - i + buffer.length) % buffer.length;
      output += buffer[bufIdx] * filter[i];
    }

    return output;
  }

  /**
   * ステレオワイド処理
   */
  private processStereoWide(
    left: Float32Array,
    right: Float32Array,
    outputLeft: Float32Array,
    outputRight: Float32Array
  ): void {
    const width = this.settings.width;

    for (let i = 0; i < left.length; i++) {
      // M/S処理
      const mid = (left[i] + right[i]) * 0.5;
      const side = (left[i] - right[i]) * 0.5;

      // サイド成分を強調
      const enhancedSide = side * (1 + width);

      outputLeft[i] = mid + enhancedSide;
      outputRight[i] = mid - enhancedSide;

      // クロスフィード追加（自然な響き）
      const crossfeedAmount = 0.1 * this.settings.depth;
      const delayIdx = (i + this.crossfeedDelay) % left.length;
      if (delayIdx < left.length) {
        outputLeft[delayIdx] += right[i] * crossfeedAmount;
        outputRight[delayIdx] += left[i] * crossfeedAmount;
      }
    }
  }

  /**
   * 7.1chサラウンド仮想化
   */
  private process71Surround(
    left: Float32Array,
    right: Float32Array,
    outputLeft: Float32Array,
    outputRight: Float32Array
  ): void {
    const width = this.settings.width;
    const depth = this.settings.depth;

    // 仮想スピーカー位置からのHRTF適用
    const frontLeft = this.hrtfFilters.get('front-left')!;
    const frontRight = this.hrtfFilters.get('front-right')!;
    const sideLeft = this.hrtfFilters.get('side-left')!;
    const sideRight = this.hrtfFilters.get('side-right')!;
    const rearLeft = this.hrtfFilters.get('rear-left')!;
    const rearRight = this.hrtfFilters.get('rear-right')!;

    for (let i = 0; i < left.length; i++) {
      // フロント（直接音）
      let outL = left[i] * 0.5;
      let outR = right[i] * 0.5;

      // サイド成分（ステレオ拡張）
      const side = (left[i] - right[i]) * width * 0.3;
      outL += side;
      outR -= side;

      // リア成分（遅延付き反響）
      const delayTime = Math.floor(depth * 200); // 最大200サンプル遅延
      const delayIdx = (this.delayWritePos[0] - delayTime + this.MAX_DELAY) % this.MAX_DELAY;

      const rearL = this.delayLines[0][delayIdx] * depth * 0.2;
      const rearR = this.delayLines[1][delayIdx] * depth * 0.2;

      outL += rearL;
      outR += rearR;

      // 遅延ラインに書き込み
      this.delayLines[0][this.delayWritePos[0]] = left[i];
      this.delayLines[1][this.delayWritePos[1]] = right[i];
      this.delayWritePos[0] = (this.delayWritePos[0] + 1) % this.MAX_DELAY;
      this.delayWritePos[1] = (this.delayWritePos[1] + 1) % this.MAX_DELAY;

      outputLeft[i] = outL;
      outputRight[i] = outR;
    }
  }

  /**
   * Dolby Atmos風処理（高さ成分追加）
   */
  private processAtmos(
    left: Float32Array,
    right: Float32Array,
    outputLeft: Float32Array,
    outputRight: Float32Array
  ): void {
    // まず7.1ch処理を適用
    this.process71Surround(left, right, outputLeft, outputRight);

    const height = this.settings.height;

    // 高さ成分を追加
    const topFront = this.hrtfFilters.get('top-front')!;
    const topRear = this.hrtfFilters.get('top-rear')!;

    for (let i = 0; i < left.length; i++) {
      // 高周波成分を抽出して上方向に配置
      // （簡易的に前サンプルとの差分を使用）
      const prevL = i > 0 ? left[i - 1] : 0;
      const prevR = i > 0 ? right[i - 1] : 0;
      const highFreqL = (left[i] - prevL) * height * 0.15;
      const highFreqR = (right[i] - prevR) * height * 0.15;

      // 遅延を加えて天井反射をシミュレート
      const heightDelay = Math.floor(height * 100);
      const heightDelayIdx = (this.delayWritePos[2] - heightDelay + this.MAX_DELAY) % this.MAX_DELAY;

      outputLeft[i] += this.delayLines[2][heightDelayIdx] * height * 0.1;
      outputRight[i] += this.delayLines[3][heightDelayIdx] * height * 0.1;

      // 高周波成分を遅延ラインに
      this.delayLines[2][this.delayWritePos[2]] = highFreqL;
      this.delayLines[3][this.delayWritePos[3]] = highFreqR;
      this.delayWritePos[2] = (this.delayWritePos[2] + 1) % this.MAX_DELAY;
      this.delayWritePos[3] = (this.delayWritePos[3] + 1) % this.MAX_DELAY;
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

    if (!input || input.length < 2 || !output || output.length < 2) {
      // モノラル入力の場合はそのまま出力
      if (input && input.length === 1 && output && output.length >= 1) {
        output[0].set(input[0]);
        if (output.length > 1) output[1].set(input[0]);
      }
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
        this.process71Surround(input[0], input[1], output[0], output[1]);
        break;

      case 'atmos':
        this.processAtmos(input[0], input[1], output[0], output[1]);
        break;

      default:
        output[0].set(input[0]);
        output[1].set(input[1]);
    }

    return true;
  }
}

registerProcessor('spatial-processor', SpatialProcessor);
