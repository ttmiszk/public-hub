/**
 * BoardView - 盤面表示コンポーネント
 * 
 * 盤面の状態をDOMに反映し、ユーザーの操作を検知する。
 */
var UltimaReversi = UltimaReversi || {};

/**
 * 盤面表示クラス
 */
UltimaReversi.BoardView = (function () {
    var Cell = UltimaReversi.Cell;

    /**
     * コンストラクタ
     * @param {HTMLElement} containerElement - 盤面を表示するコンテナ要素
     * @param {Board} board - 盤面オブジェクト
     */
    function BoardView(containerElement, board) {
        this._container = containerElement;
        this._board = board;
        this._cells = [];
        this._onCellClick = null;

        this._createBoard();
    }

    /**
     * 盤面DOMを生成
     */
    BoardView.prototype._createBoard = function () {
        var size = this._board.getSize();
        var self = this;
        var x, y, cell;

        // コンテナをクリア
        this._container.innerHTML = '';
        this._container.dataset.size = size;
        this._cells = [];

        // セルを生成
        for (y = 1; y <= size; y++) {
            for (x = 1; x <= size; x++) {
                cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.x = x;
                cell.dataset.y = y;

                // 星（Hoshi）の判定（4x4以上のみ）
                // 左・上から2番目の交点 = セルインデックス3の左上
                // 右・下から2番目の交点 = セルインデックス(size-1)の左上
                if (size >= 4) {
                    var isStarX = (x === 3 || x === size - 1);
                    var isStarY = (y === 3 || y === size - 1);

                    if (isStarX && isStarY) {
                        var starPoint = document.createElement('div');
                        starPoint.className = 'board-star-point';
                        cell.appendChild(starPoint);
                    }
                }

                // クリックイベント（クロージャで座標を保持）
                (function (cx, cy) {
                    cell.addEventListener('click', function () {
                        self._handleCellClick(cx, cy);
                    });
                })(x, y);

                this._container.appendChild(cell);
                this._cells.push(cell);
            }
        }

        // 初期状態を反映
        this.render();
    };

    /**
     * セルクリック時のハンドラを設定
     */
    BoardView.prototype.setOnCellClick = function (callback) {
        this._onCellClick = callback;
    };

    /**
     * セルクリック処理
     */
    BoardView.prototype._handleCellClick = function (x, y) {
        if (this._onCellClick) {
            this._onCellClick(x, y);
        }
    };

    /**
     * 盤面を再描画
     */
    BoardView.prototype.render = function () {
        var size = this._board.getSize();
        var validMoves = this._board.getValidMoves();
        var validSet = {};
        var i, x, y, index, cellElement, cellState;

        // 有効な手をセットに変換
        for (i = 0; i < validMoves.length; i++) {
            validSet[validMoves[i].x + ',' + validMoves[i].y] = true;
        }

        for (y = 1; y <= size; y++) {
            for (x = 1; x <= size; x++) {
                index = (y - 1) * size + (x - 1);
                cellElement = this._cells[index];
                cellState = this._board.getCell(x, y);

                // 石を更新
                this._updateCellContent(cellElement, cellState);

                // 打てる場所をハイライト
                if (validSet[x + ',' + y]) {
                    cellElement.classList.add('playable');
                } else {
                    cellElement.classList.remove('playable');
                }
            }
        }

        // 前回手マーカーを更新
        this._updateLastMoveMarker();
    };

    /**
     * 前回手マーカーを更新
     */
    BoardView.prototype._updateLastMoveMarker = function () {
        var lastMove = this._board.getLastMove();
        var size = this._board.getSize();
        var index, cellElement, stone, marker, allMarkers, i;

        // 既存のマーカーをすべて削除
        allMarkers = this._container.querySelectorAll('.last-move-marker');
        for (i = 0; i < allMarkers.length; i++) {
            allMarkers[i].parentNode.removeChild(allMarkers[i]);
        }

        if (!lastMove) {
            return;
        }

        // 前回の手の石にマーカーを追加
        index = (lastMove.y - 1) * size + (lastMove.x - 1);
        cellElement = this._cells[index];
        stone = cellElement.querySelector('.stone');

        if (stone) {
            marker = document.createElement('div');
            marker.className = 'last-move-marker';
            stone.appendChild(marker);
        }
    };

    /**
     * セルの内容を更新
     * アニメーション中の石はスキップしてチカチカを防止
     */
    BoardView.prototype._updateCellContent = function (cellElement, cellState) {
        var stone = cellElement.querySelector('.stone');
        var colorClass, currentColor;

        if (cellState === Cell.EMPTY) {
            // 空きマス: 石があれば削除
            if (stone) {
                cellElement.removeChild(stone);
            }
        } else if (cellState === Cell.BLACK || cellState === Cell.WHITE) {
            colorClass = (cellState === Cell.BLACK) ? 'black' : 'white';

            if (!stone) {
                // 石がなければ作成（アニメーションクラスは付けない）
                stone = document.createElement('div');
                stone.className = 'stone ' + colorClass;
                cellElement.appendChild(stone);
            } else {
                // アニメーション中の石はスキップ（チカチカ防止）
                if (stone.classList.contains('flipping') || stone.classList.contains('placed')) {
                    return;
                }

                // 石の色が変わった場合（裏返し）
                currentColor = stone.classList.contains('black') ? 'black' : 'white';
                if (currentColor !== colorClass) {
                    stone.classList.remove('black', 'white');
                    stone.classList.add(colorClass, 'flipping');
                    // アニメーション終了後にクラス削除
                    setTimeout(function () {
                        stone.classList.remove('flipping');
                    }, 500);
                }
            }
        }
    };

    /**
     * 指定座標に石を置くアニメーションを実行
     */
    BoardView.prototype.animatePlacement = function (x, y) {
        var size = this._board.getSize();
        var index = (y - 1) * size + (x - 1);
        var cellElement = this._cells[index];
        var stone = cellElement.querySelector('.stone');

        if (stone) {
            stone.classList.remove('placed');
            // リフローを強制してアニメーションをリセット
            void stone.offsetWidth;
            stone.classList.add('placed');

            // アニメーション終了後にplacedクラスを削除
            setTimeout(function () {
                stone.classList.remove('placed');
            }, 300);
        }
    };

    /**
     * 盤面オブジェクトを更新
     */
    BoardView.prototype.setBoard = function (board) {
        this._board = board;
        this._createBoard();
    };

    return BoardView;
})();
