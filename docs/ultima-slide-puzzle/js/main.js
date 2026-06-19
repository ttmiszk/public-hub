document.addEventListener('DOMContentLoaded', () => {
	// デフォルトサイズ 5 (5x5) でゲームのコアインスタンスを作成
	const game = new SlidePuzzle(5);
	
	// UIコントローラを初期化し、ゲームインスタンスと連携
	const ui = new PuzzleUI(game);

	// レスポンシブ描画サポート: ウィンドウサイズ変更時に盤面を再レンダリングする
	// (主に画像モードにおける各ピースの background-size/position のサイズ再計算のため)
	let resizeTimeout;
	window.addEventListener('resize', () => {
		ui.resizeApp();
		clearTimeout(resizeTimeout);
		resizeTimeout = setTimeout(() => {
			ui.render();
		}, 150);
	});
});
