/**
 * @fileoverview debugManager.js
 * デバッグパネルのUI制御・設定適用・チートフラグ判定・FPS計測・
 * デバッグショートカット・ゲームパッド操作を担当する。
 */

/**
 * デバッグ管理クラス
 */
class DebugManager {
	/**
	 * @param {Game} game - ゲームメインクラスへの参照
	 */
	constructor(game) {
		/** @type {Game} */
		this.game = game;

		/** @type {Object} デバッグ設定値 */
		this.settings = this._createDefaultSettings();

		/** @type {boolean} デバッグメニューが開いているか */
		this.isOpen = false;

		// FPS計測用
		this.fpsTimer = 0.0;
		this.fpsFrameCount = 0;

		// ゲームパッド操作状態
		this.focusIndex = 0;
		this.prevGamepadButtons = [];
		this.prevAxes = [0, 0];
		this.lastActiveElement = null;
	}

	/**
	 * デフォルトのデバッグ設定オブジェクトを生成する
	 * @returns {Object}
	 */
	_createDefaultSettings() {
		return {
			startStage: 0,
			startLoop: 1,
			seedOverride: null,
			invincible: false,
			maxPower: false,
			instantBoss: false,
			bossKillKey: false,
			enableGamepad: true,
			showFps: false
		};
	}

	/**
	 * デバッグメニューのDOMイベント初期化
	 */
	init() {
		const debugMenu = document.getElementById('debug-menu');
		const closeBtn = document.getElementById('debug-close-btn');
		const resetBtn = document.getElementById('debug-reset-btn');
		const clearHighScoreBtn = document.getElementById('debug-clear-highscore-btn');

		if (!debugMenu || !closeBtn || !resetBtn) return;

		closeBtn.addEventListener('click', () => this.toggle(false));
		resetBtn.addEventListener('click', () => this.resetSettings());

		if (clearHighScoreBtn) {
			clearHighScoreBtn.addEventListener('click', () => {
				this.game.scoreManager.clear();
				if (this.game.state === GameState.TITLE) {
					this.game.updateUI();
				}
			});
		}

		// プレースホルダー初期値設定
		const seedInput = document.getElementById('debug-seed');
		if (this.game.stageManager && seedInput) {
			const currentStage = this.game.stageManager.getCurrentStage();
			if (currentStage && currentStage.cave) {
				seedInput.placeholder = `Default (${currentStage.cave.seed})`;
			}
		}

		// ステージ切り替え時にデフォルトシードのプレースホルダーを更新
		const stageSelect = document.getElementById('debug-stage');
		if (stageSelect) {
			stageSelect.value = this.settings.startStage.toString();
		}
		if (stageSelect && seedInput) {
			stageSelect.addEventListener('change', () => {
				const stageIdx = parseInt(stageSelect.value, 10);
				const stageConfig = GameConfig.stages[stageIdx];
				if (stageConfig && stageConfig.cave) {
					seedInput.placeholder = `Default (${stageConfig.cave.seed})`;
				}
			});
		}

		// 各項目のリアルタイム反映イベント
		const inputIds = [
			'debug-stage',
			'debug-loop',
			'debug-seed',
			'debug-invincible',
			'debug-maxpower',
			'debug-instantboss',
			'debug-bosskill-key',
			'debug-gamepad',
			'debug-fps'
		];

		inputIds.forEach(id => {
			const element = document.getElementById(id);
			if (!element) return;
			const eventType = (element.tagName === 'INPUT' && (element.type === 'number' || element.type === 'text'))
				? 'input'
				: 'change';
			element.addEventListener(eventType, () => this.applySettings());
		});

		// キーボード操作のフォーカストラップ (Tabループ) および Esc で閉じる
		debugMenu.addEventListener('keydown', (e) => {
			if (e.key === 'Tab') {
				const focusableElements = this._getFocusableElements();
				if (focusableElements.length === 0) return;

				const firstEl = focusableElements[0];
				const lastEl = focusableElements[focusableElements.length - 1];

				if (e.shiftKey) {
					if (document.activeElement === firstEl) {
						lastEl.focus();
						e.preventDefault();
					}
				} else if (document.activeElement === lastEl) {
					firstEl.focus();
					e.preventDefault();
				}
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.toggle(false);
			}
		});
	}

	/**
	 * デバッグメニュー内のフォーカス可能要素一覧を返す
	 * @returns {HTMLElement[]}
	 */
	_getFocusableElements() {
		const ids = [
			'debug-stage',
			'debug-loop',
			'debug-seed',
			'debug-invincible',
			'debug-maxpower',
			'debug-instantboss',
			'debug-bosskill-key',
			'debug-gamepad',
			'debug-fps',
			'debug-reset-btn',
			'debug-close-btn'
		];
		return ids.map(id => document.getElementById(id)).filter(el => el !== null);
	}

	/**
	 * 現在の設定値をフォームUIに同期する
	 */
	_syncUIToSettings() {
		const stageSelect = document.getElementById('debug-stage');
		const loopInput = document.getElementById('debug-loop');
		const seedInput = document.getElementById('debug-seed');
		const invincibleChk = document.getElementById('debug-invincible');
		const maxpowerChk = document.getElementById('debug-maxpower');
		const instantbossChk = document.getElementById('debug-instantboss');
		const bosskillkeyChk = document.getElementById('debug-bosskill-key');
		const gamepadChk = document.getElementById('debug-gamepad');
		const fpsChk = document.getElementById('debug-fps');

		if (stageSelect) stageSelect.value = this.settings.startStage.toString();
		if (loopInput) loopInput.value = this.settings.startLoop.toString();
		if (seedInput) {
			seedInput.value = this.settings.seedOverride !== null ? this.settings.seedOverride.toString() : '';
		}
		if (invincibleChk) invincibleChk.checked = this.settings.invincible;
		if (maxpowerChk) maxpowerChk.checked = this.settings.maxPower;
		if (instantbossChk) instantbossChk.checked = this.settings.instantBoss;
		if (bosskillkeyChk) bosskillkeyChk.checked = this.settings.bossKillKey;
		if (gamepadChk) gamepadChk.checked = this.settings.enableGamepad;
		if (fpsChk) fpsChk.checked = this.settings.showFps;
	}

	/**
	 * デバッグ設定を初期状態にリセットする
	 */
	resetSettings() {
		this.settings = this._createDefaultSettings();
		this._syncUIToSettings();
		this.updateScoreWarning();

		const seedInput = document.getElementById('debug-seed');
		if (seedInput) {
			const stageConfig = GameConfig.stages[this.settings.startStage];
			if (stageConfig && stageConfig.cave) {
				seedInput.placeholder = `Default (${stageConfig.cave.seed})`;
			}
		}

		this.applySettings();
	}

	/**
	 * デバッグメニューの表示・非表示トグル
	 * @param {boolean|null} [forceState=null]
	 */
	toggle(forceState = null) {
		const debugMenu = document.getElementById('debug-menu');
		if (!debugMenu) return;

		this.isOpen = forceState !== null ? forceState : !this.isOpen;

		if (this.isOpen) {
			debugMenu.classList.remove('hidden');
			this.focusIndex = 0;
			this.prevGamepadButtons = [];
			this.prevAxes = [0, 0];

			this._syncUIToSettings();
			this.updateScoreWarning();

			const stageSelect = document.getElementById('debug-stage');
			if (stageSelect) stageSelect.focus();
		} else {
			debugMenu.classList.add('hidden');
		}
	}

	/**
	 * UIの入力値をゲーム内のデバッグ設定へ適用する
	 */
	applySettings() {
		const stageSelect = document.getElementById('debug-stage');
		const loopInput = document.getElementById('debug-loop');
		const seedInput = document.getElementById('debug-seed');
		const invincibleChk = document.getElementById('debug-invincible');
		const maxpowerChk = document.getElementById('debug-maxpower');
		const instantbossChk = document.getElementById('debug-instantboss');
		const bosskillkeyChk = document.getElementById('debug-bosskill-key');
		const gamepadChk = document.getElementById('debug-gamepad');
		const fpsChk = document.getElementById('debug-fps');

		if (stageSelect) this.settings.startStage = parseInt(stageSelect.value, 10);
		if (loopInput && loopInput.value !== '') {
			this.settings.startLoop = Math.max(1, parseInt(loopInput.value, 10));
		}
		if (seedInput && seedInput.value !== '') {
			this.settings.seedOverride = parseInt(seedInput.value, 10);
		} else {
			this.settings.seedOverride = null;
		}
		if (invincibleChk) this.settings.invincible = invincibleChk.checked;
		if (maxpowerChk) this.settings.maxPower = maxpowerChk.checked;
		if (instantbossChk) this.settings.instantBoss = instantbossChk.checked;
		if (bosskillkeyChk) this.settings.bossKillKey = bosskillkeyChk.checked;
		if (gamepadChk) this.settings.enableGamepad = gamepadChk.checked;

		if (fpsChk) {
			this.settings.showFps = fpsChk.checked;
			const fpsCounter = document.getElementById('fps-counter');
			if (fpsCounter) {
				if (this.settings.showFps) {
					fpsCounter.classList.remove('hidden');
				} else {
					fpsCounter.classList.add('hidden');
					fpsCounter.innerText = '';
				}
			}
		}

		// プレイ中の場合は即座にフラグや周回数を反映
		if (this.game.stageManager) {
			this.game.stageManager.loopCount = this.settings.startLoop;
		}
		if (this.game.state === GameState.PLAYING && this.game.player) {
			this.game.player.isDebugInvincible = this.settings.invincible;
			if (this.settings.maxPower) {
				this.game.player.powerLevel = GameConfig.player.maxPowerLevel;
			}
		}

		this.updateScoreWarning();
		this.game.updateUI();
	}

	/**
	 * ハイスコアが記録可能かどうか（チート無効状態か）を判定する
	 * @returns {boolean}
	 */
	isScoreRecordable() {
		return !(
			this.settings.invincible ||
			this.settings.maxPower ||
			this.settings.instantBoss ||
			this.settings.bossKillKey
		);
	}

	/**
	 * チート有効時のスコア記録無効警告の表示を更新する
	 */
	updateScoreWarning() {
		const warningEl = document.getElementById('debug-score-warning');
		if (!warningEl) return;
		warningEl.style.display = this.isScoreRecordable() ? 'none' : 'inline';
	}

	/**
	 * FPS カウンターの計測・表示更新
	 * @param {number} deltaTime
	 */
	updateFps(deltaTime) {
		if (!this.settings.showFps) return;

		this.fpsTimer += deltaTime;
		this.fpsFrameCount++;
		if (this.fpsTimer >= 0.5) {
			const fps = Math.round(this.fpsFrameCount / this.fpsTimer);
			const fpsCounter = document.getElementById('fps-counter');
			if (fpsCounter) {
				fpsCounter.innerText = `${fps} FPS`;
			}
			this.fpsTimer = 0.0;
			this.fpsFrameCount = 0;
		}
	}

	/**
	 * プレイ中のデバッグショートカット入力を監視する
	 */
	checkShortcuts() {
		const game = this.game;
		if (!game.player || !game.input || !game.input.isKeyJustPressed) return;

		if (game.input.isKeyJustPressed('KeyL')) {
			if (game.stageManager) game.stageManager.clearStage();
		}
		if (this.settings.bossKillKey && game.input.isKeyJustPressed('KeyK')) {
			if (game.boss && game.boss.active && game.boss.state === 'BATTLE') {
				game.damageBoss(game.boss.hp);
			}
		}
	}

	/**
	 * デバッグメニュー内のゲームパッド操作を処理する
	 * @param {Gamepad} gp
	 */
	updateGamepad(gp) {
		const buttons = gp.buttons.map(b => b.pressed);
		const axes = [gp.axes[0], gp.axes[1]];

		const goUp = (buttons[12] && !this.prevGamepadButtons[12]) ||
			(axes[1] < -0.5 && this.prevAxes[1] >= -0.5);
		const goDown = (buttons[13] && !this.prevGamepadButtons[13]) ||
			(axes[1] > 0.5 && this.prevAxes[1] <= 0.5);
		const goLeft = (buttons[14] && !this.prevGamepadButtons[14]) ||
			(axes[0] < -0.5 && this.prevAxes[0] >= -0.5);
		const goRight = (buttons[15] && !this.prevGamepadButtons[15]) ||
			(axes[0] > 0.5 && this.prevAxes[0] <= 0.5);

		// Aボタンは離した瞬間に確定（タイトル画面での誤爆防止）
		const releaseA = !buttons[0] && this.prevGamepadButtons[0];

		this.prevGamepadButtons = [...buttons];
		this.prevAxes = [...axes];

		const debugElements = this._getFocusableElements();
		if (debugElements.length === 0) return;

		if (this.lastActiveElement !== document.activeElement) {
			this.lastActiveElement = document.activeElement;
			const activeIdx = debugElements.indexOf(document.activeElement);
			if (activeIdx !== -1) this.focusIndex = activeIdx;
		}

		if (goUp) {
			this.focusIndex = (this.focusIndex - 1 + debugElements.length) % debugElements.length;
			debugElements[this.focusIndex].focus();
		} else if (goDown) {
			this.focusIndex = (this.focusIndex + 1) % debugElements.length;
			debugElements[this.focusIndex].focus();
		}

		const focusedEl = debugElements[this.focusIndex];
		if (!focusedEl) return;

		if (document.activeElement !== focusedEl) {
			focusedEl.focus();
		}

		// 左右入力による値変更
		if (goLeft || goRight) {
			const isIncrease = goRight;
			if (focusedEl.tagName === 'SELECT') {
				const nextIdx = focusedEl.selectedIndex + (isIncrease ? 1 : -1);
				if (nextIdx >= 0 && nextIdx < focusedEl.options.length) {
					focusedEl.selectedIndex = nextIdx;
					focusedEl.dispatchEvent(new Event('change'));
				}
			} else if (focusedEl.tagName === 'INPUT') {
				if (focusedEl.type === 'number') {
					const isSeed = focusedEl.id === 'debug-seed';
					const step = isSeed ? 100 : 1;
					let val = parseFloat(focusedEl.value);
					if (isNaN(val)) val = isSeed ? 1000 : 1;

					const min = focusedEl.min !== '' ? parseFloat(focusedEl.min) : -Infinity;
					const max = focusedEl.max !== '' ? parseFloat(focusedEl.max) : Infinity;
					focusedEl.value = Math.max(min, Math.min(max, val + (isIncrease ? step : -step)));
					focusedEl.dispatchEvent(new Event('input'));
				} else if (focusedEl.type === 'checkbox') {
					focusedEl.checked = !focusedEl.checked;
					focusedEl.dispatchEvent(new Event('change'));
				}
			}
		}

		if (releaseA) {
			if (focusedEl.tagName === 'BUTTON') {
				focusedEl.click();
			} else if (focusedEl.tagName === 'INPUT' && focusedEl.type === 'checkbox') {
				focusedEl.checked = !focusedEl.checked;
				focusedEl.dispatchEvent(new Event('change'));
			}
		}
	}
}
