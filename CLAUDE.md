# CLAUDE.md - グローバル開発ガイドライン

このファイルはAIアシスタントがすべてのプロジェクトで作業する際の標準ガイドラインです。

## 目次

- [対応環境](#対応環境)
- [最重要指示](#最重要指示)
- [Git・コミット規則](#gitコミット規則)
- [作業ログ](#作業ログ)
- [セキュリティ・禁止事項](#セキュリティ禁止事項)
- [コーディング規約](#コーディング規約)
- [Python規約](#python規約)
- [TypeScript/React規約](#typescriptreact規約)
- [テスト規約](#テスト規約)
- [デザインガイドライン](#デザインガイドライン)
- [ファイル・フォルダ規則](#ファイルフォルダ規則)
- [依存関係管理](#依存関係管理)
- [トラブルシューティング](#トラブルシューティング)

---

## 対応環境

- **Claude Code** (CLI / VSCode拡張)
- **VSCode** (GitHub Copilot等)
- **Cursor** / **Windsurf** / その他AIコーディングアシスタント

---

## 最重要指示

### 基本動作

- **このCLAUDE.mdのルールを必ず遵守すること**
- **起動時に `./claude/` 内の全ファイルを読み込んで確認すること**
- **必ず日本語で回答すること**（英語での回答は禁止）
- **Yes/No確認を求めずに、タスクの最後まで実行すること**
- **デバッグ・ビルドまで必ず完了させること**

### 作業スタイル

- 実行する操作の理由を明確に説明
- **マルチエージェント（Task tool）を積極的に活用すること**
  - 複数の独立したタスクは並列実行で効率化
  - コードベース探索にはExploreエージェントを使用
  - 調査・検索タスクはサブエージェントに委譲
  - **バックグラウンド実行（run_in_background）を活用**し、待ち時間中も別作業を進める
- 公式ドキュメントをWebSearch/WebFetchで参照
- 同じ作業を繰り返さない（コスト削減）

## 完了条件

### 必須フロー（この順番で必ず実行）

1. **コード作成・修正**
2. **ビルド実行**
   - 出力先はアプリ名フォルダ（distは使わない）
3. **デバッグ・テスト**
   - lint、型チェック、ユニットテストを実行
   - エラーがあれば修正して再ビルド
4. **動作確認**
   - Webアプリ → ローカルで動作確認
   - 拡張機能 → 読み込みテスト
   - Windowsアプリ → 起動確認
5. **Git操作（自動で最後まで実行）**
```bash
   git add .
   git commit -m "[種類] 変更内容"
   git pull origin main --rebase
   git push origin main
```
6. **README.md作成・更新**
   - ビルドフォルダ内にも配置

### プロジェクト種類別の追加作業

| 種類 | 追加作業 |
|------|----------|
| Webアプリ | Cloudflare Workersにデプロイ |
| Chrome拡張 | ZIPファイル作成 |
| Windowsアプリ | EXE生成確認、GitHub Releasesで配布 |

### 確認不要ルール

- 上記フローはYes/No確認なしで最後まで実行
- エラーが出たら自動で修正して続行
- プッシュ完了まで止まらない

---

## Git・コミット規則

### ブランチ戦略

| ブランチ | 用途 | マージ先 |
|----------|------|----------|
| `main` | 本番環境・安定版 | - |
| `develop` | 開発統合ブランチ | main |
| `feature/*` | 新機能開発 | develop |
| `fix/*` | バグ修正 | develop |
| `hotfix/*` | 緊急修正 | main, develop |

```bash
# ブランチ作成例
git checkout -b feature/add-login-form
git checkout -b fix/user-validation-error
```

### コミットメッセージ

- **日本語で記載**
- 形式：`[種類] 変更内容の説明`

| 種類 | 用途 | 例 |
|------|------|-----|
| `[feat]` | 新機能追加 | `[feat] ユーザー認証機能を追加` |
| `[fix]` | バグ修正 | `[fix] ログイン時のエラーを修正` |
| `[refactor]` | リファクタリング | `[refactor] API呼び出しを共通化` |
| `[docs]` | ドキュメント | `[docs] READMEにセットアップ手順を追加` |
| `[test]` | テスト | `[test] ユーザー登録のテストを追加` |
| `[chore]` | 設定・ビルド | `[chore] ESLint設定を更新` |
| `[style]` | フォーマット | `[style] コードフォーマットを修正` |

### GitHub CLI活用

```bash
gh repo create          # リポジトリ作成
gh pr create            # PR作成
gh issue create         # Issue作成
gh release create v1.0  # リリース作成
```

### EXEファイルのリリース

WindowsアプリのEXEファイルはGitHub Releasesで配布する。

```bash
# リリース作成とEXEファイルのアップロード
gh release create v1.0.0 ./アプリ名/アプリ名.exe --title "v1.0.0" --notes "リリースノート"

# 既存リリースにファイルを追加
gh release upload v1.0.0 ./アプリ名/アプリ名.exe
```

### 機能追加時のフロー

1. featureブランチ作成
2. 実装・ビルド・デバッグ
3. プッシュ
4. PR自動作成
```
bash
   
gh pr create --title "[feat] 機能名" --body "変更内容"
```

### PR・Issueテンプレート

**PRタイトル**: `[種類] 変更内容の概要`

**PR本文**:

```markdown
## 概要
この変更で何を実現するか

## 変更内容
- 変更点1
- 変更点2

## テスト
- [ ] ユニットテスト追加/更新
- [ ] 動作確認済み
```

---

## 作業ログ

- 会話ログは `docs-dev/work_log/YYYY-MM-DD.md` に保存
- 日付は環境設定の `Today's date` を使用

### テンプレート

```markdown
# 作業ログ - YYYY-MM-DD

## 実施内容
- [ ] タスク1
- [ ] タスク2

## 変更ファイル
- `path/to/file.ts` - 変更内容

## 課題・メモ
- 気づいた点や残課題

## 次回TODO
- 次にやること
```

---

## セキュリティ・禁止事項

### 絶対禁止

| 禁止事項 | 理由 |
|----------|------|
| APIキー・パスワードのハードコード | 漏洩リスク |
| `rm -rf /` 等の危険コマンド | システム破壊 |
| ユーザー許可なくファイル削除 | データ損失 |
| `any`型の乱用 | 型安全性の崩壊 |
| 1000行超の巨大ファイル | 保守性低下 |
| 空のcatchブロック | エラー握りつぶし |

### Gitにコミットしないファイル

```text
# 環境変数・機密情報
.env
.env.*
*.pem
*.key
credentials.json
token.json
secrets/

# ビルド成果物
node_modules/
__pycache__/
*.pyc
```

### 生成AI API方針

- APIキーは使用者個々のものを使用
- ユーザーが自身のAPIキーを設定できるUIを提供
- APIキーはローカルストレージまたは環境変数で管理

---

## コーディング規約

### 基本原則

- シンプルで分かりやすいコード
- 日本語ユーザーを第一に考えた設計
- コメントは日本語で記述
- 過度な抽象化を避ける

### 命名規則

| 対象 | 規則 | 例 |
|------|------|-----|
| クラス | PascalCase | `UserProfile` |
| 関数・メソッド | camelCase / snake_case | `handleClick` / `get_user` |
| 変数 | camelCase / snake_case | `userName` / `user_name` |
| 定数 | UPPER_SNAKE_CASE | `MAX_ITEMS` |
| ブール値 | is/has/can/should接頭辞 | `isLoading`, `hasError` |
| プライベート | _接頭辞 | `_internalValue` |

### エラーハンドリング

```typescript
// 良い例：具体的で分かりやすい
throw new Error('ユーザーID「${userId}」が見つかりません');

// 悪い例：何が起きたか分からない
throw new Error('Error');
```

- エラーメッセージは日本語で分かりやすく
- 何が・どこで・なぜ起きたか分かるメッセージ
- リカバリー可能な場合は復旧方法も提示

---

## Python規約

### 基本ルール

- **PEP 8準拠**
- **型ヒント必須**
- **docstringは日本語**
- Windowsデスクトップアプリ制作に推奨

### 例

```python
def get_user_by_id(user_id: int) -> User | None:
    """
    ユーザーIDからユーザー情報を取得する

    Args:
        user_id: ユーザーの一意識別子

    Returns:
        見つかった場合はUserオブジェクト、なければNone
    """
    pass
```

### 推奨ツール

- フォーマッター: `black`, `ruff`
- リンター: `ruff`, `flake8`
- 型チェック: `mypy`, `pyright`

---

## TypeScript/React規約

### TypeScriptルール

- **TypeScript必須**（JavaScriptは使わない）
- **ESLint + Prettier使用**
- `any`型は原則禁止

### 型定義

```typescript
// インターフェースで型定義
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

// Props型は明示的に定義
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}
```

### コンポーネント

```tsx
// 関数コンポーネント + アロー関数
const Button: React.FC<ButtonProps> = ({ label, onClick, disabled }) => {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
};
```

---

## テスト規約

### テスト方針

- 新機能には必ずテストを追加
- バグ修正時は再発防止テストを追加
- カバレッジ目標: 80%以上

### テストファイル配置

```text
src/
├── components/
│   ├── Button.tsx
│   └── Button.test.tsx    # 同階層に配置
└── utils/
    ├── format.ts
    └── format.spec.ts     # .test または .spec
```

### テストの書き方

```typescript
describe('formatDate', () => {
  it('日付を日本語形式でフォーマットする', () => {
    const result = formatDate(new Date('2025-01-15'));
    expect(result).toBe('2025年1月15日');
  });

  it('無効な日付でエラーをスローする', () => {
    expect(() => formatDate(null)).toThrow('無効な日付です');
  });
});
```

### 推奨ツール

| 言語 | フレームワーク |
|------|----------------|
| TypeScript/React | Jest, Vitest, React Testing Library |
| Python | pytest |

---

## デザインガイドライン

### デザイン方針

- 可愛らしいデザイン（丸みを帯びた形状、柔らかい色使い）
- ダークモード / ライトモード両対応
- 設定はオプションパネルで管理
- レスポンシブ対応

### カラーパレット（パステル水色系）

| 用途 | ライトモード | ダークモード |
|------|--------------|--------------|
| 背景 | `#F0F9FF` | `#0F172A` |
| サブ背景 | `#E0F2FE` | `#1E293B` |
| テキスト | `#334155` | `#E0F2FE` |
| サブテキスト | `#64748B` | `#94A3B8` |
| アクセント | `#7DD3FC` | `#38BDF8` |
| 成功 | `#A7F3D0` | `#34D399` |
| エラー | `#FECACA` | `#F87171` |
| 警告 | `#FDE68A` | `#FBBF24` |

### スペーシング

```css
/* 基本単位: 4px */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
```

### 角丸

```css
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-full: 9999px;
```

---

## ファイル・フォルダ規則

### ファイル命名

| 種類 | 規則 | 例 |
|------|------|-----|
| コンポーネント | PascalCase | `UserProfile.tsx` |
| ユーティリティ | camelCase | `formatDate.ts` |
| 定数 | camelCase または UPPER | `constants.ts` |
| 型定義 | PascalCase | `User.types.ts` |
| テスト | +.test/.spec | `UserProfile.test.tsx` |
| スタイル | 同名 | `UserProfile.module.css` |

### フォルダ構造（推奨）

```text
src/
├── components/     # UIコンポーネント
├── hooks/          # カスタムフック
├── utils/          # ユーティリティ関数
├── types/          # 型定義
├── services/       # API通信
├── stores/         # 状態管理
└── constants/      # 定数
```

## ビルド規則

- `dist/` `build/` フォルダは使用禁止
- ビルド出力は **アプリ名のフォルダ** に出力する
  - 例: `my-chrome-extension/` `volume-manager/`
- ビルド後、そのフォルダ内にREADME.mdを作成

---

## 依存関係管理

### パッケージ追加時のルール

1. **必要性を確認** - 本当に必要か、標準APIで代替できないか
2. **メンテナンス状況を確認** - 最終更新日、Issue数、スター数
3. **ライセンスを確認** - MIT, Apache 2.0などOSS互換か
4. **バンドルサイズを確認** - 不必要に大きくないか

### バージョン指定

```json
{
  "dependencies": {
    "react": "^18.2.0",      // マイナー・パッチ更新を許可
    "typescript": "~5.3.0"   // パッチ更新のみ許可
  }
}
```

### 定期メンテナンス

```bash
# 脆弱性チェック
npm audit
pip-audit

# 更新確認
npm outdated
pip list --outdated
```

---

## トラブルシューティング

### よくある問題

| 問題 | 原因 | 解決策 |
|------|------|--------|
| `node_modules`エラー | キャッシュ破損 | `rm -rf node_modules && npm install` |
| 型エラーが消えない | TSサーバーキャッシュ | VSCode再起動 or `Ctrl+Shift+P` → Restart TS Server |
| Pythonモジュール見つからない | 仮想環境未有効化 | `source venv/bin/activate` |
| Git pushが拒否される | リモートに差分 | `git pull --rebase origin main` |
| ビルドが遅い | キャッシュなし | `.next/cache`, `node_modules/.cache`確認 |

### デバッグ手順

1. **エラーメッセージを読む** - 最初の行と最後の行が重要
2. **最小再現コードを作る** - 問題を切り分ける
3. **公式ドキュメントを確認** - WebSearchで最新情報を取得
4. **依存関係を確認** - バージョン不整合がないか

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2025年12月 | 目次追加、ブランチ戦略・テスト規約追加、構造整理 |
| 2025年12月 | 初版作成 - 簡略化・最重要指示に「確認不要・最後まで実行」を追加 |
