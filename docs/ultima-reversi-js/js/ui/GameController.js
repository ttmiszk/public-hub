/**
 * GameController - ゲーム進行制御
 * 
 * ゲームの進行、ターン管理、勝敗判定を制御する。
 */
var UltimaReversi = UltimaReversi || {};

/**
 * ゲーム状態
 */
UltimaReversi.GameState = Object.freeze({
    WAITING: 'waiting',     // 開始待ち
    PLAYING: 'playing',     // プレイ中
    THINKING: 'thinking',   // AI思考中
    GAME_OVER: 'gameover'   // ゲーム終了
});

/**
 * ゲームコントローラークラス
 */
UltimaReversi.GameController = (function () {
    var Cell = UltimaReversi.Cell;
    var GameState = UltimaReversi.GameState;

    /** アニメーション関連の定数 */
    var ANIMATION = {
        NORMAL_DELAY: 600,          // 通常のアニメーション待機時間
        REVOLUTION_START_DELAY: 600, // 革命演出開始までの待機時間 （NORMAL_DELAYと同じタイミング）
        REVOLUTION_DURATION: 300,    // 革命反転アニメーションの時間 (CSSフリップ時間)
        REVOLUTION_TOTAL_WAIT: 1400  // 革命時の次ターンまでの合計待機時間
    };



    /**
     * コンストラクタ
     * @param {Board} board - 盤面
     * @param {BoardView} boardView - 盤面ビュー
     * @param {Player} blackPlayer - 黒プレイヤー
     * @param {Player} whitePlayer - 白プレイヤー
     * @param {Object} elements - DOM要素群
     */
    function GameController(board, boardView, blackPlayer, whitePlayer, elements, soundManager) {
        this._board = board;
        this._boardView = boardView;
        this._blackPlayer = blackPlayer;
        this._whitePlayer = whitePlayer;
        this._elements = elements;
        this._soundManager = soundManager || null;
        this._state = GameState.WAITING;
        this._timerIds = []; // タイムアウトID管理用

        this._setupEventHandlers();
    }

    /**
     * タイムアウトを登録して実行
     * @param {Function} callback 
     * @param {number} delay 
     */
    GameController.prototype._registerTimeout = function (callback, delay) {
        var self = this;
        var id = setTimeout(function () {
            // 実行時にリストから削除
            var index = self._timerIds.indexOf(id);
            if (index !== -1) {
                self._timerIds.splice(index, 1);
            }
            callback();
        }, delay);
        this._timerIds.push(id);
        return id;
    };

    /**
     * 全てのタイムアウトをクリア
     */
    GameController.prototype._clearAllTimeouts = function () {
        for (var i = 0; i < this._timerIds.length; i++) {
            clearTimeout(this._timerIds[i]);
        }
        this._timerIds = [];
    };

    /**
     * ゲームを強制終了（中断）
     */
    GameController.prototype.abort = function () {
        // タイマー停止
        this._clearAllTimeouts();

        // AI思考停止
        if (this._blackPlayer.isAI()) this._blackPlayer.stopThinking();
        if (this._whitePlayer.isAI()) this._whitePlayer.stopThinking();

        this._state = GameState.WAITING;
    };

    /**
     * イベントハンドラを設定
     */
    GameController.prototype._setupEventHandlers = function () {
        var self = this;
        this._boardView.setOnCellClick(function (x, y) {
            self._handleCellClick(x, y);
        });
    };

    /**
     * ゲーム開始
     */
    GameController.prototype.start = function () {
        // 前のタイマーがあればクリア
        this._clearAllTimeouts();

        this._state = GameState.PLAYING;
        // オーバーレイメッセージを非表示
        this._elements.overlayMessage.classList.remove('active');
        this._updateUI();
        this._processTurn();
    };

    /**
     * 現在のプレイヤーを取得
     */
    GameController.prototype._getCurrentPlayer = function () {
        return (this._board.getTurn() === Cell.BLACK)
            ? this._blackPlayer
            : this._whitePlayer;
    };

    /**
     * ターン処理
     */
    GameController.prototype._processTurn = function () {
        var currentPlayer;

        if (this._state === GameState.GAME_OVER) return;

        // ゲーム終了判定
        if (this._board.isGameOver()) {
            this._handleGameOver();
            return;
        }

        currentPlayer = this._getCurrentPlayer();

        // 打てる手がない場合はパス
        if (!this._board.hasValidMove()) {
            this._handlePass();
            return;
        }

        // AIプレイヤーの場合は自動で思考
        if (currentPlayer.isAI()) {
            this._processAITurn(currentPlayer);
        }
        // 人間プレイヤーの場合はクリックを待つ
    };

    /**
     * AIターンの処理
     */
    GameController.prototype._processAITurn = function (aiPlayer) {
        var self = this;
        var isBlack = (this._board.getTurn() === Cell.BLACK);
        var progressBar = isBlack ? this._elements.blackProgress : this._elements.whiteProgress;

        this._state = GameState.THINKING;
        this._updateUI();

        // 進捗バーをリセット (チラツキ防止: トランジションを無効化して即時リセット)
        if (progressBar) {
            progressBar.style.transition = 'none';
            progressBar.style.width = '0%';
            void progressBar.offsetHeight; // Force reflow
            progressBar.style.transition = ''; // Restore transition
        }

        // 進捗コールバック
        var onProgress = function (progress) {
            if (progressBar) {
                // 0.0 ~ 1.0 -> 0% ~ 100%
                progressBar.style.width = Math.floor(progress * 100) + '%';
            }
        };

        // AI思考（コールバック形式）
        aiPlayer.think(this._board, function (move) {
            // 思考完了時（または中断時）に進捗バーを満タンにし、表示を維持する
            if (progressBar && self._state === GameState.THINKING) {
                progressBar.style.width = '100%';
                // アニメーション中も表示し続けるためのクラスを追加
                var playerInfo = isBlack ? self._elements.blackInfo : self._elements.whiteInfo;
                playerInfo.classList.add('thinking-done');
            }

            if (move && self._state === GameState.THINKING) {
                self._makeMove(move.x, move.y);
            }
        }, onProgress);
    };

    /**
     * セルクリック処理
     */
    GameController.prototype._handleCellClick = function (x, y) {
        var currentPlayer;

        // プレイ中でなければ無視
        if (this._state !== GameState.PLAYING) return;

        // 人間プレイヤーの手番でなければ無視
        currentPlayer = this._getCurrentPlayer();
        if (!currentPlayer.isHuman()) return;

        // 打てる場所でなければ無視
        if (!this._board.check(x, y)) return;

        // 着手ログ出力（PlayerHuman側で処理）
        if (currentPlayer.onMove) {
            currentPlayer.onMove(this._board, x, y);
        }

        // 手を打つ
        this._makeMove(x, y);
    };


    /**
     * 手を打つ
     */
    GameController.prototype._makeMove = function (x, y) {
        // 1. BoardLogic実行（内部状態更新）
        this._board.move(x, y);

        // 2. 革命反転情報の取得
        var revolutionFlips = this._board.getLastRevolutionFlips();
        var hasRevolution = (revolutionFlips && revolutionFlips.length > 0);

        // 3. 描画更新（革命時は一時的に隠蔽）
        this._updateViewForRevolution(hasRevolution, revolutionFlips);

        // 4. 着手アニメーションとサウンド
        this._boardView.animatePlacement(x, y);
        this._playMoveSound(x, y);

        // 5. ログ出力とUI更新
        console.log('[棋譜] ' + this._board.getHistoryString());
        this._state = GameState.PLAYING;
        this._updateUI();

        // 6. アニメーション待機と次ターンのスケジュール
        if (hasRevolution) {
            this._scheduleRevolutionEffect(revolutionFlips);
        } else {
            this._scheduleNextTurn(ANIMATION.NORMAL_DELAY);
        }
    };

    /**
     * 描画更新（革命時は変化を一時的に隠蔽する）
     */
    GameController.prototype._updateViewForRevolution = function (hasRevolution, revolutionFlips) {
        // まず最新状態を描画
        this._boardView.render();

        if (hasRevolution) {
            // 革命で変わった石だけ、強制的にDOMクラスを操作して「変わっていない」ように見せる
            // （アニメーションでめくれるまで変化を隠す）
            for (var i = 0; i < revolutionFlips.length; i++) {
                var pos = revolutionFlips[i];
                var rx = this._board.toX(pos);
                var ry = this._board.toY(pos);

                var cell = this._elements.boardElement.querySelector('.cell[data-x="' + rx + '"][data-y="' + ry + '"]');

                if (cell) {
                    var stone = cell.querySelector('.stone');
                    if (stone) {
                        // アニメーションクラスを即削除
                        stone.classList.remove('flipping', 'placed');

                        var isBlackNow = stone.classList.contains('black');
                        var isWhiteNow = stone.classList.contains('white');

                        // 色を反転（元に戻す＝隠蔽）
                        if (isBlackNow) {
                            stone.classList.remove('black');
                            stone.classList.add('white');
                        } else if (isWhiteNow) {
                            stone.classList.remove('white');
                            stone.classList.add('black');
                        }
                    }
                }
            }
        }
    };

    /**
     * 着手音を再生
     */
    GameController.prototype._playMoveSound = function (x, y) {
        if (!this._soundManager) return;

        var size = this._board.getSize();
        if ((x === 1 || x === size) && (y === 1 || y === size)) {
            this._soundManager.playPutStoneCorner();
        } else {
            this._soundManager.playPutStone();
        }
    };

    /**
     * 革命演出のスケジュール
     */
    GameController.prototype._scheduleRevolutionEffect = function (revolutionFlips) {
        var self = this;

        // 遅延実行：革命演出
        this._registerTimeout(function () {
            self._playRevolutionEffect(revolutionFlips);
        }, ANIMATION.REVOLUTION_START_DELAY);

        // 次ターンへ
        this._scheduleNextTurn(ANIMATION.REVOLUTION_TOTAL_WAIT);
    };

    /**
     * 革命演出の実行（隠蔽解除とアニメーション）
     */
    GameController.prototype._playRevolutionEffect = function (revolutionFlips) {
        // 音
        if (this._soundManager) this._soundManager.playRevolution();

        // 画面全体を振動させる
        var container = document.querySelector('.app-container');
        if (container) {
            container.classList.remove('shake-screen');
            void container.offsetWidth; // Force reflow
            container.classList.add('shake-screen');
            setTimeout(function () {
                container.classList.remove('shake-screen');
            }, 500); // 0.4s + buffer
        }

        // アニメーション（隠蔽を解除して正しい色にする）
        for (var i = 0; i < revolutionFlips.length; i++) {
            var pos = revolutionFlips[i];
            var rx = this._board.toX(pos);
            var ry = this._board.toY(pos);
            var cell = this._elements.boardElement.querySelector('.cell[data-x="' + rx + '"][data-y="' + ry + '"]');

            if (cell) {
                var stone = cell.querySelector('.stone');
                if (stone) {
                    // 正しい色（Boardの状態）を取得
                    var expectedColor = this._board.getCell(rx, ry);

                    // アニメーション用クラス適用
                    // 既存のクラス・スタイルをクリーンアップ
                    stone.removeAttribute('style');
                    stone.classList.remove('black', 'white', 'flipping', 'placed');

                    // アニメーションクラス付与 (.flipping-scale)
                    if (expectedColor === UltimaReversi.Cell.BLACK) {
                        stone.classList.add('black', 'flipping-scale');
                    } else if (expectedColor === UltimaReversi.Cell.WHITE) {
                        stone.classList.add('white', 'flipping-scale');
                    }

                    // CSSアニメーション完了後の後始末
                    (function (s) {
                        setTimeout(function () {
                            s.classList.remove('flipping-scale');
                        }, ANIMATION.REVOLUTION_DURATION);
                    })(stone);
                }
            }
        }
    };

    /**
     * 次のターンをスケジュール
     */
    GameController.prototype._scheduleNextTurn = function (delay) {
        var self = this;
        this._registerTimeout(function () {
            // 進捗表示クリーンアップ
            self._elements.blackInfo.classList.remove('thinking-done');
            self._elements.whiteInfo.classList.remove('thinking-done');
            if (self._elements.blackProgress) self._elements.blackProgress.style.width = '0%';
            if (self._elements.whiteProgress) self._elements.whiteProgress.style.width = '0%';

            self._processTurn();
        }, delay);
    };

    /**
     * パス処理（打てる手がない場合に自動呼び出し）
     */
    GameController.prototype._handlePass = function () {
        var self = this;
        var colorName = (this._board.getTurn() === Cell.BLACK) ? 'Black' : 'White';

        // パスメッセージを表示
        this._elements.overlayMessageText.classList.remove('msg-result');
        this._elements.overlayMessageText.classList.add('msg-pass');
        this._elements.overlayMessageText.textContent = colorName + ' Passes';
        this._elements.overlayMessage.classList.add('active');

        if (this._soundManager) {
            this._soundManager.playPass();
        }

        // 手番を変更
        this._board.changeTurn();

        // 1秒後に通知を非表示にして次のターンへ
        // 1秒後に通知を非表示にして次のターンへ
        this._registerTimeout(function () {
            self._elements.overlayMessage.classList.remove('active');

            // オーバーレイのフェードアウトを待ってから盤面更新・次ターンへ
            self._registerTimeout(function () {
                self._boardView.render();
                self._updateUI();
                self._processTurn();
            }, 300);
        }, 1000);
    };

    /**
     * ゲーム終了処理
     */
    GameController.prototype._handleGameOver = function () {
        var counts = this._board.countStones();
        var resultMessage;

        this._state = GameState.GAME_OVER;

        var Rule = UltimaReversi.Rule;
        var rule = this._board.getRule();
        var isNegative = (rule === Rule.NEGATIVE);

        if (counts.black > counts.white) {
            resultMessage = isNegative ? 'White wins! (weakest)' : 'Black wins!';
        } else if (counts.white > counts.black) {
            resultMessage = isNegative ? 'Black wins! (weakest)' : 'White wins!';
        } else {
            resultMessage = 'Draw!';
        }

        if (this._soundManager) {
            // 音声再生ロジック
            var isHvC = (this._blackPlayer.isHuman() && this._whitePlayer.isAI()) ||
                (this._blackPlayer.isAI() && this._whitePlayer.isHuman());

            var humanWon = false;
            var humanLost = false;

            if (isHvC) {
                if (this._blackPlayer.isHuman()) {
                    if (counts.black > counts.white) humanWon = true;
                    else if (counts.black < counts.white) humanLost = true;
                } else { // White is human
                    if (counts.white > counts.black) humanWon = true;
                    else if (counts.white < counts.black) humanLost = true;
                }
            }

            if (humanWon) {
                this._soundManager.playGameEndClap();
            } else if (humanLost) {
                this._soundManager.playGameEndAaah();
            } else {
                this._soundManager.playGameEndBell();
            }
        }

        // ゲーム結果をオーバーレイで表示（永続表示）
        this._elements.overlayMessageText.classList.remove('msg-pass');
        this._elements.overlayMessageText.classList.add('msg-result');
        this._elements.overlayMessageText.textContent = resultMessage;
        this._elements.overlayMessage.classList.add('active');

        // クリックで非表示にするイベントリスナーを追加（1回だけ実行）
        var self = this;
        var hideOverlay = function () {
            self._elements.overlayMessage.classList.remove('active');
            self._elements.overlayMessage.removeEventListener('click', hideOverlay);
        };
        this._elements.overlayMessage.addEventListener('click', hideOverlay);

        // アクティブ表示をクリア
        this._elements.blackInfo.classList.remove('active', 'thinking');
        this._elements.whiteInfo.classList.remove('active', 'thinking');

        this._updateUI();
    };

    /**
     * UIを更新
     */
    GameController.prototype._updateUI = function () {
        var counts = this._board.countStones();
        var isBlackTurn = (this._board.getTurn() === Cell.BLACK);
        var currentPlayer = this._getCurrentPlayer();

        // 石数を更新
        this._elements.blackCount.textContent = counts.black;
        this._elements.whiteCount.textContent = counts.white;

        // プレイヤー名を更新
        this._elements.blackName.textContent = this._blackPlayer.getName();
        this._elements.whiteName.textContent = this._whitePlayer.getName();

        // アクティブプレイヤーの視覚的強調
        if (this._state === GameState.PLAYING || this._state === GameState.THINKING) {
            // アクティブ状態をリセット
            this._elements.blackInfo.classList.remove('active', 'thinking');
            this._elements.whiteInfo.classList.remove('active', 'thinking');

            // 盤面の思考中クラスを制御
            if (this._state === GameState.THINKING) {
                this._elements.boardElement.classList.add('thinking');
            } else {
                this._elements.boardElement.classList.remove('thinking');
            }

            if (isBlackTurn) {
                this._elements.blackInfo.classList.add('active');
                if (this._state === GameState.THINKING) {
                    this._elements.blackInfo.classList.add('thinking');
                }
            } else {
                this._elements.whiteInfo.classList.add('active');
                if (this._state === GameState.THINKING) {
                    this._elements.whiteInfo.classList.add('thinking');
                }
            }
        } else {
            // PLAYING/THINKING以外 (WAITING, GAME_OVER) はプログレスバーをリセット
            if (this._elements.blackProgress) this._elements.blackProgress.style.width = '0%';
            if (this._elements.whiteProgress) this._elements.whiteProgress.style.width = '0%';
            this._elements.boardElement.classList.remove('thinking');
        }

        // 待ったボタンの有効/無効
        // 人間プレイヤーの手番で、かつ履歴がある場合のみ有効
        this._elements.btnUndo.disabled =
            this._state !== GameState.PLAYING ||
            this._state !== GameState.PLAYING ||
            !currentPlayer.isHuman() ||
            !this._board.canUndo();

        // ルール表示の更新
        this._updateRuleDisplay();
    };

    /**
     * 現在のルールをヘッダーに表示
     */
    GameController.prototype._updateRuleDisplay = function () {
        var Rule = UltimaReversi.Rule;
        var rule = this._board.getRule();
        var text = "";

        switch (rule) {
            case Rule.HANDY1: text = "Rule: Handicap (1)"; break;
            case Rule.HANDY2: text = "Rule: Handicap (2)"; break;
            case Rule.HANDY3: text = "Rule: Handicap (3)"; break;
            case Rule.HANDY4: text = "Rule: Handicap (4)"; break;
            case Rule.NEGATIVE: text = "Rule: Variant (Negative)"; break;
            case Rule.REVOLUTION: text = "Rule: Variant (Revolution)"; break;
            case Rule.NORMAL:
            default: text = ""; break;
        }

        if (this._elements.ruleDisplay) {
            this._elements.ruleDisplay.textContent = text;
        }
    };

    /**
     * 待った（自分の直前の手まで戻す）
     * 相手がAIの場合は2手戻す（自分→相手→自分の番に戻る）
     */
    GameController.prototype.undo = function () {
        var currentPlayer, opponentPlayer;
        var undoCount = 0;

        if (this._state !== GameState.PLAYING && this._state !== GameState.GAME_OVER) {
            return;
        }

        currentPlayer = this._getCurrentPlayer();
        opponentPlayer = (this._board.getTurn() === Cell.BLACK)
            ? this._whitePlayer
            : this._blackPlayer;

        // まず1手戻す
        if (!this._board.undo()) {
            return; // 履歴がなければ何もしない
        }
        undoCount++;

        // 相手がAIの場合は、もう1手戻す（自分の手番に戻す）
        if (opponentPlayer.isAI() && this._board.undo()) {
            undoCount++;
        }

        this._state = GameState.PLAYING;
        // オーバーレイメッセージを非表示
        this._elements.overlayMessage.classList.remove('active');
        this._boardView.render();
        this._updateUI();

        if (this._soundManager && undoCount > 0) {
            this._soundManager.playUndo();
        }
    };

    /**
     * 新規ゲーム時に確認が必要かどうか
     * ゲーム中（終了前）かつ1手以上打たれている場合にtrue
     */
    GameController.prototype.needsConfirmation = function () {
        return this._state !== GameState.GAME_OVER &&
            this._state !== GameState.WAITING &&
            this._board.getMoveCount() > 0;
    };

    return GameController;
})();
