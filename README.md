# Web UpCon Dolby

配信サービスの音声をリアルタイムでアップサンプリング・空間オーディオ化するChrome/Edge拡張機能

## 概要

YouTube、Amazon Musicなどの配信サービスから再生される音声を、リアルタイムで高品質化します。

## 主な機能

### ハイレゾ化
- **アップサンプリング**: 48kHz / 96kHz / 192kHz への変換
- **周波数帯域拡張 (SBR)**: FFTベースのスペクトラルバンドレプリケーション
  - 低ビットレート音源で失われた高周波成分を最大48kHzまで補完
  - upconvfe風のアルゴリズム

### 空間オーディオ
- **ステレオワイド**: M/S処理 + ITD/ILD + クロスフィード
- **7.1chサラウンド**: 仮想スピーカー配置によるバイノーラル処理
  - Front L/R (±30°)
  - Center (0°)
  - Surround L/R (±110°)
  - Surround Back L/R (±150°)
  - LFE (80Hz以下)
- **Dolby Atmos風**: 7.1ch + 高さ成分（耳介共鳴シミュレーション）

### HRTF処理
- **ITD (両耳間時間差)**: 音源方向に応じた遅延
- **ILD (両耳間レベル差)**: 頭部による高周波遮蔽
- **早期反射**: 4本のディレイラインで空間感
- **クロスフィード**: 自然なステレオ感
- **HRTF強度調整**: 1-8（Dolby Atmos互換）

### プリセット
| プリセット | 用途 | 特徴 |
|-----------|------|------|
| **Music** | 音楽鑑賞 | 96kHz、ステレオワイド、HRTF強度5 |
| **Movie** | 映画/動画 | 48kHz、7.1chサラウンド、HRTF強度7 |
| **Gaming** | ゲーム | 低遅延モード、Atmos、HRTF強度8 |
| **Custom** | カスタム | 全パラメータ調整可能 |

## インストール

1. リリースページから最新版をダウンロード
2. Chrome: `chrome://extensions` を開く
3. 「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」で `Web_UpCon_Dolby` フォルダを選択

## 使い方

1. YouTubeなどの動画/音楽サイトを開く
2. 拡張機能アイコンをクリック
3. 「有効」をオンにする
4. プリセットを選択、または各パラメータを調整

## 開発

```bash
# 依存関係のインストール
npm install

# 開発ビルド（ウォッチモード）
npm run dev

# 本番ビルド
npm run build

# 型チェック
npm run type-check
```

## ビルド出力

`Web_UpCon_Dolby/` フォルダに出力されます。

## 技術スタック

- TypeScript
- React 19
- Vite 7
- Web Audio API (AudioWorklet)
- Chrome Extension Manifest V3

## アーキテクチャ

```
音源 → AudioContext
     → UpsamplerWorklet（パススルー、AudioContextでサンプルレート変換）
     → SpectralExtenderWorklet（FFT-SBR処理）
     → SpatialProcessorWorklet（HRTF空間処理）
     → MakeupGainNode（音量補正）
     → MasterGainNode
     → AnalyserNode
     → 出力
```

## ライセンス

MIT
