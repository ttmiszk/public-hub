/**
 * Player - プレイヤークラス（基底）
 */
var Ultima4InARow = Ultima4InARow || {};

Ultima4InARow.Player = (function () {
    function Player(name) {
        this.name = name;
    }

    Player.prototype.getName = function () {
        return this.name;
    };

    Player.prototype.isAI = function () {
        return false;
    };

    return Player;
})();


