# Ultima Reversi - Browser Edition

**Version 0.2.0**

ブラウザで動作するサーバレスのオセロ（リバーシ）ゲームです。

## 概要

Android／UWP版「Ultima Reversi」のゲームロジック（盤面操作・AI思考ルーチン）を移植した、HTML/CSS/JavaScriptのみで構成されるブラウザアプリケーションです。

### 特徴
- サーバレス（ローカルファイルとして直接ブラウザで実行可能）
- レスポンシブレイアウト (PC/Mobile)
- ゲーム機能:
	- 盤面サイズ：4x4〜8x8に対応
    - 1人プレイ、2人プレイ、AI対戦の観戦に対応。
	- Alpha-Beta法（Move Ordering対応）を用いた10段階のレベル設定。
	- ルール設定：ハンデ戦（1〜4子局）、変則ルール（革命・最弱）に対応
	- AI思考中の進捗表示機能

## 遊び方

1. `index.html` をブラウザで開きます。
2. ゲーム設定（盤面サイズ、対戦相手、ルール）を選択し、ゲームを開始します。

## 動作環境

- モダンブラウザ（Chrome、Firefox、Edge、Safari の最新版）
- JavaScript有効

## 技術スタック

- **Frontend**: HTML5, CSS3 (Vanilla CSS), JavaScript (Vanilla JS, ES6+)
- **Logic**: C#版から移植された堅牢なゲームエンジン

## プロジェクト構造

```
ultima-reversi-js/
├── css/
│   └── style.css
├── js/
│   ├── main.js
│   ├── model/
│   │   ├── Board.js
│   │   ├── Player.js
│   │   ├── PlayerAI.js
│   │   └── PlayerHuman.js
│   └── ui/
│      ├── BoardView.js
│      ├── GameController.js
│      └── SoundManager.js
├── LICENSE
├── index.html
└── README.md
```

## ライセンス

MIT License

## 開発履歴

- **2026-02-07**: Version 0.2.0
	- 変則ルール（革命・最弱）、ハンデ戦対応、
	- UI/UX強化
	- 不具合修正
- **2026-02-05**: Version 0.1.0
	- AI強化
	- サウンド実装
	- UI刷新
- **2026-02-05**: Version 0.0.1
	- 必要最小構成（MVP）リリース
