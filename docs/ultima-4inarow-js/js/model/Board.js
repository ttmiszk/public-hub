/**
 * Ultima 4 in a Row - 名前空間
 */
var Ultima4InARow = Ultima4InARow || {};

/**
 * セルの状態
 */
Ultima4InARow.Cell = Object.freeze({
    EMPTY: 0,
    PLAYER1: 1, // 先手
    PLAYER2: 2, // 後手
    WALL: 9     // 番兵
});

/**
 * 盤面クラス
 * 
 * 7x6の固定サイズ。C#版の1次元配列+番兵の実装をJSに移植。
 */
Ultima4InARow.Board = (function () {
    var Cell = Ultima4InARow.Cell;

    // 定数
    var SIZE_X = 7;
    var SIZE_Y = 6;
    var CONNECT_NUMS = 4;
    var ARRAY_WIDTH = SIZE_X + 1; // 横幅 + 番兵(右端) ※実際には配列アクセス計算用

    // 方向オフセット (C#版準拠)
    // 左, 右, 上, 下, 左上, 右上, 左下, 右下
    // 配列構造: (SIZE_Y + 2)行 * (SIZE_X + 1)列
    // 上下左右に番兵を入れるため、少し大きめに確保されている

    // C#の実装: cell = new int[(SIZE_X + 1) * (SIZE_Y + 2) + 1];
    // ToPos(x, y) => (y + 1) * (SIZE_X + 1) + (x + 1)
    // x: 0..6, y: 0..5
    // JSでもこれを踏襲する

    function Board() {
        // コピーコンストラクタ
        if (arguments[0] instanceof Board) {
            var other = arguments[0];
            this._cells = new Int8Array(other._cells);
            this._undoStack = new Int32Array(other._undoStack);
            this._undoSp = other._undoSp;
            this.turn = other.turn;
            this.winner = other.winner;
            this.status = other.status;
            return;
        }

        // C#版: (SIZE_X + 1) * (SIZE_Y + 2) + 1
        // 番兵を含むサイズ
        var arraySize = (SIZE_X + 1) * (SIZE_Y + 2) + 1;
        this._cells = new Int8Array(arraySize);

        // アンドゥスタック (最大手数分)
        this._undoStack = new Int32Array(SIZE_X * SIZE_Y);
        this._undoSp = 0;

        // 定数初期化
        this._initConstants();

        this.init();
    }

    // 静的プロパティ
    Board.SIZE_X = SIZE_X;
    Board.SIZE_Y = SIZE_Y;
    Board.CONNECT_NUMS = CONNECT_NUMS;

    Board.prototype._initConstants = function () {
        this.DIR_L = -1;
        this.DIR_R = 1;
        this.DIR_U = -(SIZE_X + 1);
        this.DIR_D = SIZE_X + 1;
        this.DIR_LU = this.DIR_L + this.DIR_U;
        this.DIR_RU = this.DIR_R + this.DIR_U;
        this.DIR_LD = this.DIR_L + this.DIR_D;
        this.DIR_RD = this.DIR_R + this.DIR_D;
    };

    /**
     * 初期化
     */
    /**
     * 初期化
     * @param {number} [firstTurn] 先手 (Cell.PLAYER1 or Cell.PLAYER2). Default: PLAYER1
     */
    Board.prototype.init = function (firstTurn) {
        // 全て壁(番兵)で埋める
        for (var i = 0; i < this._cells.length; i++) {
            this._cells[i] = Cell.WALL;
        }

        // 盤面部分を空きにする
        for (var x = 0; x < SIZE_X; x++) {
            for (var y = 0; y < SIZE_Y; y++) {
                this._cells[this.toPos(x, y)] = Cell.EMPTY;
            }
        }

        this.turn = (firstTurn !== undefined) ? firstTurn : Cell.PLAYER1;
        this.winner = null; // null: 勝負中 or 引き分け, 判定は status で行う
        this.status = Board.STS_RUNNING;
        this._undoSp = 0;
    };

    Board.prototype.toPos = function (x, y) {
        return (y + 1) * (SIZE_X + 1) + (x + 1);
    };

    Board.prototype.toX = function (pos) {
        return pos % (SIZE_X + 1) - 1;
    };

    Board.prototype.toY = function (pos) {
        return Math.floor(pos / (SIZE_X + 1)) - 1;
    };

    Board.prototype.getCell = function (x, y) {
        if (arguments.length === 1) return this._cells[x]; // pos
        return this._cells[this.toPos(x, y)];
    };

    /**
     * 指定した列に打てるかチェック
     * @param {number} x 列インデックス (0-6)
     * @returns {number} 打てる場合はその位置(pos), 打てない場合は-1
     */
    Board.prototype.checkX = function (x) {
        if (x < 0 || x >= SIZE_X) return -1;

        // その列の一番上(y=0)を取得
        var p = this.toPos(x, 0);
        if (this._cells[p] === Cell.EMPTY) {
            // 重力に従って落下させる
            // 下が空いてる限り下へ
            // C#版ロジック:
            // p += DIR_D; while (cell[p] == EMPTY) p += DIR_D; return p + DIR_U;

            p += this.DIR_D;
            while (this._cells[p] === Cell.EMPTY) {
                p += this.DIR_D;
            }
            return p + this.DIR_U;
        } else {
            return -1;
        }
    };

    /**
     * 指定位置に石を打つ
     * 事前に checkX 等で合法手であることを確認済みであること
     */
    Board.prototype.move = function (pos) {
        if (this._cells[pos] === Cell.EMPTY) {
            this._cells[pos] = this.turn;
            this._undoStack[this._undoSp++] = pos;

            // 勝敗判定を行う
            var status = this.getStatus();

            // 勝負がついた場合はターンを交代しない
            if (status === Board.STS_RUNNING) {
                this.changeTurn();
            }
            return true;
        }
        return false;
    };

    Board.prototype.undo = function () {
        if (this._undoSp > 0) {
            // ゲーム終了状態からのUndo（勝負がついた手）の場合は、
            // move時にターン交代していないので、ここでも交代しない。
            // ゲーム中の場合（RUNNING）のみ、ターンを戻す。
            if (this.status === Board.STS_RUNNING) {
                this.changeTurn();
            }

            var pos = this._undoStack[--this._undoSp];
            this._cells[pos] = Cell.EMPTY;
            this.status = Board.STS_RUNNING;
            this.winner = null;
            return pos;
        }
        return -1;
    };

    Board.prototype.changeTurn = function () {
        this.turn = (Cell.PLAYER1 + Cell.PLAYER2) - this.turn;
    };

    /**
     * 空きマスの数
     */
    Board.prototype.getEmptyCount = function () {
        return (SIZE_X * SIZE_Y) - this._undoSp;
    };

    /**
     * 合法手(列)の一覧を取得
     * @returns {Array<number>} 列インデックス(0-6)の配列 ※AI用にはposを返す方が良いか？
     * C#版 getValidMoves は pos の配列を返している
     */
    Board.prototype.getValidMoves = function () {
        // AI最適化のため、固定長配列を使ってGCを減らすアプローチもありだが
        // まずは配列で返す
        var moves = [];
        // 中央から探索する方がAIの枝借りに有利な場合があるが、
        // 4 in a Row だと中央(col 3)が強い。
        // ここでは単純に左から、またはC#版の順序（CheckX(0)..6）に従う。
        // C#版は 0,1,2,3,4,5,6 の順

        // 最適化: 中央から列挙する順序 (3, 2, 4, 1, 5, 0, 6)
        var verifyOrder = [3, 2, 4, 1, 5, 0, 6];

        for (var i = 0; i < verifyOrder.length; i++) {
            var x = verifyOrder[i];
            var pos = this.checkX(x);
            if (pos >= 0) {
                moves.push(pos);
            }
        }
        return moves;
    };

    // 評価ライン定数（初期化時に生成）
    Board.EVAL_LINES = null;

    // 静的初期化ブロック的な処理
    (function initEvalLines() {
        var lines = [];
        var x, y, i;

        // 横
        for (y = 0; y < SIZE_Y; y++) {
            for (x = 0; x < SIZE_X - CONNECT_NUMS + 1; x++) {
                var line = [];
                for (i = 0; i < CONNECT_NUMS; i++) {
                    // ここでは Board インスタンスがないので toPos ロジックを直書き
                    // toPos(x+i, y)
                    line.push((y + 1) * (SIZE_X + 1) + (x + i + 1));
                }
                lines.push(new Int32Array(line));
            }
        }

        // 縦
        for (x = 0; x < SIZE_X; x++) {
            for (y = 0; y < SIZE_Y - CONNECT_NUMS + 1; y++) {
                var line = [];
                for (i = 0; i < CONNECT_NUMS; i++) {
                    line.push((y + i + 1) * (SIZE_X + 1) + (x + 1));
                }
                lines.push(new Int32Array(line));
            }
        }

        // 斜め (右上から左下 /) ※C#版のコメントと実装を確認
        // C#版:
        // if (x >= CONNECT_NUMS - 1) -> 右上から左下 (ToPos(x - i, y + i))
        // if (x <= SIZE_X - CONNECT_NUMS) -> 左上から右下 (ToPos(x + i, y + i))

        for (x = 0; x < SIZE_X; x++) {
            for (y = 0; y < SIZE_Y - CONNECT_NUMS + 1; y++) {
                // 右上から左下 (/)
                if (x >= CONNECT_NUMS - 1) {
                    var line1 = [];
                    for (i = 0; i < CONNECT_NUMS; i++) {
                        line1.push((y + i + 1) * (SIZE_X + 1) + (x - i + 1));
                    }
                    lines.push(new Int32Array(line1));
                }
                // 左上から右下 (\)
                if (x <= SIZE_X - CONNECT_NUMS) {
                    var line2 = [];
                    for (i = 0; i < CONNECT_NUMS; i++) {
                        line2.push((y + i + 1) * (SIZE_X + 1) + (x + i + 1));
                    }
                    lines.push(new Int32Array(line2));
                }
            }
        }

        Board.EVAL_LINES = lines;
    })();

    // ステータス定数
    Board.STS_END_GAME_DRAWN = 0;
    Board.STS_END_GAME_PLAYER1_WON = 1;
    Board.STS_END_GAME_PLAYER2_WON = 2; // C#版は -1 だが、JS版定数としてはユニークならOK。ここではPlayer IDに合わせる?
    // C#版: 1=P1 win, -1=P2 win. 
    // ここでは定数定義なので 1, 2 としてもよいが、評価関数の都合上 1, -1 が便利かも。
    // UltimaReversi.Cell.WHITE = -1 なので、それに合わせる手もある。
    // 今回は Cell.PLAYER1=1, PLAYER2=2 なので、それに合わせる。
    Board.STS_RUNNING = 9;

    /**
     * 盤面の状態(勝敗)を取得
     * キャッシュせず毎回計算（重ければキャッシュ検討）
     */
    Board.prototype.getStatus = function () {
        if (this.status !== Board.STS_RUNNING) return this.status;

        // すべてのラインをチェック
        var lines = Board.EVAL_LINES;
        var len = lines.length;

        for (var i = 0; i < len; i++) {
            var line = lines[i];
            var c1 = 0, c2 = 0;
            // Unroll loop for 4
            // line length is 4
            var s0 = this._cells[line[0]];
            var s1 = this._cells[line[1]];
            var s2 = this._cells[line[2]];
            var s3 = this._cells[line[3]];

            if (s0 === Cell.PLAYER1 && s1 === Cell.PLAYER1 && s2 === Cell.PLAYER1 && s3 === Cell.PLAYER1) {
                this.status = Board.STS_END_GAME_PLAYER1_WON;
                return this.status;
            }
            if (s0 === Cell.PLAYER2 && s1 === Cell.PLAYER2 && s2 === Cell.PLAYER2 && s3 === Cell.PLAYER2) {
                this.status = Board.STS_END_GAME_PLAYER2_WON;
                return this.status;
            }
        }

        if (this.getEmptyCount() === 0) {
            this.status = Board.STS_END_GAME_DRAWN;
            return this.status;
        }

        return Board.STS_RUNNING;
    };

    // AI用：ラインの状態取得（あといくつで揃うかなど）
    Board.prototype.getLineStatus = function (lineIndex) {
        var line = Board.EVAL_LINES[lineIndex];
        var p1 = 0, p2 = 0;

        // ループ展開
        var s;
        s = this._cells[line[0]]; if (s === Cell.PLAYER1) p1++; else if (s === Cell.PLAYER2) p2++;
        s = this._cells[line[1]]; if (s === Cell.PLAYER1) p1++; else if (s === Cell.PLAYER2) p2++;
        s = this._cells[line[2]]; if (s === Cell.PLAYER1) p1++; else if (s === Cell.PLAYER2) p2++;
        s = this._cells[line[3]]; if (s === Cell.PLAYER1) p1++; else if (s === Cell.PLAYER2) p2++;

        return { p1: p1, p2: p2 };
    };

    /**
     * クローン作成
     */
    Board.prototype.clone = function () {
        return new Board(this);
    };

    return Board;
})();
