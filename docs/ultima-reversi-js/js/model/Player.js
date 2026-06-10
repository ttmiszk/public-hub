/**
 * Player - プレイヤー基底クラス
 * 
 * PlayerHumanとPlayerAIの共通インターフェースを定義。
 */
var UltimaReversi = UltimaReversi || {};

/**
 * プレイヤー基底クラス
 */
UltimaReversi.Player = (function () {

    /**
     * コンストラクタ
     * @param {string} name - プレイヤー名
     */
    function Player(name) {
        this._name = name;
    }

    /**
     * プレイヤー名を取得
     */
    Player.prototype.getName = function () {
        return this._name;
    };

    /**
     * 人間プレイヤーかどうか（サブクラスでオーバーライド）
     */
    Player.prototype.isHuman = function () {
        return false;
    };

    /**
     * AIプレイヤーかどうか（サブクラスでオーバーライド）
     */
    Player.prototype.isAI = function () {
        return false;
    };

    return Player;
})();
