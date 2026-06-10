/**
 * Ultima Reversi - メインエントリポイント
 * 
 * アプリケーションの初期化とイベントリスナーの登録を行う
 */
(function () {
    'use strict';

    var Board = UltimaReversi.Board;
    var PlayerHuman = UltimaReversi.PlayerHuman;
    var PlayerAI = UltimaReversi.PlayerAI;
    var GameController = UltimaReversi.GameController;
    var BoardView = UltimaReversi.BoardView;
    var SoundManager = UltimaReversi.SoundManager;

    /**
     * アプリケーション状態
     */
    var app = {
        controller: null,
        boardView: null,
        board: null,
        soundManager: null
    };

    /**
     * DOMの参照をまとめて取得
     */
    function getElements() {
        return {
            // ヘッダー情報
            ruleDisplay: document.getElementById('game-rule-display'),
            // 盤面
            boardElement: document.getElementById('board'),
            // 情報パネル
            blackCount: document.getElementById('black-count'),
            whiteCount: document.getElementById('white-count'),
            blackName: document.getElementById('player-black-name'),
            whiteName: document.getElementById('player-white-name'),
            blackInfo: document.getElementById('player-black-info'),
            whiteInfo: document.getElementById('player-white-info'),
            blackProgress: document.getElementById('black-progress'),
            whiteProgress: document.getElementById('white-progress'),
            // コントロール
            btnNewGame: document.getElementById('btn-new-game'),
            btnUndo: document.getElementById('btn-undo'),
            // オーバーレイメッセージ
            overlayMessage: document.getElementById('overlay-message'),
            overlayMessageText: document.getElementById('overlay-message-text'),
            // 確認ダイアログ
            confirmDialog: document.getElementById('confirm-dialog'),
            confirmDialogMessage: document.getElementById('confirm-dialog-message'),
            confirmDialogOk: document.getElementById('confirm-dialog-ok'),
            confirmDialogCancel: document.getElementById('confirm-dialog-cancel'),
            // 設定モーダル
            setupModal: document.getElementById('setup-modal'),
            setupForm: document.getElementById('setup-form'),
            boardSizeSelect: document.getElementById('board-size'),
            blackPlayerSelect: document.getElementById('black-player'),
            blackPlayerSelect: document.getElementById('black-player'),
            whitePlayerSelect: document.getElementById('white-player'),
            ruleSelect: document.getElementById('rule'),
            ruleHelp: document.getElementById('rule-help'),
            ruleModal: document.getElementById('rule-modal'),
            ruleModalClose: document.getElementById('rule-modal-close')
        };
    }

    /**
     * 設定モーダルを表示
     */
    function showSetupModal() {
        var elements = getElements();
        elements.setupModal.classList.add('active');
    }

    /**
     * 設定モーダルを非表示
     */
    function hideSetupModal() {
        var elements = getElements();
        elements.setupModal.classList.remove('active');
    }

    /**
     * 確認ダイアログを表示
     * @param {string} message - 表示メッセージ
     * @param {Function} onConfirm - OKボタン押下時のコールバック
     */
    function showConfirmDialog(message, onConfirm) {
        var elements = getElements();
        var okHandler, cancelHandler;

        elements.confirmDialogMessage.textContent = message;
        elements.confirmDialog.classList.add('active');

        // ハンドラを一度だけ実行するためのクリーンアップ関数
        function cleanup() {
            elements.confirmDialogOk.removeEventListener('click', okHandler);
            elements.confirmDialogCancel.removeEventListener('click', cancelHandler);
            elements.confirmDialog.classList.remove('active');
        }

        okHandler = function () {
            cleanup();
            if (onConfirm) {
                onConfirm();
            }
        };

        cancelHandler = function () {
            cleanup();
        };

        elements.confirmDialogOk.addEventListener('click', okHandler);
        elements.confirmDialogCancel.addEventListener('click', cancelHandler);
    }

    /**
     * プレイヤー選択値からプレイヤーオブジェクトを生成
     */
    function createPlayer(value) {
        var level;
        if (value === 'human') {
            return PlayerHuman.create("Human");
        }
        // AI Lv.X の形式からレベルを抽出
        // value format: "ai-1", "ai-2", ...
        var parts = value.split('-');
        level = parseInt(parts[1], 10);
        return PlayerAI.create('AI Lv.' + level, level);
    }

    /**
     * ゲーム開始処理
     */
    function startGame(settings) {
        var elements = getElements();
        var blackPlayer, whitePlayer;

        // 盤面の初期化
        app.board = new Board(settings.boardSize, settings.rule);

        // プレイヤーの生成
        blackPlayer = createPlayer(settings.blackPlayer);
        whitePlayer = createPlayer(settings.whitePlayer);

        // 音声管理の初期化（シングルトン的運用）
        if (!app.soundManager) {
            app.soundManager = new SoundManager();
        }

        // 盤面ビューの初期化
        app.boardView = new BoardView(elements.boardElement, app.board);

        // ゲームコントローラーの初期化
        app.controller = new GameController(
            app.board,
            app.boardView,
            blackPlayer,
            whitePlayer,
            elements,
            app.soundManager
        );

        // ゲーム開始
        app.controller.start();

        // モーダルを閉じる
        hideSetupModal();
    }

    /**
     * イベントリスナーの登録
     */
    function setupEventListeners() {
        var elements = getElements();

        // 新規ゲームボタン
        elements.btnNewGame.addEventListener('click', function () {
            // ゲーム中かつ履歴がある場合のみ確認ダイアログを表示
            if (app.controller && app.controller.needsConfirmation()) {
                showConfirmDialog("Current game is in progress. Start next game?", function () {
                    // バックグラウンドのゲーム進行を停止
                    if (app.controller) {
                        app.controller.abort();
                    }
                    showSetupModal();
                });
            } else {
                showSetupModal();
            }
        });

        // 待ったボタン
        elements.btnUndo.addEventListener('click', function () {
            if (app.controller) {
                app.controller.undo();
            }
        });

        // ルール説明モーダルの言語切り替え
        setupRuleModalEvents();

        // アプリ情報ボタン
        document.getElementById('info-button').addEventListener('click', function () {
            document.getElementById('app-info-modal').classList.add('active');
        });

        // アプリ情報モーダル閉じるボタン
        document.getElementById('app-info-close').addEventListener('click', function () {
            document.getElementById('app-info-modal').classList.remove('active');
        });

        // ルールヘルプボタン
        elements.ruleHelp.addEventListener('click', function () {
            elements.ruleModal.classList.add('active');
        });

        // ルール説明モーダル閉じるボタン
        elements.ruleModalClose.addEventListener('click', function () {
            elements.ruleModal.classList.remove('active');
        });

        // 設定フォーム送信
        elements.setupForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var settings;

            /**
             * ルール文字列を定数値に変換
             */
            function parseRule(value) {
                var Rule = UltimaReversi.Rule;
                switch (value) {
                    case 'normal': return Rule.NORMAL;
                    case 'handicap-1': return Rule.HANDY1;
                    case 'handicap-2': return Rule.HANDY2;
                    case 'handicap-3': return Rule.HANDY3;
                    case 'handicap-4': return Rule.HANDY4;
                    case 'negative': return Rule.NEGATIVE;
                    case 'revolution': return Rule.REVOLUTION;
                    default: return Rule.NORMAL;
                }
            }

            settings = {
                boardSize: parseInt(elements.boardSizeSelect.value, 10),
                blackPlayer: elements.blackPlayerSelect.value,
                whitePlayer: elements.whitePlayerSelect.value,
                rule: parseRule(elements.ruleSelect.value)
            };

            startGame(settings);
        });

        // テーマ切り替え
        var themeRadios = elements.setupForm.querySelectorAll('input[name="theme"]');
        themeRadios.forEach(function (radio) {
            radio.addEventListener('change', function () {
                document.body.setAttribute('data-theme', this.value);
            });
        });
    }

    /**
     * ルール説明モーダルのイベント設定
     */
    function setupRuleModalEvents() {
        var langBtns = document.querySelectorAll('.lang-btn');
        langBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var lang = this.getAttribute('data-lang'); // 'en' or 'jp'

                // ボタンの見た目更新
                langBtns.forEach(function (b) {
                    b.classList.remove('active');
                });
                this.classList.add('active');

                // コンテンツの表示切り替え
                var descriptions = document.querySelectorAll('.rule-description');
                descriptions.forEach(function (desc) {
                    desc.style.display = 'none';
                });
                var target = document.querySelector('.rule-description.lang-' + lang);
                if (target) {
                    target.style.display = 'block';
                }

                // タイトルの切り替え（英語/日本語）
                var title = document.getElementById('rule-modal-title');
                if (title) {
                    var text = (lang === 'jp') ? title.getAttribute('data-jp') : title.getAttribute('data-en');
                    if (text) {
                        title.textContent = text;
                    }
                }
            });
        });
    }

    /**
     * アプリケーション初期化
     */
    function init() {
        var elements = getElements();
        elements.btnUndo.disabled = true;

        setupEventListeners();
        // 初回起動時は設定モーダルを表示
        showSetupModal();
    }

    // DOMContentLoaded時に初期化
    document.addEventListener('DOMContentLoaded', init);
})();
