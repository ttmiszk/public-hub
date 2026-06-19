/**
	* Ultima Slide Puzzle - UI & Event Controller (Refined)
	* DOM操作、描画、アニメーション、およびイベントハンドリングを担当するクラス
	*/
class PuzzleUI {
	/**
		* @param {SlidePuzzle} game SlidePuzzle インスタンス
		*/
	constructor(game) {
		this.game = game;
		this.timerIntervalId = null;
		
		// 画像設定 (urlがnullの場合は通常の数字モード)
		this.imageSettings = {
			url: null,
			showGuides: true
		};

		// モーダル内で一時的に選択されている画像データ
		this.tempModalImage = null;

		this.initElements();
		this.resizeApp();
		this.initEvents();
		this.loadSavedTheme();
		this.updateImageConfigUI();
		this.updateActionButtons();
		this.updateSizeButtonsState();
		this.render();
	}

	/**
		* DOM要素の参照を初期化する
		*/
	initElements() {
		this.appStage = document.getElementById('app-stage');
		this.appContainer = document.getElementById('app-container');
		this.board = document.getElementById('board');
		this.movesValue = document.getElementById('moves-value');
		this.timerValue = document.getElementById('timer-value');
		
		// 基本コントロール
		this.btnShuffle = document.getElementById('btn-shuffle');
		this.btnReset = document.getElementById('btn-reset');
		this.btnCloseOverlay = document.getElementById('btn-close-overlay');
		
		// クリアオーバーレイ
		this.solvedOverlay = document.getElementById('solved-overlay');
		this.solvedMoves = document.getElementById('solved-moves');
		this.solvedTime = document.getElementById('solved-time');
		
		// 各種セレクター・トグルボタン
		this.themeButtons = document.querySelectorAll('.theme-btn');
		this.sizeButtons = document.querySelectorAll('.size-btn');

		// --- リファイン用追加要素 ---
		this.btnOpenImageModal = document.getElementById('btn-open-image-modal');
		this.chkShowNumbers = document.getElementById('chk-show-numbers');
		
		// 画像選択モーダルダイアログ関連
		this.modalOverlay = document.getElementById('image-modal-overlay');
		this.modalPreviewBox = document.getElementById('modal-preview-box');
		this.modalPreviewPlaceholder = document.getElementById('modal-preview-placeholder');
		this.modalFileInput = document.getElementById('modal-file-input');
		
		this.btnModalUpload = document.getElementById('btn-modal-upload');
		this.btnModalRemove = document.getElementById('btn-modal-remove');
		this.btnModalCancel = document.getElementById('btn-modal-cancel');
		this.btnModalApply = document.getElementById('btn-modal-apply');

		// --- 独自リセット確認モーダル関連 ---
		this.resetConfirmModal = document.getElementById('reset-confirm-modal');
		this.btnResetCancel = document.getElementById('btn-reset-cancel');
		this.btnResetConfirm = document.getElementById('btn-reset-confirm');

		// --- 情報モーダル関連 ---
		this.infoModal = document.getElementById('info-modal');
		this.btnOpenInfoModal = document.getElementById('btn-open-info-modal');
		this.btnInfoClose = document.getElementById('btn-info-close');
	}

	/**
		* イベントリスナーを設定する
		*/
	initEvents() {
		// 盤面クリックイベント（デリゲーション）
		this.board.addEventListener('click', (e) => {
			const tile = e.target.closest('.tile');
			if (!tile || tile.classList.contains('tile-empty')) return;
			
			const index = parseInt(tile.dataset.index, 10);
			this.handleTileClick(index);
		});

		// キーボード操作
		document.addEventListener('keydown', (e) => {
			let moved = false;
			let dir = null;

			if (e.key === 'ArrowUp' || e.key === 'w') dir = 'up';
			else if (e.key === 'ArrowDown' || e.key === 's') dir = 'down';
			else if (e.key === 'ArrowLeft' || e.key === 'a') dir = 'left';
			else if (e.key === 'ArrowRight' || e.key === 'd') dir = 'right';

			if (dir) {
				// FLIPアニメーションを伴って移動を実行
				this.animateAndMove(() => this.game.moveByDirection(dir));
			}
		});

		// シャッフル・リセット・Closeボタン
		this.btnShuffle.addEventListener('click', () => this.startNewGame());
		
		this.btnReset.addEventListener('click', () => {
			// 進行中のリセットの場合は、独自モーダルを開く
			if (this.game.isGameActive) {
				this.resetConfirmModal.classList.add('active');
			} else {
				// 万が一待機状態の時（通常は非表示）はそのままリセット
				this.executeReset();
			}
		});

		// 独自リセットモーダルのキャンセルボタン
		this.btnResetCancel.addEventListener('click', () => {
			this.resetConfirmModal.classList.remove('active');
		});

		// 独自リセットモーダルの確定リセットボタン
		this.btnResetConfirm.addEventListener('click', () => {
			this.resetConfirmModal.classList.remove('active');
			this.executeReset();
		});
		
		this.btnCloseOverlay.addEventListener('click', () => {
			this.solvedOverlay.classList.remove('active');
		});

		// テーマ選択ボタン
		this.themeButtons.forEach(btn => {
			btn.addEventListener('click', (e) => {
				const theme = e.target.dataset.theme;
				this.applyTheme(theme);
			});
		});

		// 盤面サイズ選択ボタン
		this.sizeButtons.forEach(btn => {
			btn.addEventListener('click', (e) => {
				// ボタンがdisabled状態の時は処理を通さない
				if (e.target.disabled) return;
				
				const size = parseInt(e.target.dataset.size, 10);
				this.changeGridSize(size);
			});
		});

		// --- 情報モーダルイベント ---
		this.btnOpenInfoModal.addEventListener('click', () => {
			this.infoModal.classList.add('active');
		});

		this.btnInfoClose.addEventListener('click', () => {
			this.infoModal.classList.remove('active');
		});

		// --- 画像設定コントロール ---
		
		// 画像選択モーダルを開く
		this.btnOpenImageModal.addEventListener('click', () => {
			this.openImageModal();
		});

		// ガイド数字表示切替チェックボックス
		this.chkShowNumbers.addEventListener('change', (e) => {
			this.imageSettings.showGuides = e.target.checked;
			this.render();
		});

		// --- モーダル内のコントロール ---

		// ファイル選択トリガー
		this.btnModalUpload.addEventListener('click', () => {
			this.modalFileInput.click();
		});

		// ファイル選択
		this.modalFileInput.addEventListener('change', (e) => {
			const file = e.target.files[0];
			if (file) {
				this.handleModalImageUpload(file);
			}
		});

		// モーダル画像解除
		this.btnModalRemove.addEventListener('click', () => {
			this.tempModalImage = null;
			this.updateModalPreview();
		});

		// モーダルキャンセル
		this.btnModalCancel.addEventListener('click', () => {
			this.closeImageModal();
		});

		// モーダル確定（Apply）➔ シームレス反映
		this.btnModalApply.addEventListener('click', () => {
			this.imageSettings.url = this.tempModalImage;
			this.updateImageConfigUI();
			this.closeImageModal();
			this.render(); // 進行中のゲーム状態を壊さずにその場で再描画
		});
	}

	/**
		* ゲームを開始する（シャッフルしてタイマーを開始）
		*/
	startNewGame() {
		this.solvedOverlay.classList.remove('active');
		this.game.shuffle();
		this.startTimer();
		this.updateActionButtons();
		this.updateSizeButtonsState();
		this.updateIndicators();
		this.render();
	}

	/**
		* ピースをクリックしたときの処理
		* @param {number} index
		*/
	handleTileClick(index) {
		this.animateAndMove(() => this.game.move(index));
	}

	/**
		* FLIPパターンに基づくタイルの滑らかなスライドアニメーション移動処理
		* @param {function} moveFn 移動を実行してbooleanを返す関数
		*/
	animateAndMove(moveFn) {
		if (!this.game.isGameActive) return;

		// 1. FIRST: 移動前の各タイルの画面上の絶対位置を記録
		const tilesData = [];
		const tileElements = this.board.querySelectorAll('.tile');
		
		tileElements.forEach(el => {
			const val = el.dataset.value;
			if (val && val !== '0') {
				const rect = el.getBoundingClientRect();
				tilesData.push({
					value: val,
					rect: rect
				});
			}
		});

		// 2. 移動を実行
		const moved = moveFn();
		if (!moved) return;

		// 3. LAST: 盤面データを更新してDOMを再構築
		this.render();

		// 4. INVERT & PLAY: 新しい配置のDOMと元の位置の差分を計算してアニメーションを実行
		const newTileElements = this.board.querySelectorAll('.tile');
		
		newTileElements.forEach(el => {
			const val = el.dataset.value;
			if (val && val !== '0') {
				// 移動前のデータを探す
				const oldData = tilesData.find(d => d.value === val);
				if (oldData) {
					const newRect = el.getBoundingClientRect();
					
					// 移動前と移動後の差分を算出
					const dX = oldData.rect.left - newRect.left;
					const dY = oldData.rect.top - newRect.top;

					// 差分が0でない（実際に位置が動いた）場合のみアニメーションを適用
					if (dX !== 0 || dY !== 0) {
						// 一時的に古い位置に強制ワープ (transitionなし)
						el.style.transition = 'none';
						el.style.transform = `translate(${dX}px, ${dY}px)`;
						el.style.zIndex = '5'; // 重なり順を上にする

						// 1フレーム後に transition を有効にして新しい位置(translate(0,0))へスライドさせる
						requestAnimationFrame(() => {
							// style.css に定義された transition スタイルを割り当て
							el.style.transition = 'transform 130ms cubic-bezier(0.25, 1, 0.5, 1)';
							el.style.transform = 'translate(0, 0)';
							
							// アニメーション完了後にスタイルをクリア
							setTimeout(() => {
								el.style.transition = '';
								el.style.transform = '';
								el.style.zIndex = '';
							}, 130);
						});
					}
				}
			}
		});

		// クリア判定
		this.checkGameClear();
	}

	/**
		* 盤面のサイズを変更する
		* @param {number} size
		*/
	changeGridSize(size) {
		this.sizeButtons.forEach(btn => {
			const active = parseInt(btn.dataset.size, 10) === size;
			btn.classList.toggle('active', active);
		});
		
		this.game.setSize(size);
		this.stopTimer();
		this.solvedOverlay.classList.remove('active');
		this.updateActionButtons();
		this.updateSizeButtonsState();
		this.updateIndicators();
		this.render();
	}

	/**
		* タイマーを開始する
		*/
	startTimer() {
		this.stopTimer();
		this.timerIntervalId = setInterval(() => {
			this.game.updateElapsedTime();
			this.updateStatusDisplay();
		}, 1000);
	}

	/**
		* タイマーを停止する
		*/
	stopTimer() {
		if (this.timerIntervalId) {
			clearInterval(this.timerIntervalId);
			this.timerIntervalId = null;
		}
	}

	/**
		* テーマを適用する (Light, Dark, Pop)
		* @param {string} theme
		*/
	applyTheme(theme) {
		document.body.className = `theme-${theme}`;
		localStorage.setItem('ultima-puzzle-theme', theme);

		this.themeButtons.forEach(btn => {
			btn.classList.toggle('active', btn.dataset.theme === theme);
		});
		this.updateIndicators();
	}

	/**
		* ローカルストレージからテーマを読み込んで適用する
		*/
	loadSavedTheme() {
		const savedTheme = localStorage.getItem('ultima-puzzle-theme') || 'light';
		this.applyTheme(savedTheme);
	}

	/**
		* ゲーム進行状況に応じて、下部のアクションボタンの表示・非表示を動的に切り替える
		* (ゲーム中ならResetのみ、ゲーム開始前/クリア後はShuffleのみ)
		*/
	updateActionButtons() {
		if (this.game.isGameActive) {
			this.btnShuffle.style.display = 'none';
			this.btnReset.style.display = 'block';
		} else {
			this.btnShuffle.style.display = 'block';
			this.btnReset.style.display = 'none';
		}
	}

	/**
		* ゲーム進行状況に応じて、サイズ変更ボタンの有効・無効を動的に切り替える
		* (ゲーム中なら変更不可にする)
		*/
	updateSizeButtonsState() {
		const isGameActive = this.game.isGameActive;
		this.sizeButtons.forEach(btn => {
			btn.disabled = isGameActive;
		});
	}

	/**
		* 実際のゲームリセット処理を実行し、UI状態を初期同期する
		*/
	executeReset() {
		this.game.reset();
		this.stopTimer();
		this.updateActionButtons();
		this.updateSizeButtonsState();
		this.updateIndicators();
		this.render();
	}

	/**
		* パズル画像設定パネル（Show Numbers等）の活性/非活性や文言を更新
		*/
	updateImageConfigUI() {
		const hasImage = this.imageSettings.url !== null;
		
		// 画像ありの時のみ「Show Numbers」を活性化
		this.chkShowNumbers.disabled = !hasImage;
		
		// Set Image ボタンのテキストの調整
		this.btnOpenImageModal.textContent = hasImage ? 'Change Image' : 'Set Image';
		this.btnOpenImageModal.classList.toggle('btn-primary', !hasImage);
	}

	/**
		* 画像選択モーダルを開く
		*/
	openImageModal() {
		// 現在設定されている画像データを一時状態にコピー
		this.tempModalImage = this.imageSettings.url;
		this.updateModalPreview();
		
		this.modalOverlay.classList.add('active');
	}

	/**
		* 画像選択モーダルを閉じる
		*/
	closeImageModal() {
		this.modalOverlay.classList.remove('active');
		this.modalFileInput.value = ''; // ファイル入力をリセット
	}

	/**
		* モーダル内の画像アップロード処理
		* @param {File} file 
		*/
	handleModalImageUpload(file) {
		const reader = new FileReader();
		reader.onload = (event) => {
			const img = new Image();
			img.onload = () => {
				this.cropImageForModal(img);
			};
			img.src = event.target.result;
		};
		reader.readAsDataURL(file);
	}

	/**
		* Canvasを使い、アップロードされた画像を正方形中央でトリミングしてモーダル一時状態に格納
		* @param {HTMLImageElement} img 
		*/
	cropImageForModal(img) {
		const size = 600;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');

		const minSize = Math.min(img.width, img.height);
		const sx = (img.width - minSize) / 2;
		const sy = (img.height - minSize) / 2;

		ctx.drawImage(img, sx, sy, minSize, minSize, 0, 0, size, size);
		
		this.tempModalImage = canvas.toDataURL();
		this.updateModalPreview();
	}

	/**
		* モーダル内のプレビュー表示と、Removeボタンの表示/非表示を更新
		*/
	updateModalPreview() {
		if (this.tempModalImage) {
			this.modalPreviewBox.style.backgroundImage = `url(${this.tempModalImage})`;
			this.modalPreviewPlaceholder.style.display = 'none';
			this.btnModalRemove.style.display = 'block';
		} else {
			this.modalPreviewBox.style.backgroundImage = 'none';
			this.modalPreviewPlaceholder.style.display = 'block';
			this.btnModalRemove.style.display = 'none';
		}
	}

	/**
		* 各ステータス値（手数、タイマー）の表示を更新する
		*/
	updateStatusDisplay() {
		this.movesValue.textContent = this.game.moves;
		
		const minutes = Math.floor(this.game.elapsedTime / 60);
		const seconds = this.game.elapsedTime % 60;
		this.timerValue.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	/**
		* パズルがクリアされたか確認し、クリア演出を行う
		*/
	checkGameClear() {
		if (!this.game.isGameActive && this.game.isSolved() && this.game.moves > 0) {
			this.stopTimer();
			
			// クリア統計をセット
			this.solvedMoves.textContent = this.game.moves;
			const minutes = Math.floor(this.game.elapsedTime / 60);
			const seconds = this.game.elapsedTime % 60;
			this.solvedTime.textContent = `${minutes}m ${seconds}s`;
			
			// ロックの解除とShuffleボタンの再表示
			this.updateActionButtons();
			this.updateSizeButtonsState();
			this.updateIndicators();

			// アニメーションのため少しだけ遅延させてクリアオーバーレイを表示
			setTimeout(() => {
				this.solvedOverlay.classList.add('active');
			}, 300);
		}
	}

	/**
		* パズル盤面のDOMを再描画する
		*/
	render() {
		// 盤面サイズ用のCSS変数を設定
		this.board.style.setProperty('--grid-size', this.game.size);
		
		// 一度盤面を空にする
		this.board.innerHTML = '';
		
		// 各ピースの描画幅（レスポンシブな計算に備える）
		const boardWidth = this.board.clientWidth || 450;
		const boardHeight = this.board.clientHeight || 450;
		this.board.style.setProperty('--board-width', boardWidth);
		this.board.style.setProperty('--board-height', boardHeight);

		const size = this.game.size;
		const totalTiles = size * size;
		
		// クリア状態（ゲーム非アクティブで完成状態）の判定
		const isCleared = !this.game.isGameActive && this.game.isSolved() && this.game.moves > 0;
		const hasImage = this.imageSettings.url !== null;

		this.game.tiles.forEach((value, index) => {
			const tile = document.createElement('div');
			tile.classList.add('tile');
			tile.dataset.index = index;
			
			// 空白セルだがクリア済みの場合は最後の値を補完する
			let displayValue = value;
			let isEmptyTile = value === 0;

			if (isEmptyTile && isCleared) {
				displayValue = totalTiles;
				isEmptyTile = false;
			}

			if (isEmptyTile) {
				tile.classList.add('tile-empty');
			} else {
				// 画像モードかつ画像がある時のみ、数字の非表示切替を適用
				if (hasImage) {
					tile.textContent = displayValue;
					tile.classList.add('tile-image');
					tile.style.setProperty('--tile-img-url', `url(${this.imageSettings.url})`);
					
					if (!this.imageSettings.showGuides) {
						tile.classList.add('hide-number');
					}
					
					// このピースの完成時の位置 (行、列) から background-position を算出
					const targetIndex = displayValue - 1;
					const targetRow = Math.floor(targetIndex / size);
					const targetCol = targetIndex % size;
					
					const pctX = (targetCol / (size - 1)) * 100;
					const pctY = (targetRow / (size - 1)) * 100;
					tile.style.setProperty('--tile-bg-x', `${pctX}%`);
					tile.style.setProperty('--tile-bg-y', `${pctY}%`);
				} else {
					// 通常の数字モード（画像なし、代入SVGなし）
					tile.textContent = displayValue;
				}
				
				tile.dataset.value = displayValue;
				
				// 移動可能かどうかの視覚的ヒント用属性（かつクリアしてない場合）
				if (!isCleared && this.game.canMove(index)) {
					tile.setAttribute('draggable', 'true');
				}
			}

			this.board.appendChild(tile);
		});

		this.updateStatusDisplay();
	}

	/**
	 * 画面サイズに合わせてアスペクト比を固定したスケーリングを行う
	 */
	resizeApp() {
		const baseWidth = 500;
		const baseHeight = 850;

		// ビューポートサイズを取得
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		// 上下左右に最低限確保するマージン（ピクセル）
		const margin = 24;
		const availableWidth = Math.max(200, viewportWidth - margin);
		const availableHeight = Math.max(300, viewportHeight - margin);

		// スケール比率を計算
		const scaleX = availableWidth / baseWidth;
		const scaleY = availableHeight / baseHeight;
		const scale = Math.min(scaleX, scaleY);

		// stage の実寸サイズを、スケール後の寸法に更新
		if (this.appStage) {
			this.appStage.style.width = `${baseWidth * scale}px`;
			this.appStage.style.height = `${baseHeight * scale}px`;
		}

		// container に対して scale(scale) を適用して中央配置
		if (this.appContainer) {
			this.appContainer.style.transform = `translate(-50%, -50%) scale(${scale})`;
		}

		this.updateIndicators();
	}

	/**
	 * テーマとサイズ選択肢のインジケータ（スライダー背景）の位置と幅を更新する
	 */
	updateIndicators() {
		// テーマインジケータの更新
		const activeThemeBtn = Array.from(this.themeButtons).find(btn => btn.classList.contains('active'));
		const themeSelector = document.getElementById('theme-selector');
		const themeIndicator = document.getElementById('theme-indicator');
		this.positionIndicator(themeSelector, themeIndicator, activeThemeBtn);

		// サイズインジケータの更新
		const activeSizeBtn = Array.from(this.sizeButtons).find(btn => btn.classList.contains('active'));
		const sizeOptions = document.getElementById('size-options-container');
		const sizeIndicator = document.getElementById('size-indicator');
		this.positionIndicator(sizeOptions, sizeIndicator, activeSizeBtn);
	}

	/**
	 * インジケータ要素を選択されたアクティブボタンの位置・サイズに合わせる
	 * @param {HTMLElement} container 親コンテナ
	 * @param {HTMLElement} indicator インジケータ要素
	 * @param {HTMLElement} activeBtn アクティブなボタン要素
	 */
	positionIndicator(container, indicator, activeBtn) {
		if (!container || !indicator || !activeBtn) return;
		
		const left = activeBtn.offsetLeft;
		const width = activeBtn.offsetWidth;
		
		indicator.style.width = `${width}px`;
		indicator.style.transform = `translateX(${left}px)`;
	}
}

window.PuzzleUI = PuzzleUI;
