/**
 * Ultima Reversi - 名前空間
 */
var UltimaReversi = UltimaReversi || {};

/**
 * セルの状態を表す定数
 * AI計算（3進数インデックス化など）の効率化のため、値を変更
 * 黒=1, 白=-1, 空き=0, 壁=9
 */
UltimaReversi.Cell = Object.freeze({
    EMPTY: 0,   // 空きマス
    BLACK: 1,   // 黒石
    WHITE: -1,  // 白石
    WALL: 9     // 壁（番兵）
});

/**
 * ルールの種類
 */
UltimaReversi.Rule = Object.freeze({
    NORMAL: 0,      // 通常ルール
    // 以下、C#版に合わせて定義（将来拡張用）
    HANDY1: 1,      // 1子局
    HANDY2: 2,      // 2子局
    HANDY3: 3,      // 3子局
    HANDY4: 4,      // 4子局
    NEGATIVE: 11,   // 最弱モード
    REVOLUTION: 12  // 革命モード
});

/**
 * 盤面クラス
 * 
 * パフォーマンス重視の実装（TypedArray使用、オブジェクト生成抑制）
 */
UltimaReversi.Board = (function () {
    var Cell = UltimaReversi.Cell;

    /** 最小盤面サイズ */
    var MIN_SIZE = 4;
    /** 最大盤面サイズ */
    var MAX_SIZE = 10; // C#版に合わせて拡張

    /**
     * @param {number} size - 盤面サイズ
     * @param {string|number} [handicapOrRule] - ハンデまたはルール
     */
    function Board(size, handicapOrRule) {
        // コピーコンストラクタ的な動作
        if (size instanceof Board) {
            var other = size;
            this._size = other._size;
            this._rule = other._rule;
            this._arraySize = other._arraySize;

            // TypedArrayはsetで高速コピー
            this._cells = new Int8Array(other._cells);

            this.turn = other.turn;
            this.blackCount = other.blackCount;
            this.whiteCount = other.whiteCount;

            // アンドゥスタックのコピー
            this._undoStack = new Int32Array(other._undoStack);
            this._undoSp = other._undoSp;

            this._initConstants(this._size);
            return;
        }

        if (size && (size < MIN_SIZE || size > MAX_SIZE || size % 2 !== 0)) {
            throw new Error('無効な盤面サイズです: ' + size);
        }

        // 引数解析 (rule string or rule number)
        // 今回はシンプルに rule 引数をそのまま保持する形にする
        this._size = size;
        this._rule = (handicapOrRule !== undefined) ? handicapOrRule : UltimaReversi.Rule.NORMAL;
        this._arraySize = size + 2;

        // 盤面データ (Int8Array)
        this._cells = new Int8Array(this._arraySize * this._arraySize);

        // アンドゥスタック (Int32Array)
        this._undoStack = new Int32Array(((this._size - 2) * 3 + 3) * this._size * this._size);
        this._undoSp = 0;

        this.turn = Cell.BLACK;
        this.blackCount = 0;
        this.whiteCount = 0;

        this._initConstants(this._size);
        this.init(this._rule);
    }

    // 静的プロパティ
    Board.MIN_SIZE = MIN_SIZE;
    Board.MAX_SIZE = MAX_SIZE;

    /**
     * 定数・方向オフセットの初期化
     */
    Board.prototype._initConstants = function (size) {
        // 方向
        // 全周囲番兵 (size + 2)
        var w = this._arraySize;

        this.dirL = -1;
        this.dirR = 1;
        this.dirU = -w;
        this.dirD = w;
        this.dirLU = -w - 1;
        this.dirRU = -w + 1;
        this.dirLD = w - 1;
        this.dirRD = w + 1;

        // 隅の座標
        // (1, 1) = 1 * w + 1 = w + 1
        this.cornerLU = w + 1;
        this.cornerRU = w + size;
        this.cornerLD = w * size + 1;
        this.cornerRD = w * size + size;

        // 星（X打ち）の座標
        this.starLU = this.cornerLU + this.dirRD;
        this.starRU = this.cornerRU + this.dirLD;
        this.starLD = this.cornerLD + this.dirRU;
        this.starRD = this.cornerRD + this.dirLU;

        // AI評価用方向リスト
        this._directions = [
            this.dirU, this.dirD, this.dirL, this.dirR,
            this.dirLU, this.dirRU, this.dirLD, this.dirRD
        ];
    };

    /**
     * 盤面を初期化する
     * @param {string} [rule] - ルール設定
     */
    Board.prototype.init = function (rule) {
        var i, x, y, p, center;
        var len = this._cells.length;
        // w: 横幅, size: 盤面サイズ
        var w = this._arraySize;
        var size = this._size;

        // 全て壁で埋める
        for (i = 0; i < len; i++) {
            this._cells[i] = Cell.WALL;
        }

        // 盤面部分を空きにする
        for (y = 1; y <= size; y++) {
            for (x = 1; x <= size; x++) {
                this._cells[y * w + x] = Cell.EMPTY;
            }
        }

        this.turn = Cell.BLACK;
        this.blackCount = 0;
        this.whiteCount = 0;
        this._undoSp = 0;

        // ノーマル（互角）またはルール値がNORMALの場合
        // ※NEGATIVE (最弱) も初期配置はノーマルと同じ
        if (rule === UltimaReversi.Rule.NORMAL || rule === UltimaReversi.Rule.NEGATIVE) {
            center = size / 2;
            p = this.toPosition(center, center); // 左上(白)

            this._cells[p] = Cell.WHITE;
            this._cells[p + this.dirR] = Cell.BLACK;
            this._cells[p + this.dirD] = Cell.BLACK;
            this._cells[p + this.dirRD] = Cell.WHITE;

            this.blackCount = 2;
            this.whiteCount = 2;
        } else {
            // ハンデありの場合
            var isHandicap1 = (rule === UltimaReversi.Rule.HANDY1);
            var isHandicap2 = (rule === UltimaReversi.Rule.HANDY2);
            var isHandicap3 = (rule === UltimaReversi.Rule.HANDY3);
            var isHandicap4 = (rule === UltimaReversi.Rule.HANDY4);

            // 黒1石隅 (左上)
            if (isHandicap1 || isHandicap2 || isHandicap3 || isHandicap4) {
                this._cells[this.cornerLU] = Cell.BLACK;
                this.blackCount++;
            }
            // 黒2石隅 (右下)
            if (isHandicap2 || isHandicap3 || isHandicap4) {
                this._cells[this.cornerRD] = Cell.BLACK;
                this.blackCount++;
            }
            // 黒3石隅 (右上)
            if (isHandicap3 || isHandicap4) {
                this._cells[this.cornerRU] = Cell.BLACK;
                this.blackCount++;
            }
            // 黒4石隅 (左下)
            if (isHandicap4) {
                this._cells[this.cornerLD] = Cell.BLACK;
                this.blackCount++;
            }

            // 中央初期配置（白2黒2）を行う
            center = size / 2;
            p = this.toPosition(center, center);
            this._cells[p] = Cell.WHITE;
            this._cells[p + this.dirR] = Cell.BLACK;
            this._cells[p + this.dirD] = Cell.BLACK;
            this._cells[p + this.dirRD] = Cell.WHITE;
            this.blackCount += 2;
            this.whiteCount += 2;

            // 手番は白から開始
            this.turn = Cell.WHITE;
        }

    };

    /**
     * 盤面サイズを取得
     */
    Board.prototype.getSize = function () {
        return this._size;
    };

    /**
     * ルールを取得
     */
    /**
     * ルールを取得
     */
    Board.prototype.getRule = function () {
        return this._rule;
    };

    /**
     * 現在の手番を取得
     */
    Board.prototype.getTurn = function () {
        return this.turn;
    };

    /**
     * 手番を変更
     */
    Board.prototype.changeTurn = function () {
        this.turn = -this.turn;
    };

    /**
     * 座標(x, y)を内部インデックスに変換
     * 1-based index (1..size)
     */
    Board.prototype.toPosition = function (x, y) {
        return y * this._arraySize + x;
    };

    /**
     * 内部インデックスからX座標を取得
     */
    Board.prototype.toX = function (pos) {
        return pos % this._arraySize;
    };

    /**
     * 内部インデックスからY座標を取得
     */
    Board.prototype.toY = function (pos) {
        return Math.floor(pos / this._arraySize);
    };

    /**
     * セルの値を取得
     */
    Board.prototype.getCell = function (x, y) {
        if (arguments.length === 1) {
            return this._cells[x]; // x is pos
        }
        return this._cells[y * this._arraySize + x];
    };

    Board.prototype.getCells = function () {
        // UI互換用：Arrayに変換して返す（遅いので頻用注意）
        // または、TypedArrayのまま返しても、UI側がインデックスアクセスなら動くかも
        // ただし `slice()` が使われている場所があるなら注意。
        // Int8Arrayにも slice はある。
        return this._cells.slice();
    };

    /**
     * 石の数を取得
     */
    Board.prototype.countStones = function () {
        // 常にトラッキングしているので計算不要
        var empty = (this._size * this._size) - this.blackCount - this.whiteCount;
        return { black: this.blackCount, white: this.whiteCount, empty: empty };
    };

    Board.prototype.getEmptyCount = function () {
        return (this._size * this._size) - this.blackCount - this.whiteCount;
    };

    /**
     * 指定座標に石を置けるかチェック
     * (C#版のCheckメソッド相当)
     */
    Board.prototype.check = function (x, y) {
        var p = (arguments.length === 2) ? this.toPosition(x, y) : x;

        if (this._cells[p] !== Cell.EMPTY) return false;

        // 全方向チェック
        // 高速化のため展開するか、ループするか
        // ここではループで実装（JSエンジン最適化に期待）
        if (this._checkDir(p, this.dirLU)) return true;
        if (this._checkDir(p, this.dirU)) return true;
        if (this._checkDir(p, this.dirRU)) return true;
        if (this._checkDir(p, this.dirL)) return true;
        if (this._checkDir(p, this.dirR)) return true;
        if (this._checkDir(p, this.dirLD)) return true;
        if (this._checkDir(p, this.dirD)) return true;
        if (this._checkDir(p, this.dirRD)) return true;

        return false;
    };

    Board.prototype._checkDir = function (p, dir) {
        var opponent = -this.turn;
        p += dir;
        if (this._cells[p] !== opponent) return false;

        p += dir;
        while (this._cells[p] === opponent) {
            p += dir;
        }

        return this._cells[p] === this.turn;
    };

    /**
     * 指定座標に石を打つ
     * @param {number} x
     * @param {number} y
     * @returns {number} 裏返した数
     */
    Board.prototype.move = function (x, y) {
        var p = (arguments.length === 2) ? this.toPosition(x, y) : x;

        if (this._cells[p] !== Cell.EMPTY) return 0;

        var mine = this.turn;
        var opponent = -mine;
        var count = 0;

        // 8方向探索と反転
        // アンドゥスタックには「裏返した石の位置」を記録していく
        // C#版の実装を参考に、方向ごとに処理

        count += this._moveDir(p, this.dirLU, mine, opponent);
        count += this._moveDir(p, this.dirU, mine, opponent);
        count += this._moveDir(p, this.dirRU, mine, opponent);
        count += this._moveDir(p, this.dirL, mine, opponent);
        count += this._moveDir(p, this.dirR, mine, opponent);
        count += this._moveDir(p, this.dirLD, mine, opponent);
        count += this._moveDir(p, this.dirD, mine, opponent);
        count += this._moveDir(p, this.dirRD, mine, opponent);

        if (count > 0) {
            this._cells[p] = mine;

            // 石数更新（通常反転分）
            if (mine === Cell.BLACK) {
                this.blackCount += count;
                this.whiteCount -= count;
            } else {
                this.blackCount -= count;
                this.whiteCount += count;
            }

            // 革命ルール対応: 隅に打った場合、他の隅の相手の石を反転させる
            var revolutionFlipped = [];
            var isRevolution = (this._rule === UltimaReversi.Rule.REVOLUTION &&
                (p === this.cornerLU || p === this.cornerRU || p === this.cornerLD || p === this.cornerRD));

            if (isRevolution) {
                var corners = [this.cornerLU, this.cornerRU, this.cornerLD, this.cornerRD];
                for (var i = 0; i < corners.length; i++) {
                    var cp = corners[i];
                    // 自分が置いた場所以外の、空でない石（壁でもない）
                    if (cp !== p && this._cells[cp] !== Cell.EMPTY && this._cells[cp] !== Cell.WALL) {
                        var targetColor = this._cells[cp];

                        // 石を反転（単純に符号反転：黒<->白）
                        this._cells[cp] = -targetColor;

                        // 石数更新
                        // targetColorが黒なら、黒が減って白が増える
                        // targetColorが白なら、白が減って黒が増える
                        if (targetColor === Cell.BLACK) {
                            this.blackCount--;
                            this.whiteCount++;
                        } else {
                            this.whiteCount--;
                            this.blackCount++;
                        }

                        // アンドゥスタックに記録
                        // 元の色が「自分(mine)」だった場合、Undo時に「自分」に戻す必要がある
                        // 通常Undoは「相手(opponent)」に戻す動作なので、ここを区別する
                        // 革命ルール対応: 隅に打った場合、他の隅の石を反転させる
                        // ここで自分の石が反転された場合は、アンドゥ時に「自分の色に戻す」必要があるため
                        // 特別なエンコーディングを行う。
                        // 通常: 正の値 (位置インデックス)
                        // 自己反転: 負の値 (-位置インデックス - 1)
                        if (targetColor === mine) {
                            this._undoStack[this._undoSp++] = -cp - 1; // 復号時: decode = -(val + 1)
                        } else {
                            this._undoStack[this._undoSp++] = cp;
                        }
                        count++;
                        revolutionFlipped.push(cp);
                    }
                }
            }

            // UI表示用に革命反転情報を保持
            this._lastRevolutionFlips = revolutionFlipped;

            // アンドゥスタックにヘッダ情報を積む
            // 構造: [..., flippedPos1, flippedPos2, ..., pos, turn, count]
            this._undoStack[this._undoSp++] = p;
            this._undoStack[this._undoSp++] = mine; // 打った人の色
            this._undoStack[this._undoSp++] = count; // 革命分も含めた総反転数

            // 石数更新(打った石分)
            if (mine === Cell.BLACK) {
                this.blackCount++;
            } else {
                this.whiteCount++;
            }

            this.changeTurn();
        } else {
            // 石が返せない、かつ革命効果もない場合は?
            // 通常、石が返せなければ置けない(checkで弾かれる)のでここには来ないはず
            // ただし革命だけ発動して他が返せないケースはルール上「置けない」
            // (通常ルール: 1つ以上返さないと置けない)
            this._lastRevolutionFlips = [];
        }

        return count;
    };

    Board.prototype._moveDir = function (p, dir, mine, opponent) {
        var curr = p + dir;
        if (this._cells[curr] !== opponent) return 0;

        // 相手の石が続く場所を探す
        while (this._cells[curr] === opponent) {
            curr += dir;
        }

        // 自分の石で挟めているか
        if (this._cells[curr] !== mine) return 0;

        // 反転実行
        var count = 0;
        curr -= dir;
        while (curr !== p) {
            this._cells[curr] = mine;
            this._undoStack[this._undoSp++] = curr; // 反転位置を記録
            count++;
            curr -= dir;
        }
        return count;
    };

    /**
     * 1手戻す
     */
    Board.prototype.undo = function () {
        if (this._undoSp === 0) return false;

        var count = this._undoStack[--this._undoSp];
        var turn = this._undoStack[--this._undoSp]; // 打った人の色
        var p = this._undoStack[--this._undoSp];

        // 打った石を除去
        this._cells[p] = Cell.EMPTY;

        // 裏返した石を元に戻す
        var opponent = -turn;
        for (var i = 0; i < count; i++) {
            var flippedPos = this._undoStack[--this._undoSp];

            // 負の値の場合は「自分の石が裏返った」ことを意味する（革命ルール用）
            // 復号: pos = -val - 1
            if (flippedPos < 0) {
                flippedPos = -flippedPos - 1;
                this._cells[flippedPos] = turn; // 自分の色に戻す

                // 石数更新: 相手(opponent) -> 自分(turn)
                // move時に 自分 -> 相手 になっていたのを戻す
                if (turn === Cell.BLACK) {
                    this.blackCount++;
                    this.whiteCount--;
                } else {
                    this.whiteCount++;
                    this.blackCount--;
                }
            } else {
                this._cells[flippedPos] = opponent; // 相手の色に戻す（通常）

                // 石数更新: 自分(turn) -> 相手(opponent)
                // move時に 相手 -> 自分 になっていたのを戻す
                if (turn === Cell.BLACK) {
                    this.blackCount--;
                    this.whiteCount++;
                } else {
                    this.whiteCount--;
                    this.blackCount++;
                }
            }
        }

        // 手番を戻す（打った人の番に戻る）
        this.turn = turn;

        // 打った石の分を減らす
        if (turn === Cell.BLACK) {
            this.blackCount--;
        } else {
            this.whiteCount--;
        }

        return true;
    };

    /**
     * 直前の手で革命により反転した石のリストを取得
     * @returns {Array<number>}
     */
    Board.prototype.getLastRevolutionFlips = function () {
        return this._lastRevolutionFlips || [];
    };

    /**
     * 有効な手を取得 (Array<{x, y}>)
     * 既存I/F互換用
     */
    Board.prototype.getValidMoves = function () {
        var moves = [];
        var p, x, y;

        // 探索範囲のみ走査
        for (y = 1; y <= this._size; y++) {
            for (x = 1; x <= this._size; x++) {
                p = this.toPosition(x, y);
                if (this._cells[p] === Cell.EMPTY && this.check(p)) {
                    moves.push({ x: x, y: y });
                }
            }
        }
        return moves;
    };

    // AI用：インデックス配列を返すバージョン
    Board.prototype.getValidMoveIndices = function (buffer) {
        var cnt = 0;
        var p;
        // バッファがなければ新規作成（通常はAI側でバッファ使い回す）
        var res = buffer || [];

        for (var y = 1; y <= this._size; y++) {
            for (var x = 1; x <= this._size; x++) {
                p = this.toPosition(x, y);
                if (this._cells[p] === Cell.EMPTY && this.check(p)) {
                    res[cnt++] = p;
                }
            }
        }
        return buffer ? cnt : res;
    };

    Board.prototype.hasValidMove = function () {
        for (var y = 1; y <= this._size; y++) {
            for (var x = 1; x <= this._size; x++) {
                if (this.check(x, y)) return true;
            }
        }
        return false;
    };

    Board.prototype.isGameOver = function () {
        if (this.hasValidMove()) return false;

        // パスして相手が打てるか確認
        // (Boardを汚さないように一時的に手番変更)
        this.changeTurn();
        var opponentCanMove = this.hasValidMove();
        this.changeTurn();

        return !opponentCanMove;
    };

    /**
     * 盤面のクローン
     */
    Board.prototype.clone = function () {
        return new Board(this);
    };

    /**
     * 履歴数
     */
    Board.prototype.getMoveCount = function () {
        return (this.blackCount + this.whiteCount) - 4;
    };

    /**
     * アンドゥ可能か判定
     */
    Board.prototype.canUndo = function () {
        return this._undoSp > 0;
    };

    /**
     * 座標を棋譜用文字列に変換 (例: F5)
     */
    Board.prototype.toCoordinateString = function (x, y) {
        // x=1->A, 2->B...
        var col = String.fromCharCode('A'.charCodeAt(0) + (x - 1));
        var row = y.toString();
        return col + row;
    };

    /**
     * 棋譜文字列を取得 (例: F5D6C3...)
     */
    /**
     * 棋譜文字列を取得 (例: F5D6C3...)
     */
    Board.prototype.getHistoryString = function () {
        var moves = [];
        var sp = this._undoSp;

        while (sp > 0) {
            // スタック構造: [flipped..., p, turn, count] (top)
            // spは次に書き込む場所。sp-1: count, sp-2: turn, sp-3: p
            var count = this._undoStack[sp - 1];
            // var turn = this._undoStack[sp - 2]; 
            var p = this._undoStack[sp - 3];

            var x = this.toX(p);
            var y = this.toY(p);
            moves.push(this.toCoordinateString(x, y));

            // 1手分のデータサイズ = flipped(count) + header(3)
            sp -= (count + 3);
        }

        // 逆順（最新→過去）で取得しているので反転して結合
        return moves.reverse().join("");
    };

    /**
     * 前回の手を取得 (UI用)
     */
    Board.prototype.getLastMove = function () {
        if (this._undoSp === 0) return null;
        // スタック構造: [..., pos, turn, count] (top)
        // undoSpは次に書き込む場所なので、-1がcount, -2がturn, -3がpos
        var pos = this._undoStack[this._undoSp - 3];
        return {
            x: this.toX(pos),
            y: this.toY(pos)
        };
    };

    return Board;
})();
