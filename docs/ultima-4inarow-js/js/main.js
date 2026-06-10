/**
 * メインエントリーポイント
 */
(function () {
    'use strict';

    var Board = Ultima4InARow.Board;
    var PlayerHuman = Ultima4InARow.PlayerHuman;
    var PlayerAI = Ultima4InARow.PlayerAI;
    var GameController = Ultima4InARow.GameController;
    var BoardView = Ultima4InARow.BoardView;
    var SoundManager = Ultima4InARow.SoundManager;

    var app = {
        controller: null,
        boardView: null,
        board: null,
        soundManager: null,
        shouldAlternate: true
    };

    function getElements() {
        return {
            board: document.getElementById('board'),
            p1Info: document.getElementById('player-1-info'),
            p2Info: document.getElementById('player-2-info'),
            p1Name: document.getElementById('player-1-name'),
            p2Name: document.getElementById('player-2-name'),
            p1Progress: document.getElementById('p1-progress'),
            p2Progress: document.getElementById('p2-progress'),
            p1Wins: document.getElementById('p1-wins'),
            p2Wins: document.getElementById('p2-wins'),
            overlayMessage: document.getElementById('overlay-message'),
            overlayMessageText: document.getElementById('overlay-message-text'),
            btnNextGame: document.getElementById('btn-next-game'),
            btnUndo: document.getElementById('btn-undo'),
            btnQuit: document.getElementById('btn-quit'),
            confirmDialog: document.getElementById('confirm-dialog'),
            confirmDialogMessage: document.getElementById('confirm-dialog-message'),
            confirmDialogOk: document.getElementById('confirm-dialog-ok'),
            confirmDialogCancel: document.getElementById('confirm-dialog-cancel'),
            setupModal: document.getElementById('setup-modal'),
            setupForm: document.getElementById('setup-form'),
            p1Select: document.getElementById('p1-select'),
            p2Select: document.getElementById('p2-select'),
            alternateFirst: document.getElementById('alternate-first'),
            infoButton: document.getElementById('info-button'),
            appInfoModal: document.getElementById('app-info-modal'),
            appInfoClose: document.getElementById('app-info-close')
        };
    }

    function createPlayer(typeVal, defaultName) {
        if (typeVal === 'human') {
            return PlayerHuman.create(defaultName);
        } else if (typeVal.startsWith('ai-')) {
            var level = parseInt(typeVal.split('-')[1], 10);
            return PlayerAI.create("AI Lv." + level, level);
        }
        return PlayerHuman.create(defaultName);
    }

    function showSetupModal() {
        console.log('showSetupModal called');
        var el = getElements().setupModal;
        if (el) {
            el.classList.add('active');
            console.log('Added active class to setup-modal', el.classList);
        } else {
            console.error('setup-modal not found');
        }
    }

    function hideSetupModal() {
        getElements().setupModal.classList.remove('active');
    }

    function startGame(p1Type, p2Type, alternate) {
        var elements = getElements();
        app.shouldAlternate = alternate;

        var p1 = createPlayer(p1Type, "Player 1");
        var p2 = createPlayer(p2Type, "Player 2");

        if (!app.board) app.board = new Board();
        if (!app.soundManager) app.soundManager = new SoundManager();
        if (!app.boardView) app.boardView = new BoardView(elements.board, app.board);

        // パラメータ変更に伴いコントローラーを再生成
        if (!app.controller) {
            app.controller = new GameController(app.board, app.boardView, p1, p2, elements, app.soundManager);
        } else {
            // プレイヤー更新
            app.controller.p1 = p1;
            app.controller.p2 = p2;
            app.controller._updatePlayerInfo();
            // 勝数は維持
        }

        // 先攻プレイヤーの初期化
        app.nextFirstPlayer = Ultima4InARow.Cell.PLAYER1;

        app.controller.start(app.nextFirstPlayer);
        hideSetupModal();
    }

    function showConfirmDialog(msg, onOk) {
        var el = getElements();
        el.confirmDialogMessage.textContent = msg;
        el.confirmDialog.classList.add('active');

        var close = function () {
            el.confirmDialog.classList.remove('active');
            el.confirmDialogOk.onclick = null;
            el.confirmDialogCancel.onclick = null;
        };

        el.confirmDialogOk.onclick = function () {
            close();
            onOk();
        };
        el.confirmDialogCancel.onclick = close;
    }

    function init() {
        console.log('init called');
        var elements = getElements();

        // 設定フォーム
        elements.setupForm.addEventListener('submit', function (e) {
            e.preventDefault();
            startGame(elements.p1Select.value, elements.p2Select.value, elements.alternateFirst.checked);
        });

        // テーマ切り替え
        var themeRadios = elements.setupForm.querySelectorAll('input[name="theme"]');
        themeRadios.forEach(function (radio) {
            radio.addEventListener('change', function () {
                document.body.setAttribute('data-theme', this.value);
            });
        });

        // 「次のゲーム」ボタン
        elements.btnNextGame.addEventListener('click', function () {
            if (app.controller) {
                var boardStatus = app.controller.board.getStatus();
                var isRunning = (boardStatus === Board.STS_RUNNING);
                var moves = 42 - app.controller.board.getEmptyCount();
                var needsConfirm = isRunning && (moves > 0);

                var startNext = function () {
                    app.controller.abort();

                    if (app.shouldAlternate) {
                        var Cell = Ultima4InARow.Cell;
                        app.nextFirstPlayer = (app.nextFirstPlayer === Cell.PLAYER1) ? Cell.PLAYER2 : Cell.PLAYER1;
                    } else {
                        app.nextFirstPlayer = Ultima4InARow.Cell.PLAYER1;
                    }

                    app.controller.start(app.nextFirstPlayer);
                };

                if (needsConfirm) {
                    showConfirmDialog("Current game is in progress. Start next game?", startNext);
                } else {
                    startNext();
                }
            } else {
                showSetupModal();
            }
        });

        // 「やめる」ボタン
        elements.btnQuit.addEventListener('click', function () {
            var needConfirm = false;

            if (app.controller) {
                // ゲーム進行中またはスコアがあるか確認
                if (app.controller.needsConfirmation() || app.controller.hasScore()) {
                    needConfirm = true;
                }
            }

            if (needConfirm) {
                showConfirmDialog("Current game is in progress. Return to setup?", function () {
                    if (app.controller) {
                        app.controller.abort();
                        app.controller.resetScore();
                    }
                    showSetupModal();
                });
            } else {
                showSetupModal();
            }
        });

        // Undoボタン
        elements.btnUndo.addEventListener('click', function () {
            if (app.controller) app.controller.undo();
        });

        // 情報モーダル
        elements.infoButton.addEventListener('click', function () {
            elements.appInfoModal.classList.add('active');
        });
        elements.appInfoClose.addEventListener('click', function () {
            elements.appInfoModal.classList.remove('active');
        });

        // 初期化
        setTimeout(showSetupModal, 100);
    }

    document.addEventListener('DOMContentLoaded', init);

})();
