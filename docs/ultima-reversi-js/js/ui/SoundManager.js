/**
 * SoundManager - 音声管理クラス
 */
var UltimaReversi = UltimaReversi || {};

UltimaReversi.SoundManager = (function () {

    // 音声ファイルのマップ
    var SOUND_FILES = {
        pass: 'assets/sounds/pass.mp3',
        putstone: 'assets/sounds/putstone.mp3',
        putstone_corner: 'assets/sounds/putstone_corner.mp3',
        undo: 'assets/sounds/undo.mp3',
        game_end_aaah: 'assets/sounds/game_end_aaah.mp3',
        game_end_clap: 'assets/sounds/game_end_clap.mp3',
        game_end_bell: 'assets/sounds/game_end_bell.mp3',
        revolution: 'assets/sounds/revolution.mp3'
    };

    /**
     * コンストラクタ
     */
    function SoundManager() {
        this._sounds = {};
        this._enabled = true; // 将来的なミュート機能用
        this._loadSounds();
    }

    /**
     * 音声をロード
     */
    SoundManager.prototype._loadSounds = function () {
        var key;
        for (key in SOUND_FILES) {
            if (SOUND_FILES.hasOwnProperty(key)) {
                this._sounds[key] = new Audio(SOUND_FILES[key]);
                this._sounds[key].load(); // プリロード
            }
        }
    };

    /**
     * 音声を再生
     * @param {string} key - 再生する音声のキー
     */
    SoundManager.prototype._play = function (key) {
        if (!this._enabled) return;

        var sound = this._sounds[key];
        if (sound) {
            // 連続再生のために時間をリセット
            sound.currentTime = 0;
            sound.play().catch(function (e) {
                console.log("Audio play failed (interaction required?):", e);
            });
        }
    };

    // 公開API
    SoundManager.prototype.playPass = function () { this._play('pass'); };
    SoundManager.prototype.playPutStone = function () { this._play('putstone'); };
    SoundManager.prototype.playPutStoneCorner = function () { this._play('putstone_corner'); };
    SoundManager.prototype.playUndo = function () { this._play('undo'); };
    SoundManager.prototype.playGameEndAaah = function () { this._play('game_end_aaah'); };
    SoundManager.prototype.playGameEndClap = function () { this._play('game_end_clap'); };
    SoundManager.prototype.playGameEndBell = function () { this._play('game_end_bell'); };
    SoundManager.prototype.playRevolution = function () { this._play('revolution'); };

    return SoundManager;
})();
