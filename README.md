# Web UpCon Dolby

配信サービスの音声をリアルタイムでアップサンプリング・空間オーディオ化するChrome/Edge拡張機能

## 概要

YouTube、Amazon Musicなどの配信サービスから再生される音声を、リアルタイムで高品質化します。

### 主な機能

- **アップサンプリング**: 48kHz/96kHz/192kHzへのアップサンプリング
- **周波数帯域拡張**: 圧縮で失われた高周波を32kHzまで補完
- **空間オーディオ**: 疑似Dolby Atmos 7.1ch、HRTF空間オーディオ

## 開発

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
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

## ライセンス

MIT
