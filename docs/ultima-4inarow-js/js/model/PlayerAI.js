/**
 * PlayerAI - AIプレイヤー
 * Alpha-Beta法による実装
 */
var Ultima4InARow = Ultima4InARow || {};

Ultima4InARow.PlayerAI = (function () {
    var Player = Ultima4InARow.Player;
    var Board = Ultima4InARow.Board;
    var Cell = Ultima4InARow.Cell;

    // 定数
    var MIN_LEVEL = 1;
    var MAX_LEVEL = 10;

    // 探索モード
    var SEARCH_MODE_EVALUATE = 0;
    var SEARCH_MODE_VICTORY = 1;
    var SEARCH_MODE_COMPLETE = 2;

    function PlayerAI(name, level) {
        Player.call(this, name);
        this.level = Math.max(MIN_LEVEL, Math.min(level, MAX_LEVEL));

        // レベル別パラメータ (C#版のPlayerCPU.Createをベースに調整)
        // opening: 序盤の深度
        // middle: 中盤の深度
        // victory: 必勝読み開始手数
        // complete: 完全読み開始手数

        // Web対応のため、C#版より少し深度を控えめにするか、Workerを使う前提で同等にするか。
        // Reversi JSの実装を見る限り、Asyncでメインスレッドで動かしている（awaitでYield）。
        // 4 in a Row はオセロより分岐係数が少ない(max 7)ので、ある程度深くても行けるはず。

        this.params = this._getLevelParams(this.level);
    }

    // 継承
    PlayerAI.prototype = Object.create(Player.prototype);
    PlayerAI.prototype.constructor = PlayerAI;

    PlayerAI.create = function (name, level) {
        return new PlayerAI(name, level);
    };

    PlayerAI.prototype.isAI = function () {
        return true;
    };

    // レベルパラメータ取得
    PlayerAI.prototype._getLevelParams = function (level) {
        // C#版のパラメータ (PlayerCPU.cs Create method)
        // 配列で定義されているため、確率は配列内の要素数で表現する
        switch (level) {
            case 1:
                return { op: [0, 0, 0, 0, 1, 1, 1, 1, 1, 1], mid: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1], v: 1, c: 1 };
            case 2:
                return { op: [0, 0, 1, 1, 1, 1, 1, 2, 2, 2], mid: [0, 0, 0, 0, 0, 1, 1, 2, 2, 2], v: 1, c: 1 };
            case 3:
                return { op: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2], mid: [0, 0, 0, 0, 1, 1, 2, 2, 2, 2], v: 2, c: 1 };
            case 4:
                return { op: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2], mid: [0, 0, 0, 1, 2, 2, 2, 3, 3, 3], v: 4, c: 2 };
            case 5:
                return { op: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3], mid: [0, 0, 1, 1, 2, 2, 2, 3, 3, 3], v: 6, c: 4 };
            case 6:
                return { op: [1, 1, 2, 2, 3, 3, 3, 4, 4, 4], mid: [0, 1, 2, 2, 3, 3, 3, 4, 4, 4], v: 8, c: 6 };
            case 7:
                return { op: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5], mid: [2, 2, 3, 3, 4, 4, 5, 5, 6, 6], v: 10, c: 8 };
            case 8:
                return { op: [4, 4, 4, 4, 5, 5, 6, 6, 7, 7], mid: [6, 6, 6, 6, 7, 7, 7, 7, 8, 8], v: 12, c: 10 };
            case 9:
                return { op: [6, 6, 6, 6, 7, 7, 7, 7, 8, 8], mid: [7, 7, 7, 7, 8, 8, 8, 8, 9, 9], v: 14, c: 12 };
            case 10: // Strongest
                return { op: [7, 7, 7, 7, 8, 8, 8, 8, 9, 9], mid: [9, 9, 10, 10, 10, 10, 11, 11, 11, 11], v: 16, c: 14 };
            default:
                // Default to Max Level if unknown
                return { op: [7, 7, 7, 7, 8, 8, 8, 8, 9, 9], mid: [9, 9, 10, 10, 10, 10, 11, 11, 11, 11], v: 16, c: 14 };
        }
    };

    PlayerAI.prototype.stopThinking = function () {
        this._stopRequested = true;
    };

    /**
     * 思考開始 (非同期)
     * @param {Board} board 現在の盤面
     * @param {function} callback 完了時コールバック (pos)
     * @param {function} onProgress 進捗コールバック (0.0 - 1.0)
     */
    PlayerAI.prototype.think = function (board, callback, onProgress) {
        this._stopRequested = false;
        var self = this;

        // 次のイベントループで実行
        setTimeout(function () {
            self._thinkAsync(board, onProgress).then(function (result) {
                // result: { bestPos: number, eval: number, count: number, isRandom: boolean, depth: number, mode: string }
                // Log result (e.g., "[P2] [AI Move] Pos=4 ...")
                var playerLabel = (board.turn === Cell.PLAYER1) ? "[P1]" : "[P2]";
                var col = board.toX(result.bestPos) + 1; // 1-based

                if (result.isRandom) {
                    console.log(playerLabel + " [AI Move] Pos=" + col + " (random)");
                } else {
                    console.log(playerLabel + " [AI Move] Pos=" + col + " (α-β search: Eval=" + result.eval + ", Count=" + result.count + ")");
                }

                callback(result.bestPos);
            }).catch(function (err) {
                console.error("AI Error:", err);
                callback(-1);
            });
        }, 0);
    };

    PlayerAI.prototype._thinkAsync = async function (board, onProgress) {
        var emptyCount = board.getEmptyCount();
        var p = this.params;
        var depth, searchMode;
        var searchModeStr = "EVALUATE";

        if (emptyCount <= p.c) {
            searchMode = SEARCH_MODE_COMPLETE;
            searchModeStr = "COMPLETE";
            depth = emptyCount;
        } else if (emptyCount <= p.v) {
            searchMode = SEARCH_MODE_VICTORY;
            searchModeStr = "VICTORY";
            depth = emptyCount;
        } else if (emptyCount < 30) {
            searchMode = SEARCH_MODE_EVALUATE;
            depth = p.mid[Math.floor(Math.random() * p.mid.length)];
        } else {
            searchMode = SEARCH_MODE_EVALUATE;
            depth = p.op[Math.floor(Math.random() * p.op.length)];
        }

        var playerLabel = (board.turn === Cell.PLAYER1) ? "[P1]" : "[P2]";
        console.log(playerLabel + " [AI Thinking] Level=" + this.level + ", Depth=" + depth + ", Mode=" + searchMode + " (" + searchModeStr + ")");

        if (depth <= 0) {
            // ランダム
            var moves = board.getValidMoves();
            if (moves.length === 0) return { bestPos: -1, isRandom: true };
            var bestPos = moves[Math.floor(Math.random() * moves.length)];
            return { bestPos: bestPos, isRandom: true };
        }

        // Alpha-Beta探索
        var rootTurn = board.turn;
        var bestPos = -1;
        var value = -Infinity;
        var alpha = -Infinity;
        var beta = Infinity;
        this._nodeCount = 0; // Initialize counter

        var moves = board.getValidMoves();
        var len = moves.length;

        for (var i = 0; i < len; i++) {
            if (this._stopRequested) break;

            var pos = moves[i];
            board.move(pos);
            this._nodeCount++;

            if (onProgress) onProgress((i + 1) / len);
            await new Promise(r => setTimeout(r, 0));

            var childValue = await this._alphaBeta(board, depth - 1, alpha, beta, rootTurn, searchMode);
            board.undo();

            if (childValue > value) {
                value = childValue;
                bestPos = pos;
            }

            if (value > alpha) {
                alpha = value;
            }

            if (value >= beta) {
                break;
            }
        }

        return { bestPos: bestPos, eval: value, count: this._nodeCount, isRandom: false, depth: depth, mode: searchModeStr };
    };

    /**
     * AlphaBeta再帰
     * rootTurn: 探索開始時の手番（AIの手番）
     * 常に rootTurn 視点の評価値を返す (NegaMax形式ではないC#版の実装を踏襲)
     */
    PlayerAI.prototype._alphaBeta = async function (board, depth, alpha, beta, rootTurn, searchMode) {
        // 終局判定 / 深さ制限
        var status = board.getStatus();
        if (status !== Board.STS_RUNNING || depth === 0) {
            return this._evalBoard(board, rootTurn, searchMode);
        }

        var isMyTurn = (board.turn === rootTurn);
        var moves = board.getValidMoves();

        // C#版の Move Ordering は深さ>2で実施。
        // ここでは一旦省略。verifyOrder順だけで十分強力。

        var value = isMyTurn ? -Infinity : Infinity;

        for (var i = 0; i < moves.length; i++) {
            if (this._stopRequested) break;

            var pos = moves[i];

            board.move(pos);
            this._nodeCount++;
            var childValue = await this._alphaBeta(board, depth - 1, alpha, beta, rootTurn, searchMode);
            board.undo();

            if (isMyTurn) {
                // Maxノード (AIの手番)
                if (childValue > value) {
                    value = childValue;
                    // Victoryモードなら、勝てる手が見つかった時点で打ち切り
                    if (searchMode === SEARCH_MODE_VICTORY && value > 9000) { // 9000は勝ち相当の閾値
                        return value;
                    }
                }
                alpha = Math.max(alpha, value);
                if (value >= beta) break; // Betaカット
            } else {
                // Minノード (相手の手番)
                if (childValue < value) {
                    value = childValue;
                    if (searchMode === SEARCH_MODE_VICTORY && value < -9000) { // 負け確定
                        return value;
                    }
                }
                beta = Math.min(beta, value);
                if (value <= alpha) break; // Alphaカット
            }
        }
        return value;
    };

    /**
     * 評価関数
     * rootTurn 視点での評価値を返す
     */
    PlayerAI.prototype._evalBoard = function (board, rootTurn, searchMode) {
        var status = board.getStatus();

        // 1. 終局判定
        if (status !== Board.STS_RUNNING) {
            // 勝者判定
            // Cell.PLAYER1 = 1, PLAYER2 = 2
            // status: PLAYER1_WON=1, PLAYER2_WON=2, DRAWN=0

            var winner = (status === Board.STS_END_GAME_PLAYER1_WON) ? Cell.PLAYER1 :
                (status === Board.STS_END_GAME_PLAYER2_WON) ? Cell.PLAYER2 : null;

            if (winner === rootTurn) return 100000 + board.getEmptyCount(); // 早く勝つ方が良い
            if (winner !== null) return -100000 - board.getEmptyCount();    // 遅く負ける方が良い
            return 0; // 引き分け
        }

        // 2. 盤面評価 (Evaluate Mode)
        // C#版のロジックをJSに移植

        // C#版EvalBoardロジック:
        // 全EVAL_LINESについて、(自分の石数, 相手の石数) を数える
        // 相手の石が0個なら、自分の石数に応じて加点 (3個なら高得点)
        // 自分の石が0個なら、相手の石数に応じて減点
        // 「emptyCellBottom」: ラインの下が空いているか (次に置けるか?) も考慮

        var score = 0;
        var lines = Board.EVAL_LINES;
        var myDisk = rootTurn;
        var opDisk = (myDisk === Cell.PLAYER1) ? Cell.PLAYER2 : Cell.PLAYER1;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];

            // 高速化のため getLineStatus を使わずインライン展開
            var c0 = board._cells[line[0]];
            var c1 = board._cells[line[1]];
            var c2 = board._cells[line[2]];
            var c3 = board._cells[line[3]];

            var myCnt = 0;
            var opCnt = 0;
            var emptyBottom = true;

            // Check cells
            // Bottom check is specific to "gravity". 
            // In C#: if (emptyCellBottom && board.cell[evalLine[j] + Board.DIR_D] == Board.EMPTY)
            // つまり、ラインの各マスの下(DIR_D)が空なら、そこにはまだ置けない(浮いている)。
            // 「下」が埋まっている(=置ける)かどうか。
            // 4 in a Row では「リーチ」があっても、その下のマスが埋まっていないと置けない。
            // 逆に、相手のリーチの下が空いている場合、自分がそこに打たなければ相手は置けない＝安全。
            // ただし、自分がその「下」に打つと相手に打たれて負ける（穴熊?）。

            // 各セルについて計算
            function checkCell(c, pos) {
                if (c === myDisk) myCnt++;
                else if (c === opDisk) opCnt++;

                // 下が空いてるか？
                // DIR_D = SIZE_X + 1
                var downPos = pos + (Board.SIZE_X + 1);
                // board._cells[downPos] が EMPTY なら、pos は「浮いている」
                if (board._cells[downPos] === Cell.EMPTY) return false;
                return true;
            }

            // ライン全体が「着手可能圏内」かどうかの簡易判定として emptyCellBottom を使うか？
            // C#版のロジックを忠実に再現する
            /*
                emptyCellBottom = true;
                Loop 4 cells:
                   if cell is specific_disk: count++
                   else if emptyCellBottom && cell_down is empty: emptyCellBottom = false
            */

            // ここでは簡易化して、「ライン上の空きマスのうち、直下に空きがあるものがあるか」チェック
            // もしあれば、そのラインは「完成しにくい」あるいは「相手に利用されにくい」

            // 実装簡略化:
            var my = 0, op = 0, float = 0;

            var check = function (idx) {
                var c = board._cells[line[idx]];
                if (c === myDisk) my++;
                else if (c === opDisk) op++;
                else {
                    // 空きマスの場合、下が空いてるかチェック
                    // 下が空いていれば float++
                    if (board._cells[line[idx] + (Board.SIZE_X + 1)] === Cell.EMPTY) float++;
                }
            };

            check(0); check(1); check(2); check(3);

            // 評価
            if (op === 0) {
                // 自分のチャンス
                if (my === 3) {
                    // リーチ
                    score += (float === 0) ? 1000 : 100; // すぐ置けるなら特大
                } else if (my === 2) {
                    score += (float === 0) ? 100 : 10;
                } else if (my === 1) {
                    score += 1;
                }
            } else if (my === 0) {
                // 相手のチャンス -> 減点
                if (op === 3) {
                    score -= (float === 0) ? 10000 : 100; // すぐ置かれるなら即死級
                    // ※相手リーチかつ float===0 なら、次の相手の手番で死ぬということ。
                } else if (op === 2) {
                    score -= (float === 0) ? 100 : 10;
                } else if (op === 1) {
                    score -= 1;
                }
            }
        }

        return score;
    };

    return PlayerAI;
})();
