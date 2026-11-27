/**
 * @fileoverview uiManager.js
 * UI状態管理クラス。タイトル画面・プレイ中HUD・ポーズ画面・ゲームオーバー画面・
 * ランキングモーダル・確認モーダル・HUDフラッシュ演出・メニューのゲームパッド操作を担当する。
 */

/**
 * UI状態管理クラス
 */
class UIManager {
	/**
	 * @param {Game} game - ゲームメインクラスへの参照
	 */
	constructor(game) {
		/** @type {Game} */
		this.game = game;

		// UI状態フラグ
		this.bossHUDVisible = false;
		this.isRankingModalOpen = false;
		this.isConfirmModalOpen = false;
		this.isEnteringName = false;

		// 各メニューのゲームパッド入力状態
		this.titleNavState = { prevButtons: [], prevAxes: [0, 0] };
		this.pauseNavState = { focusIndex: 0, prevButtons: [], prevAxes: [0, 0], lastActiveElement: null };
		this.gameoverNavState = { focusIndex: 0, prevButtons: [], prevAxes: [0, 0], lastActiveElement: null };
	}

	/**
	 * UIコンテナ向けのイベント初期化（フォーカストラップ等）
	 */
	initUIEvents() {
		const uiContainer = document.getElementById('ui-container');
		if (!uiContainer) return;

		uiContainer.addEventListener('keydown', (e) => {
			if (e.key !== 'Tab') return;

			let focusableElements = [];
			if (this.game.state === GameState.PAUSE) {
				focusableElements = [
					document.getElementById('pause-resume-btn'),
					document.getElementById('pause-exit-btn')
				].filter(el => el !== null);
			} else if (this.game.state === GameState.GAMEOVER) {
				focusableElements = [
					document.getElementById('gameover-restart-btn'),
					document.getElementById('gameover-exit-btn')
				].filter(el => el !== null);
			}

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
		});
	}

	/**
	 * ポーズメニューのゲームパッドフォーカス状態をリセットする
	 */
	resetPauseMenuState() {
		this.pauseNavState.focusIndex = 0;
		this.pauseNavState.prevButtons = [];
		this.pauseNavState.prevAxes = [0, 0];
	}

	/**
	 * ゲームオーバーメニューのゲームパッドフォーカス状態をリセットする
	 */
	resetGameOverMenuState() {
		this.gameoverNavState.focusIndex = 0;
		this.gameoverNavState.prevButtons = [];
		this.gameoverNavState.prevAxes = [0, 0];
	}

	/**
	 * UI（HUD・タイトル・ポーズ・ゲームオーバーオーバーレイ）の更新
	 */
	updateUI() {
		const game = this.game;
		const scoreManager = game.scoreManager;

		// プレイ中に過去のトップスコアを超えた場合はメモリ上の表示用ハイスコアを同期
		if (game.score > scoreManager.highScore && game.isScoreRecordable()) {
			scoreManager.highScore = game.score;
		}

		// タッチコントローラーの表示状態をゲーム状態に同期
		if (game.touchController) {
			game.touchController.setVisible(game.state === GameState.PLAYING);
		}

		// コックピット視点オーバーレイの表示同期（プレイ中コックピット時は左上HUDを隠してMFD計器へ統合）
		const showCockpit = game.state === GameState.PLAYING &&
			game.cameraController &&
			game.cameraController.isCockpitViewActive();
		this.setCockpitOverlayVisible(!!showCockpit);
		if (showCockpit) {
			this.updateCockpitInstruments();
		}

		const uiContainer = document.getElementById('ui-container');
		if (!uiContainer) return;

		const activeId = document.activeElement ? document.activeElement.id : null;

		if (game.state === GameState.TITLE) {
			this._renderTitleUI(uiContainer);
		} else if (
			game.state === GameState.PLAYING ||
			game.state === GameState.GAMEOVER ||
			game.state === GameState.PAUSE
		) {
			this._renderPlayAndOverlayUI(uiContainer, activeId);
		} else if (game.state === GameState.CLEAR) {
			// 周回継続中は StageManager 側の演出パネルが UI を担当する
			uiContainer.innerHTML = '';
		}
	}

	/**
	 * タイトル画面UIの描画
	 * @param {HTMLElement} uiContainer
	 */
	_renderTitleUI(uiContainer) {
		const scoreManager = this.game.scoreManager;
		const highscoreHtml = `HI-SCORE <span>${scoreManager.padZero(scoreManager.highScore, 6)}</span>`;

		uiContainer.innerHTML = `
			<div id="title-overlay" class="ui-overlay">
				<div class="title-logo">ULTIMA SHOOTER</div>
				<div class="title-version"></div>
				<div class="title-highscore">${highscoreHtml}</div>
				<div class="title-buttons">
					<button id="title-start-btn" class="title-btn focused">START</button>
					<button id="title-ranking-btn" class="title-btn">RANKING</button>
				</div>
				<div class="title-footer">
					<div class="title-copyright"></div>
					<button id="title-debug-btn" class="debug-btn" style="min-width: 120px; padding: 8px;">⚙ DEBUG PANEL</button>
				</div>
			</div>
		`;

		this.bindTitleUIEvents();
	}

	/**
	 * プレイ中HUDおよびポーズ/ゲームオーバーオーバーレイの描画
	 * @param {HTMLElement} uiContainer
	 * @param {string|null} activeId
	 */
	_renderPlayAndOverlayUI(uiContainer, activeId) {
		const game = this.game;
		const scoreManager = game.scoreManager;
		const player = game.player;

		const life = player ? player.life : 0;
		const maxLife = player ? (player.maxLife || 100) : 100;
		const lifePct = Math.max(0, Math.min(100, (life / maxLife) * 100));

		const ammo = player ? player.ammo : 0;
		const maxAmmo = GameConfig.player.maxAmmo || 999;
		const ammoPct = Math.max(0, Math.min(100, (ammo / maxAmmo) * 100));

		const power = player ? player.powerLevel : 1;
		const stageNum = game.stageManager ? game.stageManager.getCurrentStage().number : 1;
		const killPoints = game.stageManager ? game.stageManager.stageKillPoints : 0;
		const reqPoints = game.stageManager ? game.stageManager.getScaledRequiredKillPoints() : 150;
		const loopCount = game.stageManager ? game.stageManager.loopCount : 1;
		const stageLabel = loopCount > 1 ? `STAGE (LOOP ${loopCount})` : 'STAGE';

		let html = `
			<div class="game-hud">
				<div class="hud-item">${stageLabel} <span class="hud-value" style="color:#00f0ff; font-weight:900;">0${stageNum}</span></div>
				<div class="hud-item">POINT <span class="hud-value" id="point-val" style="color:#ffd700; font-weight:900;">${killPoints} / ${reqPoints}</span></div>
				<div class="hud-item">SCORE <span class="hud-value" id="score-val">${scoreManager.padZero(game.score, 6)}</span></div>

				<div class="hud-item bar-type">
					<div class="hud-label-row">
						<span>LIFE</span>
						<span class="hud-value" id="life-val">${life}</span>
					</div>
					<div class="hud-bar-bg">
						<div id="life-bar" class="hud-bar-fill life" style="width: ${lifePct}%;"></div>
					</div>
				</div>

				<div class="hud-item bar-type">
					<div class="hud-label-row">
						<span>AMMO</span>
						<span class="hud-value" id="ammo-val">${ammo}</span>
					</div>
					<div class="hud-bar-bg">
						<div id="ammo-bar" class="hud-bar-fill ammo" style="width: ${ammoPct}%;"></div>
					</div>
				</div>

				<div class="hud-item">POWER <span class="hud-value" id="power-val">Lv.${power}</span></div>
		`;

		if (game.boss && this.bossHUDVisible) {
			const bossHpPct = Math.max(0, (game.boss.hp / game.boss.maxHp) * 100);
			html += `
				<div class="hud-item bar-type" style="margin-top: 10px; border-top: 1px solid rgba(255,50,50,0.3); padding-top: 10px;">
					<div class="hud-label-row">
						<span style="color: #ff3333; text-shadow: 0 0 5px red;">BOSS</span>
						<span class="hud-value" style="color: #ff3333;">${game.boss.name}</span>
					</div>
					<div class="hud-bar-bg" style="border-color: rgba(255,50,50,0.5); box-shadow: 0 0 10px rgba(255,0,0,0.3);">
						<div id="boss-hp-bar" class="hud-bar-fill" style="width: ${bossHpPct}%; background: linear-gradient(90deg, #ff0000, #ff8800); box-shadow: 0 0 10px #ff0000;"></div>
					</div>
				</div>
			`;
		}

		html += `</div>`;

		if (game.state === GameState.PAUSE) {
			html += `
				<div class="ui-overlay">
					<div class="glass-panel pause-panel">
						<div class="panel-title pause" style="margin-bottom: 0;">PAUSE</div>
						<div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
							<button id="pause-resume-btn" class="pause-btn">RESUME</button>
							<button id="pause-exit-btn" class="pause-btn">EXIT</button>
						</div>
					</div>
				</div>
			`;
		}

		if (game.state === GameState.GAMEOVER) {
			const innerContent = this.isEnteringName
				? `
					<div class="highscore-name-input-container">
						<div class="highscore-congrats">RANK IN TOP 10!</div>
						<input type="text" id="highscore-name-input" class="highscore-name-input" maxlength="10" placeholder="YOUR NAME">
						<button id="highscore-submit-btn" class="highscore-submit-btn">REGISTER</button>
					</div>
				`
				: `
					<div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
						<button id="gameover-restart-btn" class="gameover-btn">RESTART</button>
						<button id="gameover-exit-btn" class="gameover-btn">EXIT</button>
					</div>
				`;

			html += `
				<div class="ui-overlay">
					<div class="glass-panel gameover-panel">
						<div class="panel-title gameover" style="margin-bottom: 0;">GAME OVER</div>
						<div class="panel-score" style="margin-bottom: 10px;">FINAL SCORE: ${scoreManager.padZero(game.score, 6)}</div>
						${scoreManager.isNewHighScore ? `<div class="panel-score blinking" style="margin-bottom: 0; font-size: 24px; color: #ffd700;">NEW HIGH SCORE!</div>` : ''}
						${innerContent}
					</div>
				</div>
			`;
		}

		uiContainer.innerHTML = html;

		// アクティブだった要素のフォーカスを復元
		if (activeId && (!this.isEnteringName || activeId !== 'gameover-restart-btn')) {
			const el = document.getElementById(activeId);
			if (el) el.focus();
		}

		if (game.state === GameState.PAUSE) {
			this._bindPauseEvents();
		} else if (game.state === GameState.GAMEOVER) {
			this._bindGameOverEvents();
		}
	}

	/**
	 * ポーズ画面ボタンのイベントバインド
	 */
	_bindPauseEvents() {
		const resumeBtn = document.getElementById('pause-resume-btn');
		const exitBtn = document.getElementById('pause-exit-btn');

		if (resumeBtn) {
			resumeBtn.addEventListener('click', () => {
				this.game.state = GameState.PLAYING;
				if (window.audioManager) audioManager.resumeBGM();
				this.updateUI();
			});
		}
		if (exitBtn) {
			exitBtn.addEventListener('click', () => {
				this.game.exitToTitle();
			});
		}
	}

	/**
	 * ゲームオーバー画面ボタンおよび名前入力のイベントバインド
	 */
	_bindGameOverEvents() {
		const game = this.game;

		if (this.isEnteringName) {
			const submitBtn = document.getElementById('highscore-submit-btn');
			const inputEl = document.getElementById('highscore-name-input');
			if (!submitBtn || !inputEl) return;

			const registerScore = () => {
				const stageNum = game.stageManager ? game.stageManager.getCurrentStage().number : 1;
				const loopCount = game.stageManager ? game.stageManager.loopCount : 1;
				game.scoreManager.registerScore(game.score, inputEl.value, stageNum, loopCount);

				this.isEnteringName = false;
				this.updateUI();

				setTimeout(() => {
					const restartBtn = document.getElementById('gameover-restart-btn');
					if (restartBtn) restartBtn.focus();
				}, 50);
			};

			submitBtn.addEventListener('click', registerScore);
			inputEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') registerScore();
			});
		} else {
			const restartBtn = document.getElementById('gameover-restart-btn');
			const exitBtn = document.getElementById('gameover-exit-btn');

			if (restartBtn) {
				restartBtn.addEventListener('click', () => game.startGame());
			}
			if (exitBtn) {
				exitBtn.addEventListener('click', () => game.exitToTitle());
			}
		}
	}

	/**
	 * タイトル画面のボタンおよびキーボードナビゲーションを登録する
	 */
	bindTitleUIEvents() {
		const game = this.game;
		const startBtn = document.getElementById('title-start-btn');
		const rankingBtn = document.getElementById('title-ranking-btn');
		const debugBtn = document.getElementById('title-debug-btn');

		const updateFocusClass = (focusedId) => {
			if (startBtn) startBtn.classList.toggle('focused', startBtn.id === focusedId);
			if (rankingBtn) rankingBtn.classList.toggle('focused', rankingBtn.id === focusedId);
			if (debugBtn) debugBtn.classList.toggle('focused', debugBtn.id === focusedId);
		};

		if (startBtn) {
			startBtn.addEventListener('focus', () => updateFocusClass('title-start-btn'));
			startBtn.addEventListener('click', () => {
				if (!game.isDebugMenuOpen && !this.isRankingModalOpen && !this.isConfirmModalOpen) {
					game.startGame();
				}
			});
			setTimeout(() => {
				if (
					game.state === GameState.TITLE &&
					!game.isDebugMenuOpen &&
					!this.isRankingModalOpen &&
					!this.isConfirmModalOpen
				) {
					startBtn.focus();
				}
			}, 50);
		}

		if (rankingBtn) {
			rankingBtn.addEventListener('focus', () => updateFocusClass('title-ranking-btn'));
			rankingBtn.addEventListener('click', () => {
				if (!game.isDebugMenuOpen && !this.isRankingModalOpen && !this.isConfirmModalOpen) {
					this.openRankingModal();
				}
			});
		}

		if (debugBtn) {
			debugBtn.addEventListener('focus', () => updateFocusClass('title-debug-btn'));
			debugBtn.addEventListener('click', () => {
				if (!this.isRankingModalOpen && !this.isConfirmModalOpen) {
					game.toggleDebugMenu();
				}
			});
		}

		const titleOverlay = document.querySelector('.ui-overlay');
		if (titleOverlay) {
			titleOverlay.addEventListener('keydown', (e) => {
				if (game.isDebugMenuOpen || this.isRankingModalOpen || this.isConfirmModalOpen) return;

				if (e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault();
					const focusable = [startBtn, rankingBtn, debugBtn].filter(b => b);
					if (focusable.length === 0) return;

					const idx = focusable.indexOf(document.activeElement);
					if (idx === -1) {
						focusable[0].focus();
						return;
					}
					const goPrev = (e.key === 'Tab' && e.shiftKey) || e.key === 'ArrowUp';
					const nextIdx = (idx + (goPrev ? -1 : 1) + focusable.length) % focusable.length;
					focusable[nextIdx].focus();
				}
			});
		}
	}

	/**
	 * ランキングモーダルを開く
	 */
	openRankingModal() {
		const modal = document.getElementById('ranking-modal');
		if (!modal) return;

		modal.classList.remove('hidden');
		this.isRankingModalOpen = true;
		this.updateRankingTable();

		const closeBtn = document.getElementById('ranking-close-btn');
		const clearBtn = document.getElementById('ranking-clear-btn');

		setTimeout(() => {
			if (closeBtn) closeBtn.focus();
		}, 50);

		const handleRankingKeydown = (e) => {
			if (this.isConfirmModalOpen) return;
			if (
				e.key === 'Tab' ||
				e.key === 'ArrowUp' ||
				e.key === 'ArrowDown' ||
				e.key === 'ArrowLeft' ||
				e.key === 'ArrowRight'
			) {
				e.preventDefault();
				if (document.activeElement === closeBtn) {
					if (clearBtn) clearBtn.focus();
				} else if (closeBtn) {
					closeBtn.focus();
				}
			}
		};

		modal.addEventListener('keydown', handleRankingKeydown);

		if (closeBtn) {
			closeBtn.onclick = () => {
				modal.classList.add('hidden');
				modal.removeEventListener('keydown', handleRankingKeydown);
				this.isRankingModalOpen = false;
				const startBtn = document.getElementById('title-start-btn');
				if (startBtn) startBtn.focus();
			};
		}

		if (clearBtn) {
			clearBtn.onclick = () => {
				this.showConfirm(
					'Are you sure you want to clear all high scores?',
					() => {
						this.game.scoreManager.clear();
						this.updateRankingTable();
						this.updateUI();
						if (closeBtn) closeBtn.focus();
					},
					() => {
						if (clearBtn) clearBtn.focus();
					}
				);
			};
		}
	}

	/**
	 * 汎用確認モーダルの表示
	 * @param {string} message
	 * @param {Function} onYes
	 * @param {Function} onNo
	 */
	showConfirm(message, onYes, onNo) {
		const modal = document.getElementById('confirm-modal');
		const msgEl = document.getElementById('confirm-message');
		const yesBtn = document.getElementById('confirm-yes-btn');
		const noBtn = document.getElementById('confirm-no-btn');

		if (!modal || !msgEl || !yesBtn || !noBtn) return;

		msgEl.innerText = message;
		modal.classList.remove('hidden');
		this.isConfirmModalOpen = true;

		setTimeout(() => {
			noBtn.focus();
		}, 50);

		const handleConfirmKeydown = (e) => {
			if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
				e.preventDefault();
				if (document.activeElement === yesBtn) noBtn.focus();
				else yesBtn.focus();
			}
		};

		const closeConfirm = () => {
			modal.classList.add('hidden');
			modal.removeEventListener('keydown', handleConfirmKeydown);
			this.isConfirmModalOpen = false;
		};

		modal.addEventListener('keydown', handleConfirmKeydown);

		yesBtn.onclick = () => {
			closeConfirm();
			if (onYes) onYes();
		};

		noBtn.onclick = () => {
			closeConfirm();
			if (onNo) onNo();
		};
	}

	/**
	 * ランキングテーブルの描画更新
	 */
	updateRankingTable() {
		const tbody = document.getElementById('ranking-tbody');
		if (!tbody) return;

		const scoreManager = this.game.scoreManager;
		if (scoreManager.highScores.length === 0) {
			tbody.innerHTML = '<tr><td colspan="6" class="ranking-no-data">NO DATA</td></tr>';
			return;
		}

		let html = '';
		scoreManager.highScores.forEach((data, index) => {
			const loopVal = data.loop !== undefined ? data.loop : 1;
			const stageVal = data.stage !== undefined ? data.stage : 1;
			const formattedDate = scoreManager.formatDateDisplay(data.date);
			html += `
				<tr>
					<td class="ranking-num">${index + 1}</td>
					<td class="ranking-score">${scoreManager.padZero(data.score, 6)}</td>
					<td class="ranking-name">${data.name}</td>
					<td class="ranking-loop">${loopVal}</td>
					<td class="ranking-stage">${stageVal}</td>
					<td class="ranking-date">${formattedDate}</td>
				</tr>
			`;
		});
		tbody.innerHTML = html;
	}

	/**
	 * アイテム獲得時・被弾時のHUDフラッシュ演出（コックピット計器にも対応）
	 * @param {string} elementId
	 * @param {string} className
	 */
	triggerHUDFlash(elementId, className) {
		const cockpitMap = {
			'point-val': 'cp-point-val',
			'score-val': 'cp-score-val',
			'life-val': 'cp-life-val',
			'ammo-val': 'cp-ammo-val',
			'power-val': 'cp-power-val'
		};

		const targetIds = [elementId];
		if (cockpitMap[elementId]) {
			targetIds.push(cockpitMap[elementId]);
		}

		for (const id of targetIds) {
			const el = document.getElementById(id);
			if (!el) continue;
			el.classList.remove(className);
			void el.offsetWidth;
			el.classList.add(className);
			setTimeout(() => {
				if (el) el.classList.remove(className);
			}, 200);
		}
	}

	/**
	 * 弾切れ時の「NO AMMO」警告表示
	 */
	triggerNoAmmoWarning() {
		if (document.getElementById('no-ammo-warning')) return;

		const warning = document.createElement('div');
		warning.id = 'no-ammo-warning';
		warning.className = 'no-ammo-warning';
		warning.innerText = 'NO AMMO';

		const uiContainer = document.getElementById('ui-container');
		if (!uiContainer) return;

		uiContainer.appendChild(warning);
		setTimeout(() => {
			if (warning.parentNode) {
				warning.parentNode.removeChild(warning);
			}
		}, 1000);
	}

	/**
	 * 一人称コックピット視点用フレーム＆MFD計器オーバーレイの表示切替
	 * コックピット視点中は body に cockpit-active クラスを付与し、左上通常HUDを自動非表示にする。
	 * @param {boolean} visible
	 */
	setCockpitOverlayVisible(visible) {
		const el = document.getElementById('cockpit-overlay');
		if (el) {
			el.classList.toggle('hidden', !visible);
		}
		if (document.body) {
			document.body.classList.toggle('cockpit-active', !!visible);
		}
	}

	/**
	 * コックピット内 3画面 MFD 計器および HUD コンバイナーの数値を同期更新する
	 */
	updateCockpitInstruments() {
		const game = this.game;
		const scoreManager = game.scoreManager;
		const player = game.player;

		const life = player ? player.life : 0;
		const maxLife = player ? (player.maxLife || 100) : 100;
		const lifePct = Math.max(0, Math.min(100, (life / maxLife) * 100));

		const ammo = player ? player.ammo : 0;
		const maxAmmo = GameConfig.player.maxAmmo || 999;
		const ammoPct = Math.max(0, Math.min(100, (ammo / maxAmmo) * 100));

		const power = player ? player.powerLevel : 1;
		const hasBarrier = !!(player && player.hasBarrier);
		const stageNum = game.stageManager ? game.stageManager.getCurrentStage().number : 1;
		const killPoints = game.stageManager ? game.stageManager.stageKillPoints : 0;
		const reqPoints = game.stageManager ? game.stageManager.getScaledRequiredKillPoints() : 150;
		const pointPct = Math.max(0, Math.min(100, (killPoints / Math.max(1, reqPoints)) * 100));
		const loopCount = game.stageManager ? game.stageManager.loopCount : 1;

		const setText = (id, text) => {
			const el = document.getElementById(id);
			if (el && el.textContent !== text) el.textContent = text;
		};

		// HUD コンバイナー上部ステータス
		setText('cp-hud-stage', `STG 0${stageNum}`);
		setText('cp-hud-loop', `LOOP ${loopCount}`);
		setText('cp-hud-weapon', `WPN LV.${power}`);

		// 左 MFD: STAGE / POINT / SCORE
		setText('cp-stage-label', loopCount > 1 ? `STAGE (L${loopCount})` : 'STAGE');
		setText('cp-stage-val', `0${stageNum}`);
		setText('cp-point-val', `${killPoints} / ${reqPoints}`);
		setText('cp-score-val', scoreManager.padZero(game.score, 6));
		const pointBar = document.getElementById('cp-point-bar');
		if (pointBar) pointBar.style.width = `${pointPct}%`;

		// 中央 MFD: LIFE & BOSS HP
		setText('cp-life-val', `${life}`);
		const lifeBar = document.getElementById('cp-life-bar');
		if (lifeBar) {
			lifeBar.style.width = `${lifePct}%`;
			lifeBar.classList.toggle('danger', lifePct <= 30);
		}

		// 右 MFD: AMMO & POWER
		setText('cp-ammo-val', `${ammo}`);
		const ammoBar = document.getElementById('cp-ammo-bar');
		if (ammoBar) {
			ammoBar.style.width = `${ammoPct}%`;
			ammoBar.classList.toggle('danger', ammo <= 30);
		}
		setText('cp-power-val', `Lv.${power}`);
		const powerCells = document.getElementById('cp-power-cells');
		if (powerCells) {
			const children = powerCells.children;
			for (let i = 0; i < children.length; i++) {
				children[i].classList.toggle('active', i < power);
			}
		}

		// 警告ランプ＆シールドインジケーター
		const lowLife = lifePct <= 30;
		const lowAmmo = ammo <= 30;
		const cautionLamp = document.getElementById('cp-master-caution');
		if (cautionLamp) cautionLamp.classList.toggle('lit', lowLife || lowAmmo);

		const barrierLamp = document.getElementById('cp-barrier-lamp');
		if (barrierLamp) barrierLamp.classList.toggle('lit', hasBarrier);

		const hudShield = document.getElementById('cp-hud-shield');
		if (hudShield) hudShield.classList.toggle('hidden', !hasBarrier);

		const hudLowAmmo = document.getElementById('cp-hud-low-ammo');
		if (hudLowAmmo) hudLowAmmo.classList.toggle('hidden', !lowAmmo);

		// ボスロックオンパネル
		const bossPanel = document.getElementById('cp-boss-panel');
		const sysStatus = document.getElementById('cp-sys-status');
		const showBoss = !!(game.boss && this.bossHUDVisible);
		if (bossPanel) bossPanel.classList.toggle('hidden', !showBoss);
		if (sysStatus) {
			sysStatus.classList.toggle('hidden', showBoss);
			if (!showBoss) {
				if (lowLife) sysStatus.textContent = 'WARNING: HULL CRITICAL';
				else if (hasBarrier) sysStatus.textContent = 'A-SHIELD ENGAGED';
				else sysStatus.textContent = 'ALL SYSTEMS NOMINAL';
				sysStatus.classList.toggle('warn', lowLife);
			}
		}
		if (showBoss) {
			setText('cp-boss-name', game.boss.name);
			const bossPct = Math.max(0, (game.boss.hp / game.boss.maxHp) * 100);
			const bossBar = document.getElementById('cp-boss-bar');
			if (bossBar) bossBar.style.width = `${bossPct}%`;
		}
	}

	/**
	 * 毎フレームのコックピット姿勢計（人工水平儀）＆ G 慣性揺れ更新
	 * @param {Player|null} player
	 */
	updateCockpitDynamics(player) {
		if (!player || !player.mesh) return;
		const attitudeGroup = document.getElementById('cp-attitude-group');
		if (attitudeGroup) {
			// 自機のロール（左右傾き）とピッチ（上下傾き）を人工水平儀へリアルタイム反映
			const rollDeg = -THREE.MathUtils.radToDeg(player.mesh.rotation.z) * 0.55;
			const pitchPx = THREE.MathUtils.clamp(player.mesh.rotation.x * 95.0, -42.0, 42.0);
			attitudeGroup.setAttribute('transform', `translate(180, ${(120 + pitchPx).toFixed(1)}) rotate(${rollDeg.toFixed(1)})`);
		}

		// ダッシュボードのわずかな慣性シフトで機体内部の臨場感を演出
		const dash = document.getElementById('cockpit-dashboard');
		if (dash) {
			const shiftX = THREE.MathUtils.clamp(player.mesh.rotation.z * 14.0, -10.0, 10.0);
			const shiftY = THREE.MathUtils.clamp(-player.mesh.rotation.x * 16.0, -7.0, 7.0);
			dash.style.transform = `translate3d(${shiftX.toFixed(1)}px, ${shiftY.toFixed(1)}px, 0px)`;
		}

		// バリア点灯状態は時間経過で終了するため毎フレーム軽量同期
		const hasBarrier = !!player.hasBarrier;
		const barrierLamp = document.getElementById('cp-barrier-lamp');
		if (barrierLamp) barrierLamp.classList.toggle('lit', hasBarrier);
		const hudShield = document.getElementById('cp-hud-shield');
		if (hudShield) hudShield.classList.toggle('hidden', !hasBarrier);
	}

	/**
	 * カメラ視点切替時の通知トーストを表示する
	 * @param {string} modeLabel
	 */
	showCameraModeToast(modeLabel) {
		const el = document.getElementById('camera-mode-toast');
		if (!el) return;

		el.innerText = `CAMERA: ${modeLabel}`;
		el.classList.remove('hidden');
		el.classList.add('active');

		if (this._cameraToastTimer) {
			clearTimeout(this._cameraToastTimer);
		}
		this._cameraToastTimer = setTimeout(() => {
			el.classList.remove('active');
			el.classList.add('hidden');
			this._cameraToastTimer = null;
		}, 1500);
	}

	/**
	 * ボスHPゲージHUDの表示
	 */
	showBossHUD() {
		if (!this.game.boss) return;
		this.bossHUDVisible = true;
		this.updateUI();
	}

	/**
	 * ボスHPゲージHUDの非表示
	 */
	hideBossHUD() {
		this.bossHUDVisible = false;
		this.updateUI();
	}

	/**
	 * ボスHPバーの幅更新（通常HUDおよびコックピット計器の両方を同期）
	 */
	updateBossHPBar() {
		const boss = this.game.boss;
		if (!boss) return;
		const pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
		const bar = document.getElementById('boss-hp-bar');
		if (bar) {
			bar.style.width = `${pct}%`;
		}
		const cpBar = document.getElementById('cp-boss-bar');
		if (cpBar) {
			cpBar.style.width = `${pct}%`;
		}
	}

	/**
	 * ゲームパッドのメニュー操作エッジ入力を共通読み取りする
	 * @param {Gamepad} gp
	 * @param {{prevButtons: boolean[], prevAxes: number[]}} navState
	 * @returns {{goUp: boolean, goDown: boolean, goLeft: boolean, goRight: boolean, pressA: boolean, releaseA: boolean, pressB: boolean}}
	 */
	_readGamepadNav(gp, navState) {
		const buttons = gp.buttons.map(b => b.pressed);
		const axes = [gp.axes[0] || 0, gp.axes[1] || 0];
		const prevB = navState.prevButtons || [];
		const prevA = navState.prevAxes || [0, 0];

		const result = {
			goUp: (buttons[12] && !prevB[12]) || (axes[1] < -0.5 && prevA[1] >= -0.5),
			goDown: (buttons[13] && !prevB[13]) || (axes[1] > 0.5 && prevA[1] <= 0.5),
			goLeft: (buttons[14] && !prevB[14]) || (axes[0] < -0.5 && prevA[0] >= -0.5),
			goRight: (buttons[15] && !prevB[15]) || (axes[0] > 0.5 && prevA[0] <= 0.5),
			pressA: !!(buttons[0] && !prevB[0]),
			releaseA: !!(!buttons[0] && prevB[0]),
			pressB: !!(buttons[1] && !prevB[1])
		};

		navState.prevButtons = [...buttons];
		navState.prevAxes = [...axes];
		return result;
	}

	/**
	 * タイトル画面（およびモーダル表示中）のゲームパッド操作
	 * @param {Gamepad} gp
	 */
	updateTitleMenuGamepad(gp) {
		if (!gp) return;
		const nav = this._readGamepadNav(gp, this.titleNavState);
		const moveFocus = nav.goUp || nav.goDown || nav.goLeft || nav.goRight;

		if (this.isConfirmModalOpen) {
			const yesBtn = document.getElementById('confirm-yes-btn');
			const noBtn = document.getElementById('confirm-no-btn');
			const focusable = [yesBtn, noBtn].filter(b => b);

			if (moveFocus && focusable.length > 0) {
				const idx = focusable.indexOf(document.activeElement);
				if (idx !== -1) focusable[(idx + 1) % focusable.length].focus();
				else if (noBtn) noBtn.focus();
			}
			if (nav.pressA && document.activeElement && focusable.includes(document.activeElement)) {
				document.activeElement.click();
			} else if (nav.pressB && noBtn) {
				noBtn.click();
			}
		} else if (this.isRankingModalOpen) {
			const closeBtn = document.getElementById('ranking-close-btn');
			const clearBtn = document.getElementById('ranking-clear-btn');
			const focusable = [closeBtn, clearBtn].filter(b => b);

			if (moveFocus && focusable.length > 0) {
				const idx = focusable.indexOf(document.activeElement);
				if (idx !== -1) focusable[(idx + 1) % focusable.length].focus();
				else if (closeBtn) closeBtn.focus();
			}
			if (nav.pressA && document.activeElement && focusable.includes(document.activeElement)) {
				document.activeElement.click();
			} else if (nav.pressB && closeBtn) {
				closeBtn.click();
			}
		} else {
			const startBtn = document.getElementById('title-start-btn');
			const rankingBtn = document.getElementById('title-ranking-btn');
			const debugBtn = document.getElementById('title-debug-btn');
			const focusable = [startBtn, rankingBtn, debugBtn].filter(b => b);

			if (moveFocus && focusable.length > 0) {
				const idx = focusable.indexOf(document.activeElement);
				if (idx !== -1) {
					const step = (nav.goUp || nav.goLeft) ? -1 : 1;
					focusable[(idx + step + focusable.length) % focusable.length].focus();
				} else {
					focusable[0].focus();
				}
			}
			if (nav.pressA && document.activeElement) {
				if (focusable.includes(document.activeElement)) {
					document.activeElement.click();
				} else if (startBtn) {
					startBtn.click();
				}
			}
		}
	}

	/**
	 * 縦並びボタンメニュー（ポーズ / ゲームオーバー）の共通ゲームパッド操作
	 * @param {Gamepad} gp
	 * @param {string[]} elementIds
	 * @param {{focusIndex: number, prevButtons: boolean[], prevAxes: number[], lastActiveElement: Element|null}} navState
	 */
	_updateVerticalMenuGamepad(gp, elementIds, navState) {
		const nav = this._readGamepadNav(gp, navState);
		const elements = elementIds.map(id => document.getElementById(id)).filter(el => el !== null);
		if (elements.length === 0) return;

		if (navState.lastActiveElement !== document.activeElement) {
			navState.lastActiveElement = document.activeElement;
			const activeIdx = elements.indexOf(document.activeElement);
			if (activeIdx !== -1) navState.focusIndex = activeIdx;
		}

		if (nav.goUp) {
			navState.focusIndex = (navState.focusIndex - 1 + elements.length) % elements.length;
			elements[navState.focusIndex].focus();
		} else if (nav.goDown) {
			navState.focusIndex = (navState.focusIndex + 1) % elements.length;
			elements[navState.focusIndex].focus();
		}

		const focusedEl = elements[navState.focusIndex];
		if (!focusedEl) return;

		if (document.activeElement !== focusedEl) {
			focusedEl.focus();
		}

		if (nav.releaseA) {
			focusedEl.click();
		}
	}

	/**
	 * ポーズメニュー内のゲームパッド操作
	 * @param {Gamepad} gp
	 */
	updatePauseMenuGamepad(gp) {
		this._updateVerticalMenuGamepad(gp, ['pause-resume-btn', 'pause-exit-btn'], this.pauseNavState);
	}

	/**
	 * ゲームオーバーメニュー内のゲームパッド操作
	 * @param {Gamepad} gp
	 */
	updateGameOverMenuGamepad(gp) {
		this._updateVerticalMenuGamepad(gp, ['gameover-restart-btn', 'gameover-exit-btn'], this.gameoverNavState);
	}
}
