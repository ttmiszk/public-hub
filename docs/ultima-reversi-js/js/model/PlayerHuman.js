/**
 * PlayerHuman - 人間プレイヤークラス
 */
var UltimaReversi = UltimaReversi || {};

/**
 * 人間プレイヤークラス
 */
UltimaReversi.PlayerHuman = (function () {
    var Player = UltimaReversi.Player;

    /**
     * コンストラクタ
     * @param {string} name - プレイヤー名
     */
    function PlayerHuman(name) {
        Player.call(this, name);
    }

    // Playerを継承
    PlayerHuman.prototype = Object.create(Player.prototype);
    PlayerHuman.prototype.constructor = PlayerHuman;

    /**
     * 人間プレイヤーを生成（ファクトリメソッド）
     */
    PlayerHuman.create = function (name) {
        return new PlayerHuman(name);
    };

    /**
     * 人間プレイヤーかどうか
     */
    PlayerHuman.prototype.isHuman = function () {
        return true;
    };

    /**
     * AIプレイヤーかどうか
     */
    PlayerHuman.prototype.isAI = function () {
        return false;
    };

    /**
     * 着手通知
     * @param {Board} board
     * @param {number} x
     * @param {number} y
     */
    PlayerHuman.prototype.onMove = function (board, x, y) {
        var Cell = UltimaReversi.Cell;
        var posStr = board.toCoordinateString(x, y);
        var colorStr = (board.getTurn() === Cell.BLACK) ? "[黒]" : "[白]";
        console.log(`${colorStr} [Human Move] Pos=${posStr}`);
    };

    return PlayerHuman;
})();
