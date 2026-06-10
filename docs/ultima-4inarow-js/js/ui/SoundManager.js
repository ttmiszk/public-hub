/**
 * SoundManager - 音声管理
 */
var Ultima4InARow = Ultima4InARow || {};

Ultima4InARow.SoundManager = (function () {
    function SoundManager() {
        this.sounds = {};
        this.enabled = true;
        this._loadSounds();
    }

    SoundManager.prototype._loadSounds = function () {
        var audioFiles = {
            'move': 'assets/sounds/move.mp3',
            'win': 'assets/sounds/game_end_clap.mp3',
            'lose': 'assets/sounds/game_end_aaah.mp3',
            'draw': 'assets/sounds/game_end_bell.mp3',
            'undo': 'assets/sounds/undo.mp3'
        };

        for (var key in audioFiles) {
            this.sounds[key] = new Audio(audioFiles[key]);
            this.sounds[key].load();
        }
    };

    SoundManager.prototype.play = function (key) {
        if (!this.enabled || !this.sounds[key]) return;

        // 再生位置をリセットして再生
        this.sounds[key].currentTime = 0;
        this.sounds[key].play().catch(function (e) {
            console.log('Audio play failed:', e);
        });
    };

    return SoundManager;
})();
