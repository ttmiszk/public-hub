/**
 * @fileoverview main.js
 * ゲームのエントリーポイント。DOM読み込み後にGameインスタンスを生成・開始する。
 */
window.addEventListener('DOMContentLoaded', () => {
    // AudioManager の初期化とデータ読み込み
    window.audioManager = new AudioManager();
    window.audioManager.loadData(AudioData.seDefinitions, AudioData.bgmDefinitions);

    const game = new Game();
    game.init();
    
    // グローバルアクセス可能にしてデバッグしやすくする（開発用）
    window.game = game;
});
