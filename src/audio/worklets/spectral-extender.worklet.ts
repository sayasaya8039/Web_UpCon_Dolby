/**
 * Spectral Extender AudioWorklet Processor
 * 高調波生成による周波数帯域補完（エキサイター/SBR風処理）
 *
 * 低ビットレート音源で失われた高周波成分を、高調波生成によって補完します。
 */

interface SpectralExtenderSettings {
  enabled: boolean;
  maxFrequency: number;  // 目標上限周波数
  intensity: number;     // 強度 (0-100)
}

class SpectralExtenderProcessor extends AudioWorkletProcessor {
  private settings: SpectralExtenderSettings = {
    enabled: false,
    maxFrequency: 24000,
    intensity: 50,
  };

  // ハイパスフィルタ状態（高調波抽出用）
  private hpfState: { x1: number; x2: number; y1: number; y2: number }[] = [
    { x1: 0, x2: 0, y1: 0, y2: 0 },
    { x1: 0, x2: 0, y1: 0, y2: 0 },
  ];

  // ローパスフィルタ状態（高調波平滑化用）
  private lpfState: { x1: number; y1: number }[] = [
    { x1: 0, y1: 0 },
    { x1: 0, y1: 0 },
  ];

  // エンベロープフォロワー状態
  private envelope: number[] = [0, 0];

  // 前サンプル（オーバーサンプリング補間用）
  private prevSample: number[] = [0, 0];

  constructor() {
    super();

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
   * 2次バターワースハイパスフィルタ
   * カットオフ周波数以上の成分を抽出
   */
  private highpassFilter(
    sample: number,
    channel: number,
    cutoffHz: number
  ): number {
    const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / Math.sqrt(2);

    const b0 = (1 + cosw0) / 2;
    const b1 = -(1 + cosw0);
    const b2 = (1 + cosw0) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;

    const state = this.hpfState[channel];
    const output =
      (b0 / a0) * sample +
      (b1 / a0) * state.x1 +
      (b2 / a0) * state.x2 -
      (a1 / a0) * state.y1 -
      (a2 / a0) * state.y2;

    state.x2 = state.x1;
    state.x1 = sample;
    state.y2 = state.y1;
    state.y1 = output;

    return output;
  }

  /**
   * 1次ローパスフィルタ（高調波の高周波ノイズを軽減）
   */
  private lowpassFilter(
    sample: number,
    channel: number,
    cutoffHz: number
  ): number {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sampleRate;
    const alpha = dt / (rc + dt);

    const state = this.lpfState[channel];
    const output = state.y1 + alpha * (sample - state.y1);

    state.x1 = sample;
    state.y1 = output;

    return output;
  }

  /**
   * ソフトクリッピングによる高調波生成
   * tanh関数を使用して自然な高調波を生成
   */
  private generateHarmonics(sample: number, drive: number): number {
    // ドライブ量を調整（1.0〜5.0）
    const driveAmount = 1 + drive * 4;
    // tanh でソフトクリッピング
    return Math.tanh(sample * driveAmount) / driveAmount;
  }

  /**
   * 2倍オーバーサンプリングによる高調波生成
   * より高い周波数の高調波を生成可能
   */
  private generateHarmonicsOversampled(
    sample: number,
    channel: number,
    drive: number
  ): number {
    // 2倍オーバーサンプリング（線形補間）
    const mid = (sample + this.prevSample[channel]) * 0.5;
    this.prevSample[channel] = sample;

    // 両方のサンプルで高調波生成
    const h1 = this.generateHarmonics(mid, drive);
    const h2 = this.generateHarmonics(sample, drive);

    // 平均を返す（ダウンサンプリング）
    return (h1 + h2) * 0.5;
  }

  /**
   * エンベロープフォロワー（ダイナミクス追従）
   */
  private followEnvelope(sample: number, channel: number): number {
    const attackTime = 0.001;  // 1ms
    const releaseTime = 0.050; // 50ms

    const attackCoef = 1 - Math.exp(-1 / (sampleRate * attackTime));
    const releaseCoef = 1 - Math.exp(-1 / (sampleRate * releaseTime));

    const inputLevel = Math.abs(sample);

    if (inputLevel > this.envelope[channel]) {
      this.envelope[channel] += attackCoef * (inputLevel - this.envelope[channel]);
    } else {
      this.envelope[channel] += releaseCoef * (inputLevel - this.envelope[channel]);
    }

    return this.envelope[channel];
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
      for (let ch = 0; ch < Math.min(input.length, output.length); ch++) {
        output[ch].set(input[ch]);
      }
      return true;
    }

    // パラメータ計算
    const intensity = this.settings.intensity / 100; // 0-1
    const drive = intensity * 0.8; // 高調波生成の強度

    // 高調波を抽出するためのハイパスカットオフ
    // 元の音源のカットオフ（通常16kHz前後）の少し下から抽出
    const hpfCutoff = Math.min(12000, this.settings.maxFrequency * 0.5);

    // 高調波のローパスカットオフ（目標周波数）
    const lpfCutoff = Math.min(this.settings.maxFrequency, sampleRate * 0.45);

    for (let ch = 0; ch < Math.min(input.length, output.length); ch++) {
      const inputChannel = input[ch];
      const outputChannel = output[ch];

      for (let i = 0; i < inputChannel.length; i++) {
        const sample = inputChannel[i];

        // エンベロープを追従（ダイナミクスに応じた処理）
        const env = this.followEnvelope(sample, ch);

        // 高調波生成（オーバーサンプリング使用）
        const harmonics = this.generateHarmonicsOversampled(sample, ch, drive);

        // 生成された高調波から高周波成分を抽出
        const highFreqHarmonics = this.highpassFilter(harmonics - sample, ch, hpfCutoff);

        // ローパスで高周波ノイズを軽減
        const smoothedHarmonics = this.lowpassFilter(highFreqHarmonics, ch, lpfCutoff);

        // エンベロープに基づいてブレンド量を調整（静かな部分では控えめに）
        const dynamicMix = Math.min(1, env * 10) * intensity;

        // 元の信号に高調波を加算
        const mixed = sample + smoothedHarmonics * dynamicMix * 0.5;

        // クリッピング防止
        outputChannel[i] = Math.max(-1, Math.min(1, mixed));
      }
    }

    return true;
  }
}

registerProcessor('spectral-extender-processor', SpectralExtenderProcessor);
