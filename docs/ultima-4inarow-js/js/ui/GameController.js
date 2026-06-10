/**
 * GameController - ゲーム進行管理
 */
var Ultima4InARow = Ultima4InARow || {};

Ultima4InARow.GameController = (function () {
    var Cell = Ultima4InARow.Cell;
    var Board = Ultima4InARow.Board;

    function GameController(board, boardView, p1, p2, elements, soundManager) {
        this.board = board;
        this.boardView = boardView;
        this.p1 = p1;
        this.p2 = p2;
        this.elements = elements;
        this.soundManager = soundManager;

        this.isThinking = false;
        this.timer = null;
        this.wins = { p1: 0, p2: 0 };

        // イベント紐付け
        var self = this;
        this.boardView.onCellClick = function (col) {
            self.onHumanMove(col);
        };

        this._updatePlayerInfo();
        this._updateScore(); // Init score
    }

    GameController.prototype.start = function (firstTurn) {
        if (this.animationTimeout) clearTimeout(this.animationTimeout);
        this.board.init(firstTurn);
        this.boardView.render();
        this.boardView.setInteractive(false); // 安全のためリセット

        // オーバーレイを非表示にリセット
        this.elements.overlayMessage.classList.remove('active');


        // Humanの場合はプログレスバーを隠す
        this.elements.p1Progress.parentElement.style.display = this.p1.isAI() ? 'block' : 'none';
        this.elements.p2Progress.parentElement.style.display = this.p2.isAI() ? 'block' : 'none';

        this._updateUI();
        this._checkNextTurn();
    };

    GameController.prototype.abort = function () {
        this.boardView.setInteractive(false);
        if (this.animationTimeout) clearTimeout(this.animationTimeout);
        if (this.isThinking) {
            if (this.p1.isAI()) this.p1.stopThinking();
            if (this.p2.isAI()) this.p2.stopThinking();
            this.isThinking = false;
        }
    };

    GameController.prototype.undo = function () {
        if (this.isThinking) return;
        if (this.board.getStatus() !== Board.STS_RUNNING) return;

        var self = this;

        // Recursive undo function
        function performUndo() {
            self.isThinking = true;

            var pos = self.board.undo();
            if (pos === -1) {
                self.isThinking = false;
                self._updateUI(); // Update button state
                return;
            }

            self.soundManager.play('undo');

            var x = self.board.toX(pos);
            var y = self.board.toY(pos);

            self.boardView.removePieceAnimated(x, y, function () {
                var currentPlayer = (self.board.turn === Cell.PLAYER1) ? self.p1 : self.p2;

                // If current player is AI, undo again to return to Human
                if (currentPlayer.isAI()) {
                    setTimeout(performUndo, 200);
                } else {
                    self.isThinking = false;
                    self._updateUI();
                    self._checkNextTurn(); // Should be Human turn now
                }
            });
        }

        performUndo();
    };

    // 戻り値: Undoが必要か（履歴があるか）
    GameController.prototype.needsConfirmation = function () {
        return this.board.getEmptyCount() < 42; // 最初以外
    };

    GameController.prototype.hasScore = function () {
        return this.wins.p1 > 0 || this.wins.p2 > 0;
    };

    GameController.prototype.resetScore = function () {
        this.wins.p1 = 0;
        this.wins.p2 = 0;
        this._updateScore();
    };

    GameController.prototype.swapPlayers = function () {
        var temp = this.p1;
        this.p1 = this.p2;
        this.p2 = temp;
        this._updatePlayerInfo();
        this._updateScore();
    };

    GameController.prototype.onHumanMove = function (col) {
        if (this.isThinking) return;
        if (this.board.getStatus() !== Board.STS_RUNNING) return;

        var currentPlayer = (this.board.turn === Cell.PLAYER1) ? this.p1 : this.p2;
        if (currentPlayer.isAI()) return; // AIの手番にクリックは無視

        var pos = this.board.checkX(col);
        if (pos === -1) return; // 無効な手

        if (currentPlayer.onMove) {
            currentPlayer.onMove(this.board, col);
        }

        this.boardView.setInteractive(false); // 即座に入力をロック
        this._executeMove(pos);
    };

    GameController.prototype._executeMove = function (pos) {
        var x = this.board.toX(pos);
        var y = this.board.toY(pos);
        var player = this.board.turn;

        // モデル更新
        if (this.board.move(pos)) {
            this.isThinking = true; // アニメーション中は操作/進行をブロック

            // 描画更新
            this.boardView.putPiece(x, y, player, true);
            // this.soundManager.play('move'); // 遅延させて再生

            var self = this;
            // 効果音遅延 (落下アニメーション0.5sに合わせる)
            setTimeout(function () {
                self.soundManager.play('move');
            }, 450);

            // アニメーション完了(CSS 0.5s)を待ってから次へ
            this.animationTimeout = setTimeout(function () {
                self._hideProgress(); // 完了後にプログレスバーを消す

                // UI更新
                self._updateUI();

                // ゲーム終了判定
                var status = self.board.getStatus();
                if (status !== Board.STS_RUNNING) {
                    self.isThinking = false; // ゲーム終了時はロック解除（Undo可能に）
                    self._onGameOver(status);
                } else {
                    self._checkNextTurn();
                }
            }, 600); // 600ms (500ms + バッファ)
        }
    };

    GameController.prototype._checkNextTurn = function () {
        var self = this;
        var currentPlayer = (this.board.turn === Cell.PLAYER1) ? this.p1 : this.p2;

        if (currentPlayer.isAI()) {
            this.boardView.setInteractive(false);
            this.isThinking = true;
            this.elements.btnUndo.disabled = true;
            this._hideProgress(); // ターン開始時に両方リセット

            // 操作対象のプログレスバーを特定（board.turnに依存しないようここで固定）
            var targetBar = (currentPlayer === this.p1) ? this.elements.p1Progress : this.elements.p2Progress;
            targetBar.style.width = "0%";

            // AI思考開始
            currentPlayer.think(this.board, function (bestPos) {
                // Abortされた場合は無視
                // abort() で isThinking = false にされている
                if (!self.isThinking) return;

                self.isThinking = false;
                // 100%表示（即座に消さない）
                targetBar.style.width = "100%";

                if (bestPos !== -1) {
                    self._executeMove(bestPos);
                } else {
                    // 打つ手がない？（Draw判定漏れとかでない限りありえない）
                    console.error("AI returned -1 but game is running");
                }
            }, function (progress) {
                // 進捗更新
                targetBar.style.width = (progress * 100) + "%";
            });
        } else {
            // 人間のターン
            this.isThinking = false;
            this.boardView.setInteractive(true);
            // Undoボタン有効化（履歴があれば）
            this.elements.btnUndo.disabled = (this.board.getEmptyCount() === 42);
        }
    };

    GameController.prototype._onGameOver = function (status) {
        this.boardView.setInteractive(false);
        this.boardView.highlightWinLine();
        this.elements.btnUndo.disabled = false; // ゲーム終了後もUndo可能にする（振り返り用）

        var msg = "";
        if (status === Board.STS_END_GAME_PLAYER1_WON) {
            msg = this.p1.getName() + " Wins!";
            this.wins.p1++;
            // 効果音ロジック: 人間が負けた場合のみ敗北音
            if (!this.p1.isAI()) this.soundManager.play('win');
            else this.soundManager.play('lose'); // AIが人間に勝利、またはAI同士

            // P1勝利。P2が人間でP1がAIなら人間敗北。
        } else if (status === Board.STS_END_GAME_PLAYER2_WON) {
            msg = this.p2.getName() + " Wins!";
            this.wins.p2++;
            if (!this.p2.isAI()) this.soundManager.play('win');
            else this.soundManager.play('lose');
        } else {
            msg = "Draw Game";
            this.soundManager.play('draw');
        }

        this._showOverlay(msg);
        this._showOverlay(msg);
        this._updateScore(); // Update displayed score
        this._updateUI(); // Ensure Undo button state is updated
    };

    GameController.prototype._updateUI = function () {
        var turn = this.board.turn;

        // アクティブプレイヤーの表示切り替え
        if (turn === Cell.PLAYER1) {
            this.elements.p1Info.classList.add('active');
            this.elements.p2Info.classList.remove('active');
        } else {
            this.elements.p1Info.classList.remove('active');
            this.elements.p2Info.classList.add('active');
        }

        // Undoボタンの状態
        // 以下で無効化: ゲーム終了時 または 現在のプレイヤーがAI
        var currentPlayer = (turn === Cell.PLAYER1) ? this.p1 : this.p2;
        var isRunning = (this.board.getStatus() === Board.STS_RUNNING);
        var canUndo = isRunning && !currentPlayer.isAI() && (this.board.getEmptyCount() < 42);

        if (this.elements.btnUndo) {
            this.elements.btnUndo.disabled = !canUndo;
            if (canUndo) {
                this.elements.btnUndo.classList.remove('disabled');
            } else {
                this.elements.btnUndo.classList.add('disabled');
            }
        }
    };

    GameController.prototype._updatePlayerInfo = function () {
        this.elements.p1Name.textContent = this.p1.getName();
        this.elements.p2Name.textContent = this.p2.getName();
    };

    GameController.prototype._updateScore = function () {
        this.elements.p1Wins.textContent = this.wins.p1;
        this.elements.p2Wins.textContent = this.wins.p2;
    };

    GameController.prototype._showOverlay = function (msg) {
        var el = this.elements.overlayMessage;
        var text = this.elements.overlayMessageText;
        text.textContent = msg;

        // Add animation class (msg-result matches Reversi style)
        text.className = 'overlay-message-text msg-result';

        el.classList.add('active');

        // クリックで非表示
        var hide = function () {
            el.classList.remove('active');
            el.removeEventListener('click', hide);
        };
        el.addEventListener('click', hide);

        // 自動では消えない
    };

    GameController.prototype._hideProgress = function () {
        // チラツキ防止: トランジションを無効化して即時リセット
        var resetBar = function (bar) {
            bar.style.transition = 'none';
            bar.style.width = "0%";
            void bar.offsetHeight; // Force reflow
            bar.style.transition = ''; // Restore transition
        };

        resetBar(this.elements.p1Progress);
        resetBar(this.elements.p2Progress);
    };

    return GameController;
})();
