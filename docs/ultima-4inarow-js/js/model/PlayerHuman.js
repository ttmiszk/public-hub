/**
 * PlayerHuman - 人間プレイヤー
 */
var Ultima4InARow = Ultima4InARow || {};

Ultima4InARow.PlayerHuman = (function () {
    var Player = Ultima4InARow.Player;

    function PlayerHuman(name) {
        Player.call(this, name);
    }

    // 継承
    PlayerHuman.prototype = Object.create(Player.prototype);
    PlayerHuman.prototype.constructor = PlayerHuman;

    PlayerHuman.create = function (name) {
        return new PlayerHuman(name);
    }

    /**
     * 着手通知
     * @param {Board} board
     * @param {number} col
     */
    PlayerHuman.prototype.onMove = function (board, col) {
        var Cell = Ultima4InARow.Cell;
        // Human Move Log
        var playerLabel = (board.turn === Cell.PLAYER1) ? "[P1]" : "[P2]";
        console.log(playerLabel + " [Human Move] Pos=" + (col + 1));
    };

    return PlayerHuman;
})();
