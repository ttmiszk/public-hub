/**
 * BoardView - 盤面表示クラス
 */
var Ultima4InARow = Ultima4InARow || {};

Ultima4InARow.BoardView = (function () {
    var Cell = Ultima4InARow.Cell;
    var Board = Ultima4InARow.Board;

    function BoardView(element, board) {
        this.element = element;
        this.board = board;
        this.isInteractive = false;
        this.activeColumn = -1;
        this.isPointerDown = false;

        this.init();
    }

    BoardView.prototype.init = function () {
        this.element.innerHTML = '';
        this.cells = [];

        var sizeX = Board.SIZE_X;
        var sizeY = Board.SIZE_Y;
        var self = this;

        // グリッド作成 (7x6 = 42)
        for (var y = 0; y < sizeY; y++) {
            for (var x = 0; x < sizeX; x++) {
                var cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                // 上の行ほど手前に表示するようにZ-Indexを設定 (落下アニメーションで後ろを通すため)
                cell.style.zIndex = (sizeY - y) * 10;
                this.element.appendChild(cell);
                this.cells.push(cell);
            }
        }

        // Pointer Events (Drag-to-Select)
        this.element.addEventListener('pointerdown', function (e) { self._handlePointerDown(e); });
        this.element.addEventListener('pointermove', function (e) { self._handlePointerMove(e); });
        this.element.addEventListener('pointerup', function (e) { self._handlePointerUp(e); });
        this.element.addEventListener('pointercancel', function (e) { self._handlePointerCancel(e); });
        // Prevent scrolling on touch
        this.element.style.touchAction = 'none';

        // Window level pointer up to catch releases outside
        window.addEventListener('pointerup', function (e) {
            if (self.isPointerDown) {
                self._handlePointerUp(e);
            }
        });
    };

    /**
     * 対話モード設定
     */
    BoardView.prototype.setInteractive = function (active) {
        this.isInteractive = active;
        if (!active) {
            this._clearHighlight();
            this.isPointerDown = false;
        }
    };

    BoardView.prototype._handlePointerDown = function (e) {
        if (!this.isInteractive) return;
        this.isPointerDown = true;
        this.element.setPointerCapture(e.pointerId);

        var col = this._getColumnFromPoint(e.clientX, e.clientY);
        if (col !== -1) {
            this._highlightColumn(col, true);
        }
    };

    BoardView.prototype._handlePointerMove = function (e) {
        if (!this.isInteractive || !this.isPointerDown) return;

        var col = this._getColumnFromPoint(e.clientX, e.clientY);

        // 列が変わった、または盤面外に出た場合
        if (col !== this.activeColumn) {
            if (this.activeColumn !== -1) {
                this._highlightColumn(this.activeColumn, false);
            }

            if (col !== -1) {
                this._highlightColumn(col, true);
            }
        }
    };

    BoardView.prototype._handlePointerUp = function (e) {
        if (!this.isPointerDown) return;

        this.isPointerDown = false;
        // キャプチャしていれば解放
        if (this.element.hasPointerCapture(e.pointerId)) {
            this.element.releasePointerCapture(e.pointerId);
        }

        if (!this.isInteractive) return;

        var col = this._getColumnFromPoint(e.clientX, e.clientY);

        // ハイライトをクリア
        this._clearHighlight();

        // 有効な列内でリリースされた場合は着手
        if (col !== -1 && this.onCellClick) {
            this.onCellClick(col);
        }
    };

    BoardView.prototype._handlePointerCancel = function (e) {
        this.isPointerDown = false;
        this._clearHighlight();
    };

    BoardView.prototype._getColumnFromPoint = function (x, y) {
        var rect = this.element.getBoundingClientRect();

        // Check bounds
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            return -1;
        }

        // グリッド等幅計算の簡易実装
        // 本来は elementFromPoint などを使う手もあるが、子要素（チップ）が邪魔するため
        // 相対X座標から計算する
        var relativeX = x - rect.left;
        var colWidth = rect.width / Board.SIZE_X;
        var col = Math.floor(relativeX / colWidth);

        if (col >= 0 && col < Board.SIZE_X) {
            return col;
        }
        return -1;
    };

    BoardView.prototype._clearHighlight = function () {
        if (this.activeColumn !== -1) {
            this._highlightColumn(this.activeColumn, false);
            this.activeColumn = -1;
        }
    };

    BoardView.prototype._highlightColumn = function (col, active) {
        if (active) this.activeColumn = col;

        // 同じ列の全てにclass付与
        for (var y = 0; y < Board.SIZE_Y; y++) {
            var index = y * Board.SIZE_X + col;
            if (active) {
                this.cells[index].classList.add('hover-highlight');
            } else {
                this.cells[index].classList.remove('hover-highlight');
            }
        }
    };

    /**
     * 盤面全描画（リセット時など）
     */
    BoardView.prototype.render = function () {
        // チップをすべて削除
        this.cells.forEach(function (cell) {
            cell.innerHTML = ''; // Remove all chips
            cell.classList.remove('win-cell');
        });

        // 現在のボード状態を反映
        for (var x = 0; x < Board.SIZE_X; x++) {
            for (var y = 0; y < Board.SIZE_Y; y++) {
                var val = this.board.getCell(x, y);
                if (val !== Cell.EMPTY) {
                    this._addChip(x, y, val, false);
                }
            }
        }
    };

    /**
     * チップを追加（アニメーションあり）
     */
    BoardView.prototype.putPiece = function (x, y, player, animate) {
        // y座標に対応するセル
        // DOM配列のインデックス: y * SIZE_X + x
        var index = y * Board.SIZE_X + x;
        var cell = this.cells[index];

        // 既にチップがあるなら何もしない（通常ありえない）
        if (cell.querySelector('.chip')) return;

        this._addChip(x, y, player, animate);
    };

    BoardView.prototype._addChip = function (x, y, player, animate) {
        var index = y * Board.SIZE_X + x;
        var cell = this.cells[index];

        var chip = document.createElement('div');
        chip.className = 'chip';
        if (player === Cell.PLAYER1) chip.classList.add('p1');
        if (player === Cell.PLAYER2) chip.classList.add('p2');

        if (animate) {
            chip.classList.add('falling');
            // アニメーション用にCSS変数などで落下距離を指定できればよりリアルだが
            // シンプルに style.css の @keyframes drop で上から降ってくる演出をする
            // simple style.css @keyframes drop logic
            // アニメーション完了後にバウンドアニメーションを開始
            chip.addEventListener('animationend', function () {
                if (chip.classList.contains('falling')) {
                    chip.classList.remove('falling');
                    chip.classList.add('land-bounce');
                }
            }, { once: true });
        }

        cell.appendChild(chip);
    };

    BoardView.prototype.removePiece = function (x, y) {
        var index = y * Board.SIZE_X + x;
        var cell = this.cells[index];
        cell.innerHTML = '';
        cell.classList.remove('win-cell');
    };

    /**
     * チップをアニメーション付きで削除 (Undo用)
     */
    BoardView.prototype.removePieceAnimated = function (x, y, callback) {
        var index = y * Board.SIZE_X + x;
        var cell = this.cells[index];
        var chip = cell.querySelector('.chip');

        if (chip) {
            chip.classList.remove('falling');
            chip.classList.add('rising');

            // アニメーション完了後に削除
            setTimeout(function () {
                cell.innerHTML = '';
                cell.classList.remove('win-cell');
                if (callback) callback();
            }, 400); // CSS animation duration
        } else {
            if (callback) callback();
        }
    };

    /**
     * 勝利ラインのハイライト
     */
    BoardView.prototype.highlightWinLine = function () {
        // ボードからライン情報を取得するのはコスト高いので再計算するか？
        // GameControllerから渡してもらうのが綺麗だが、ここではBoard.getStatus()内部ロジックを再利用
        // しかしBoardには「どのラインで勝ったか」を保持していない。
        // なのでここで簡易チェックして光らせる

        var lines = Board.EVAL_LINES;
        var board = this.board;
        var winCells = [];

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var s0 = board._cells[line[0]];
            var s1 = board._cells[line[1]];
            var s2 = board._cells[line[2]];
            var s3 = board._cells[line[3]];

            if (s0 !== Cell.EMPTY && s0 === s1 && s1 === s2 && s2 === s3) {
                // Found win line
                winCells.push(line[0], line[1], line[2], line[3]);
            }
        }

        var self = this;
        winCells.forEach(function (pos) {
            var x = board.toX(pos);
            var y = board.toY(pos);
            var index = y * Board.SIZE_X + x;
            if (self.cells[index]) {
                self.cells[index].classList.add('win-cell');
            }
        });
    };

    return BoardView;
})();
