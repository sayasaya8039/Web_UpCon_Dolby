# Gitワークフロールール

## ブランチ戦略

### ブランチ命名規則
```
feature/機能名     - 新機能開発
fix/バグ名         - バグ修正
hotfix/緊急修正名  - 緊急の本番修正
refactor/対象名    - リファクタリング
docs/ドキュメント名 - ドキュメント更新
```

例：
- `feature/user-authentication`
- `fix/login-validation-error`
- `hotfix/security-patch`

### ブランチフロー
```
main (本番)
  └── develop (開発)
        ├── feature/xxx
        ├── feature/yyy
        └── fix/zzz
```

## コミットルール

### コミットメッセージ形式
```
[種類] 変更内容の要約

詳細な説明（必要な場合）
- 変更点1
- 変更点2

関連Issue: #123
```

### 種類（プレフィックス）
| プレフィックス | 用途 |
|---------------|------|
| `[feat]` | 新機能追加 |
| `[fix]` | バグ修正 |
| `[refactor]` | リファクタリング |
| `[docs]` | ドキュメント更新 |
| `[test]` | テスト追加・修正 |
| `[chore]` | 設定・ビルド関連 |
| `[style]` | フォーマット変更 |
| `[perf]` | パフォーマンス改善 |

### 良いコミットメッセージの例
```
[feat] ユーザー認証機能を追加

- ログイン/ログアウト機能
- セッション管理
- パスワードリセット機能

関連Issue: #45
```

### 悪いコミットメッセージの例
```
修正
update
fix bug
WIP
```

## プルリクエスト

### PRテンプレート
```markdown
## 概要
この変更で何を実現するか

## 変更内容
- 変更点1
- 変更点2

## テスト方法
1. 手順1
2. 手順2

## スクリーンショット（UIの変更がある場合）

## チェックリスト
- [ ] テストを追加/更新した
- [ ] ドキュメントを更新した
- [ ] レビューを依頼した
```

### PRのサイズ
- **小さく保つ** - 理想は200行以下
- 大きな変更は複数のPRに分割
- 関連しない変更は別PRに

## GitHub CLI コマンド

### 基本操作
```bash
# リポジトリ作成
gh repo create プロジェクト名 --public --clone

# PR作成
gh pr create --title "タイトル" --body "説明"

# PR一覧
gh pr list

# PRをマージ
gh pr merge 番号 --merge

# Issue作成
gh issue create --title "タイトル" --body "説明"

# Issue一覧
gh issue list
```

### ワークフロー例
```bash
# 1. 機能ブランチ作成
git checkout -b feature/new-feature

# 2. 変更をコミット
git add .
git commit -m "[feat] 新機能を追加"

# 3. プッシュ
git push -u origin feature/new-feature

# 4. PR作成
gh pr create --title "[feat] 新機能を追加" --body "## 概要\n新機能の説明"

# 5. レビュー後マージ
gh pr merge --merge
```

## 禁止事項
- `main` / `master` への直接プッシュ
- `force push`（履歴の改ざん）
- 機密情報のコミット
- 巨大なバイナリファイルのコミット

## .gitignore 必須項目
```
# 環境変数
.env
.env.*

# 依存関係
node_modules/
__pycache__/
venv/

# ビルド成果物
dist/
build/
*.egg-info/

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# 機密情報
*.pem
*.key
credentials.json
```
