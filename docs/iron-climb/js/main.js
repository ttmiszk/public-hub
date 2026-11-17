import { Game } from './game.js';

/**
 * IRON CLIMB アプリケーションエントリーポイント
 */
function bootstrap() {
	const canvas = document.getElementById('game-canvas');
	if (!canvas) {
		console.error('描画用キャンバス (#game-canvas) が見つかりません。');
		return;
	}

	try {
		const game = new Game(canvas);
		game.start();
	} catch (error) {
		console.error('ゲームの初期化に失敗しました:', error);
		const titleTagline = document.querySelector('.game-tagline');
		if (titleTagline) {
			titleTagline.textContent = 'WebGLの初期化に失敗しました。ブラウザ設定をご確認ください。';
		}
	}
}

window.addEventListener('DOMContentLoaded', bootstrap);
