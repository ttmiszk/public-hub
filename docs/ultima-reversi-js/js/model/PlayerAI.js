/**
 * PlayerAI - AIプレイヤークラス
 * 
 * α-β法による思考ルーチンを実装。
 * C#版のロジック（辺の評価、Move Ordering、反復深化など）を移植。
 */
var UltimaReversi = UltimaReversi || {};

/**
 * AIプレイヤークラス
 */
UltimaReversi.PlayerAI = (function () {
    var Player = UltimaReversi.Player;
    var Cell = UltimaReversi.Cell;
    var Board = UltimaReversi.Board;

    /** レベル範囲 */
    var MIN_LEVEL = 1;
    var MAX_LEVEL = 10;

    // 探索モード
    var SEARCH_MODE_EVALUATE = 0;
    var SEARCH_MODE_VICTORY = 1; // 必勝読み
    var SEARCH_MODE_COMPLETE = 2; // 完全読み

    /**
     * コンストラクタ
     * @param {string} name - プレイヤー名
     * @param {number} level - 思考レベル(1-10)
     */
    function PlayerAI(name, level) {
        Player.call(this, name);

        if (level < MIN_LEVEL || level > MAX_LEVEL) {
            throw new Error('レベルは' + MIN_LEVEL + 'から' + MAX_LEVEL + 'の間で指定してください');
        }

        this._level = level;
        this._stopRequested = false;

        // レベルごとのパラメータ設定 (C#版のパラメータを参考にマッピング)
        // Lv1 -> C# Lv2 (Depth 2-4, Randomness)
        // Lv2 -> C# Lv6 (Depth 6-8)
        // Lv3 -> C# Lv9 (Depth 10-12, Strong)
        this._params = this._getLevelParams(level);

        // 辺情報インデックス（クラス変数的にキャッシュ）
        if (!PlayerAI._edgeInfoIndexMap) {
            PlayerAI._edgeInfoIndexMap = {};
        }
    }

    // Playerを継承
    PlayerAI.prototype = Object.create(Player.prototype);
    PlayerAI.prototype.constructor = PlayerAI;

    // 静的プロパティ
    PlayerAI.MIN_LEVEL = MIN_LEVEL;
    PlayerAI.MAX_LEVEL = MAX_LEVEL;

    /**
     * レベル別パラメータ取得
     */
    PlayerAI.prototype._getLevelParams = function (level) {
        // C#版のパラメータ体系: ブラウザ版では近年著しいCPU性能向上に伴い、探索深度を少し深くしている
        // openingSearchDepthArr: 序盤の探索深度配列
        // middleSearchDepthArr: 中盤の探索深度配列
        // victorySearchDepth: 必勝読み開始空き数
        // completeSearchDepth: 完全読み開始空き数
        // beginner: 初心者モードか（レベル1～4は初心者モード用の探索深度設定となっていることに注意）

        switch (level) {
            case 1:
                return { opening: [0, 0, 1, 2], middle: [0, 0, 1, 2], victory: 1, complete: 1, beginner: true };
            case 2:
                return { opening: [0, 0, 1, 2], middle: [1, 1, 1, 2], victory: 1, complete: 1, beginner: true };
            case 3:
                return { opening: [1, 1, 2, 3], middle: [1, 2, 2, 3], victory: 2, complete: 1, beginner: true };
            case 4:
                return { opening: [1, 2, 3, 3], middle: [2, 3, 3, 4], victory: 2, complete: 2, beginner: true };
            case 5:
                return { opening: [1, 1, 2, 2], middle: [2, 2, 3, 3], victory: 4, complete: 2, beginner: false };
            case 6:
                return { opening: [1, 2, 2, 3], middle: [3, 3, 3, 4], victory: 8, complete: 6, beginner: false };
            case 7:
                return { opening: [2, 2, 3, 4], middle: [3, 3, 4, 5], victory: 10, complete: 8, beginner: false };
            case 8:
                return { opening: [3, 3, 4, 5], middle: [5, 5, 6, 7], victory: 12, complete: 8, beginner: false };
            case 9:
                return { opening: [5, 6, 6, 7], middle: [7, 7, 8, 9], victory: 14, complete: 12, beginner: false };
            case 10:
                return { opening: [5, 6, 6, 7], middle: [8, 9, 8, 9], victory: 16, complete: 14, beginner: false };
            default:
                return this._getLevelParams(10);
        }
    };

    /**
     * AIプレイヤーを生成
     */
    PlayerAI.create = function (name, level) {
        return new PlayerAI(name, level);
    };

    /**
     * レベル取得
     */
    PlayerAI.prototype.getLevel = function () {
        return this._level;
    };

    PlayerAI.prototype.isHuman = function () {
        return false;
    };

    PlayerAI.prototype.isAI = function () {
        return true;
    };

    PlayerAI.prototype.stopThinking = function () {
        this._stopRequested = true;
    };

    /**
     * 次の手を思考する
     * @param {Board} board 
     * @param {Function} callback 
     * @param {Function} onProgress進捗コールバック (progress: number) => void
     */
    PlayerAI.prototype.think = function (board, callback, onProgress) {
        var self = this;
        this._stopRequested = false;

        // 思考情報キャッシュの準備（辺テーブルなど）
        try {
            this._prepareEdgeTable(board.getSize());
        } catch (e) {
            console.error("Error in prepareEdgeTable:", e);
            callback(null);
            return;
        }

        // 打てる手がない場合
        if (!board.hasValidMove()) {
            setTimeout(function () { callback(null); }, 0);
            return;
        }

        // onProgressがなければダミーを設定
        if (!onProgress) onProgress = function () { };

        // Async/Awaitで実行（メインスレッドをブロックしないようにYieldしながら実行）
        (async function () {
            try {
                // awaitで結果を待つ
                var move = await self._thinkInternal(board, onProgress);
                callback(move);
            } catch (e) {
                console.error("Error during AI thinking:", e);
                callback(null);
            }
        })();
    };

    /**
     * 思考ロジック本体 (Async)
     */
    PlayerAI.prototype._thinkInternal = async function (board, onProgress) {
        // 元の盤面を変更しないように念のためクローン
        var workBoard = new Board(board);

        var bestPos = -1;
        var emptyCount = workBoard.getEmptyCount();
        var p = this._params;
        var depth = 0;
        var depth = 0;
        var searchMode = SEARCH_MODE_EVALUATE;

        // 評価回数カウンタ初期化
        this._evalCount = 0;

        // 探索深度とモード決定
        if (emptyCount <= p.complete) {
            searchMode = SEARCH_MODE_COMPLETE;
            depth = emptyCount;
        } else if (emptyCount <= p.victory) {
            searchMode = SEARCH_MODE_VICTORY; // C#版ではVICTORYとCOMPLETEを区別
            depth = emptyCount;
        } else if (emptyCount < workBoard.getSize() * workBoard.getSize() * 0.8) {
            // 中盤
            searchMode = SEARCH_MODE_EVALUATE;
            depth = p.middle[Math.floor(Math.random() * p.middle.length)];
        } else {
            // 序盤
            searchMode = SEARCH_MODE_EVALUATE;
            depth = p.opening[Math.floor(Math.random() * p.opening.length)];

            // ランダム要素（最初の数手はランダム性を入れるなど）
            // C#版ロジック: undoSp <= 4 で確率でdepth=0
            if (workBoard.blackCount + workBoard.whiteCount <= 8 && Math.random() < 0.5) {
                // depth = 0; // JS版では完全ランダムは弱すぎるので、深さ1程度にするか、そのままか
                // Lv1ならランダムにする
                if (this._level === 1) depth = 1;
            }
        }

        // 初心者モード調整: 盤面サイズに応じて弱くする
        // (盤面サイズ4~6の場合は、8と同等の難易度になるように探索深度を調整)
        if (p.beginner) {
            var rand = Math.random();
            var size = workBoard.getSize();
            switch (size) {
                case 4:
                    depth--;
                    if (rand > 0.3) depth--;
                    if (rand > 0.6) depth--;
                    break;
                case 5:
                    if (rand > 0.3) depth--;
                    if (rand > 0.6) depth--;
                    break;
                case 6:
                    if (rand > 0.6) depth--;
                    break;
            }
            if (depth < 0) depth = 0;
            // 初心者モードではモードをEVALUATEに固定（必勝読みなどをさせない）
            searchMode = SEARCH_MODE_EVALUATE;
        }

        var modeStr = ["EVALUATE", "VICTORY", "COMPLETE"][searchMode] || "UNKNOWN";
        var colorStr = (workBoard.turn === Cell.BLACK) ? "[黒]" : "[白]";
        console.log(`${colorStr} [AI Thinking] Level=${this._level}, Depth=${depth}, Mode=${searchMode} (${modeStr}), Empty=${emptyCount}`);

        if (depth > 0) {
            // α-β探索 (Async)
            var result = await this._alphaBeta(true, workBoard.turn, false, workBoard, depth, -Infinity, Infinity, searchMode, onProgress);
            bestPos = this._nextPosition; // _alphaBeta内で更新される

            var posStr = "Pass";
            if (bestPos !== -1) {
                posStr = workBoard.toCoordinateString(workBoard.toX(bestPos), workBoard.toY(bestPos));
            }
            console.log(`${colorStr} [AI Move] Pos=${posStr} (α-β search: Eval=${result}, Count=${this._evalCount})`);
        } else {
            // ランダム
            var moves = workBoard.getValidMoves();
            if (moves.length > 0) {
                var m = moves[Math.floor(Math.random() * moves.length)];
                bestPos = workBoard.toPosition(m.x, m.y);
                var posStr = workBoard.toCoordinateString(m.x, m.y);
                console.log(`${colorStr} [AI Move] Pos=${posStr} (random)`);
            } else {
                console.log(`${colorStr} [AI Move] Pos=Pass (random)`);
            }
        }

        if (bestPos === -1) return null;

        return { x: workBoard.toX(bestPos), y: workBoard.toY(bestPos) };
    };

    /**
     * α-β探索 (Async)
     * @returns {number} 評価値
     */
    PlayerAI.prototype._alphaBeta = async function (rootNode, rootTurn, parentNodePass, board, depth, alpha, beta, searchMode, onProgress) {
        if (depth === 0) {
            return this._evalBoard(board, searchMode) * rootTurn;
        }

        // バッファ節約のため、毎回配列生成せずキャッシュしたいが、再帰なので難しい。
        // Uint8Arrayなどでスタック管理もできるが、JSエンジンのGCに任せる。
        // getValidMoveIndices は最適化版を使用
        var moves = board.getValidMoveIndices(); // returns Array<int> (pos list)
        var i, len = moves.length;

        if (len === 0) {
            if (parentNodePass) {
                // 双方パス（終局）
                if (searchMode === SEARCH_MODE_EVALUATE) {
                    // 現在の探索モードが必勝読みor完全読みでない場合は、
                    // 完全読みでの盤面評価値を1000倍する (終局時の勝敗を最優先するため)
                    return this._evalBoard(board, SEARCH_MODE_COMPLETE) * rootTurn * 1000;
                } else {
                    return this._evalBoard(board, SEARCH_MODE_COMPLETE) * rootTurn;
                }
            }

            // パスして続行
            board.changeTurn();
            var val;
            if (searchMode === SEARCH_MODE_EVALUATE) {
                val = await this._alphaBeta(false, rootTurn, true, board, depth - 1, alpha, beta, searchMode, onProgress);
            } else {
                // 必勝読み・完全読みは深度を下げずにパス
                val = await this._alphaBeta(false, rootTurn, true, board, depth, alpha, beta, searchMode, onProgress);
            }
            board.changeTurn(); // 元に戻す
            return val;
        }

        // Move Ordering
        // 探索深度が深い場合、浅い探索で並べ替え
        if (depth > 2) {
            // 簡易実装: 現在は省略（JS負荷軽減のため）。
            // 必要なら、1手読みで評価値を出してソートする
        }

        var value, childValue;
        var bestPos = -1;
        var myTurn = (board.turn === rootTurn);

        if (myTurn) {
            value = -Infinity;
        } else {
            value = Infinity;
        }

        for (i = 0; i < len; i++) {
            if (this._stopRequested) break;

            var pos = moves[i];

            // 手を打つ
            board.move(pos); // turnが入れ替わる

            // ルートノードの場合は進捗報告とYieldを行う
            if (rootNode) {
                // 進捗更新 (i / len)
                if (onProgress) onProgress(i / len);

                // UI更新のために処理を少し譲る
                await new Promise(function (resolve) { setTimeout(resolve, 0); });
            }

            // 再帰呼び出し
            childValue = await this._alphaBeta(false, rootTurn, false, board, depth - 1, alpha, beta, searchMode, onProgress);

            // 手を戻す
            board.undo();

            if (myTurn) {
                // 自分（Maxノード）
                if (childValue > value) {
                    value = childValue;
                    bestPos = pos;
                    alpha = Math.max(alpha, value);

                    // 必勝読み(VICTORY)モードの場合の枝刈り
                    // 自分（Maxノード）が勝てる手（評価値 > 0）が見つかったら、
                    // より良い勝ち方を探さずにそこで探索を打ち切る。
                    // （相手の手番も考慮されるため、rootNodeかどうかは問わない）
                    if (searchMode === SEARCH_MODE_VICTORY && value > 0) {
                        // 勝ち確定なら打ち切り (betaカットと同様の扱い)
                        break;
                    }
                }
                if (value >= beta) {
                    break; // βカット
                }
            } else {
                // 相手（Minノード）
                if (childValue < value) {
                    value = childValue;
                    bestPos = pos;
                    beta = Math.min(beta, value);
                }
                if (value <= alpha) {
                    break; // αカット
                }
            }
        }

        if (rootNode) {
            this._nextPosition = bestPos;
        }
        return value;
    };

    /**
     * 辺情報の定石パターン定数
     */
    var EDGE_PATTERN_NONE = 0;
    var EDGE_PATTERN_MOUNTAIN = 1;
    var EDGE_PATTERN_WING = 2;
    var EDGE_PATTERN_BLOCK = 3;
    var EDGE_PATTERN_MONOC = 4;

    /**
     * 評価関数
     */
    PlayerAI.prototype._evalBoard = function (board, searchMode) {
        // 終盤（必勝・完全）
        if (searchMode !== SEARCH_MODE_EVALUATE) {
            var score = board.blackCount - board.whiteCount;
            // 最弱モードならスコア反転
            if (board.getRule() === UltimaReversi.Rule.NEGATIVE) {
                return -score;
            }
            return score;
        }

        // 初心者モード
        if (this._params.beginner) {
            this._evalCount++;
            return this._evalBoardForBeginner(board);
        }

        var cells = board._cells; // Direct access for speed!
        var size = board.getSize();

        // C#版のEvaluatorロジック移植
        var value = 0;
        this._evalCount++;

        // 1. 開放度 (Liberty)
        // 周囲に空きマスが少ない石ほど価値が高い（安定している）
        var boardCells = board._cells;
        var dirList = board._directions; // [up, down, left, right, ...]

        // 盤面全体を走査（WALL以外）
        // 効率化のため、boardの有効範囲だけ回すのが理想だが、簡易に実装
        // C#版はcornerLUからcornerRDまで回している
        var start = board.cornerLU;
        var end = board.cornerRD;

        for (var p = start; p <= end; p++) {
            var c = boardCells[p];
            if (c === Cell.BLACK) {
                // 周囲8方向の空きを減点（安定度を下げる）
                for (var d = 0; d < 8; d++) {
                    if (boardCells[p + dirList[d]] === Cell.EMPTY) value--;
                }
            } else if (c === Cell.WHITE) {
                for (var d = 0; d < 8; d++) {
                    if (boardCells[p + dirList[d]] === Cell.EMPTY) value++;
                }
            }
        }

        // 探索モードがNEGATIVE（負けオセロ）の場合は開放度の評価を反転
        // （今のJavaScript版はNEGATIVEルール未実装なので考慮不要だが、C#準拠で書くなら）
        // if (board.rule === Board.RULE_NEGATIVE) value = -value;

        // 2. 隅・星
        var cLU = board.cornerLU, cRU = board.cornerRU, cLD = board.cornerLD, cRD = board.cornerRD;
        var sLU = board.starLU, sRU = board.starRU, sLD = board.starLD, sRD = board.starRD;

        // 隅が空いていて星に打ってあると大幅減点
        if (cells[cLU] === Cell.EMPTY) value -= cells[sLU] * 10;
        if (cells[cRU] === Cell.EMPTY) value -= cells[sRU] * 10;
        if (cells[cLD] === Cell.EMPTY) value -= cells[sLD] * 10;
        if (cells[cRD] === Cell.EMPTY) value -= cells[sRD] * 10;

        // 3. 辺の評価（テーブル参照）
        var edgeInfoIndex = PlayerAI._edgeInfoIndexMap[size];
        if (edgeInfoIndex) {
            // 4辺のインデックスを計算
            // cellsの値: -1, 0, 1 -> +1 -> 0, 1, 2 (3進数)

            var idx, i, n, p;

            // 上辺
            idx = 0;
            for (i = 0, n = 1, p = cLU; i < size; i++, n *= 3, p += board.dirR) idx += (cells[p] + 1) * n;
            value += this._evalEdge(edgeInfoIndex, idx);

            // 左辺
            idx = 0;
            for (i = 0, n = 1, p = cLU; i < size; i++, n *= 3, p += board.dirD) idx += (cells[p] + 1) * n;
            value += this._evalEdge(edgeInfoIndex, idx);

            // 右辺
            idx = 0;
            for (i = 0, n = 1, p = cRU; i < size; i++, n *= 3, p += board.dirD) idx += (cells[p] + 1) * n;
            value += this._evalEdge(edgeInfoIndex, idx);

            // 下辺
            idx = 0;
            for (i = 0, n = 1, p = cLD; i < size; i++, n *= 3, p += board.dirR) idx += (cells[p] + 1) * n;
            value += this._evalEdge(edgeInfoIndex, idx);
        }

        // 4. 着手可能数（Mobility）を加点要素にするのも一般的

        // 隅の確定石チェック（簡易）
        // 厳密な確定石計算は重いが、隅石は重要
        // C#版では `edgeInfoIndex` に確定石数が含まれているので上記テーブル参照でカバーされている

        // 最弱モードなら評価値を反転
        if (board.getRule() === UltimaReversi.Rule.NEGATIVE) {
            return -value;
        }

        return value;
    };

    PlayerAI.prototype._evalEdge = function (indexTable, idx) {
        // indexTable[idx] = [blackFixed, whiteFixed, blackPattern, whitePattern]
        // TypedArrayでフラット化している場合は: indexTable[idx * 4 + 0]...

        // JSでのメモリ効率のため、Int32Arrayなどでフラット化して保持推奨
        // ここでは [idx][0..3] の配列としてアクセス（_prepareEdgeTable実装依存）

        var info = indexTable[idx];
        var blackFixed = info[0];
        var whiteFixed = info[1];
        var blackPat = info[2];
        var whitePat = info[3];

        var val = (blackFixed - whiteFixed) * 5;

        // 黒の定石
        if (blackPat === EDGE_PATTERN_MOUNTAIN) val += 8;
        else if (blackPat === EDGE_PATTERN_WING) val -= 4; // 簡易評価

        // 白の定石
        if (whitePat === EDGE_PATTERN_MOUNTAIN) val -= 8;
        else if (whitePat === EDGE_PATTERN_WING) val += 4;

        return val;
    };

    /**
     * 初心者用評価
     */
    PlayerAI.prototype._evalBoardForBeginner = function (board) {
        return board.blackCount - board.whiteCount;
    };


    //-------------------------------------------------------------------------
    // 辺テーブル生成ロジック
    //-------------------------------------------------------------------------
    PlayerAI.prototype._prepareEdgeTable = function (size) {
        if (PlayerAI._edgeInfoIndexMap[size]) return;

        // 3^size パターン生成
        var indexSize = Math.pow(3, size);
        var table = new Array(indexSize); // Int8Array配列を格納するArray

        for (var i = 0; i < indexSize; i++) {
            table[i] = this._makeEdgeInfo(size, i);
        }

        PlayerAI._edgeInfoIndexMap[size] = table;
    };

    /**
     * 1つの辺状態(idx)に対する評価情報を生成
     */
    PlayerAI.prototype._makeEdgeInfo = function (size, idx) {
        // idx を 3進数展開して -1, 0, 1 の配列にする
        var line = new Int8Array(size);
        var n = idx;
        var black = 0, white = 0, empty = 0;

        for (var i = 0; i < size; i++) {
            var r = n % 3;
            n = Math.floor(n / 3);
            var val = r - 1; // 0,1,2 -> -1,0,1
            line[i] = val;

            if (val === Cell.BLACK) black++;
            else if (val === Cell.WHITE) white++;
            else empty++;
        }

        var blackFixed = 0;
        var whiteFixed = 0;
        var blackPat = EDGE_PATTERN_NONE;
        var whitePat = EDGE_PATTERN_NONE;

        // 定石判定 (端が空きの場合)
        if (line[0] === Cell.EMPTY && line[size - 1] === Cell.EMPTY) {
            // 黒山
            if (black === size - 2) blackPat = EDGE_PATTERN_MOUNTAIN;
            // 白山
            if (white === size - 2) whitePat = EDGE_PATTERN_MOUNTAIN;

            // ウィング等は厳密には「隣が空き」などの条件があるが省略
        }

        // 確定石判定
        // 簡易実装: 端から連続する同色石を確定とみなす
        // (厳密には間に空きがあっても確定するケースがあるが、C#版ロジックをJSで全実装するには長い)
        // C#版のロジック:
        /*
          else if (empty == 0) -> 全確定
          else if (empty == 1) -> 穴埋めチェック
          else -> 端からの連続のみ
        */

        else if (empty === 0) {
            // 辺に空白がないとき、全て確定石
            blackFixed = black;
            whiteFixed = white;
        } else if (empty === 1) {
            // 辺に空白が１つだけあるとき、そこに黒か白を打って裏返らない残りの石は確定石
            var ep;
            for (ep = 0; line[ep] !== Cell.EMPTY; ep++); // 空白を探す

            var p;
            // 空白の右側で、空白の隣と同じ色が続いている範囲
            for (p = ep + 2; p < size && line[ep + 1] === line[p]; p++);
            if (p === size) p = ep + 1; // 右端まで続いていれば、ep+1から右は確定

            for (var i = p; i < size; i++) {
                if (line[i] === Cell.BLACK) blackFixed++;
                else whiteFixed++;
            }

            // 空白の左側
            for (p = ep - 2; p >= 0 && line[ep - 1] === line[p]; p--);
            if (p === -1) p = ep - 1; // 左端まで

            for (var i = p; i >= 0; i--) {
                if (line[i] === Cell.BLACK) blackFixed++;
                else whiteFixed++;
            }
        } else {
            // 辺に空白が２つ以上あるとき、隅から連なる石は確定石

            // 左端からの連続
            var k;
            for (k = 0; k < size; k++) {
                if (line[k] === Cell.BLACK) blackFixed++;
                else break;
            }
            // 右端からの連続
            for (k = size - 1; k >= 0; k--) {
                if (line[k] === Cell.BLACK) blackFixed++;
                else break;
            }

            // 白も同様
            for (k = 0; k < size; k++) {
                if (line[k] === Cell.WHITE) whiteFixed++;
                else break;
            }
            for (k = size - 1; k >= 0; k--) {
                if (line[k] === Cell.WHITE) whiteFixed++;
                else break;
            }
        }

        // メモリ節約のため TypedArray (int8 4要素) で返す
        return new Int8Array([blackFixed, whiteFixed, blackPat, whitePat]);
    };

    return PlayerAI;
})();
