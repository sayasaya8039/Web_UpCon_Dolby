/**
 * AudioWorkletファイルをTypeScriptからJavaScriptにビルド（esbuild使用）
 */
import { build } from 'esbuild';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Workletファイルのリスト
const workletFiles = [
  'src/audio/worklets/upsampler.worklet.ts',
  'src/audio/worklets/spectral-extender.worklet.ts',
  'src/audio/worklets/spatial-processor.worklet.ts',
];

// 出力先ディレクトリ
const outputDir = join(rootDir, 'Web_UpCon_Dolby', 'src', 'audio', 'worklets');

/**
 * メイン処理
 */
async function main() {
  console.log('[build-worklets] AudioWorkletビルド開始...');

  // 出力ディレクトリを作成
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    console.log(`[build-worklets] ディレクトリ作成: ${outputDir}`);
  }

  for (const file of workletFiles) {
    try {
      const inputPath = join(rootDir, file);
      const outputFileName = basename(file).replace('.ts', '.js');
      const outputPath = join(outputDir, outputFileName);

      // esbuildでトランスパイル
      await build({
        entryPoints: [inputPath],
        outfile: outputPath,
        bundle: false,        // AudioWorkletはバンドルしない
        format: 'iife',       // 即時実行関数式（グローバルスコープ）
        target: 'es2020',
        minify: false,        // デバッグしやすくするため
        write: true,
      });

      console.log(`[build-worklets] ビルド完了: ${outputFileName}`);
    } catch (error) {
      console.error(`[build-worklets] エラー: ${file}`, error.message);
      process.exit(1);
    }
  }

  console.log('[build-worklets] 全てのWorkletビルド完了');
}

main();
