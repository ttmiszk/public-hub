/**
 * @fileoverview game.js
 * メインゲームループ、状態管理(タイトル/プレイ/ポーズ/ゲームオーバー/クリア)、
 * および各マネージャー（Entity/Collision/UI/Debug/Score/Stage/Touch）の統括を行う。
 */

/**
 * ゲーム状態の定義
 * @enum {string}
 */
const GameState = {
	TITLE: 'TITLE',
	PLAYING: 'PLAYING',
	PAUSE: 'PAUSE',
	GAMEOVER: 'GAMEOVER',
	CLEAR: 'CLEAR'
};

/**
 * ゲーム全体の制御・状態管理クラス（オーケストレーター）
 */
class Game {
	constructor() {
		/** @type {GameState} */
		this.state = GameState.TITLE;

		// コアシステム
		/** @type {Renderer|null} */
		this.renderer = null;
		/** @type {InputManager|null} */
		this.input = null;
		/** @type {TouchController|null} */
		this.touchController = null;
		/** @type {CameraController|null} */
		this.cameraController = null;

		// ドメインマネージャー
		/** @type {ScoreManager} */
		this.scoreManager = new ScoreManager();
		/** @type {EntityManager} */
		this.entityManager = new EntityManager(this);
		/** @type {CollisionManager} */
		this.collisionManager = new CollisionManager(this);
		/** @type {UIManager} */
		this.uiManager = new UIManager(this);
		/** @type {DebugManager} */
		this.debugManager = new DebugManager(this);

		// スポーナー・エフェクト・ステージ管理
		/** @type {EnemySpawner|null} */
		this.enemySpawner = null;
		/** @type {EffectManager|null} */
		this.effectManager = null;
		/** @type {StageManager|null} */
		this.stageManager = null;

		// ループ・時間管理
		/** @type {number|null} requestAnimationFrame の ID */
		this.animationFrameId = null;
		/** @type {THREE.Clock} */
		this.clock = new THREE.Clock();
		/** @type {number} */
		this.lastDeltaTime = 0.016;

		// ゲーム進行パラメータ
		/** @type {number} */
		this.scrollSpeed = GameConfig.game.scrollSpeed;
		/** @type {Player|null} */
		this.player = null;
		/** @type {THREE.Vector3|null} */
		this.lastPlayerPosition = null;
		/** @type {number} */
		this.score = 0;
	}

	// =========================================================================
	// 既存モジュール互換用プロパティアクセサ
	// =========================================================================

	get bulletPool() { return this.entityManager.bulletPool; }
	get itemPool() { return this.entityManager.itemPool; }
	get obstaclePool() { return this.entityManager.obstaclePool; }
	get bullets() { return this.entityManager.bullets; }
	set bullets(val) { this.entityManager.bullets = val; }
	get enemies() { return this.entityManager.enemies; }
	set enemies(val) { this.entityManager.enemies = val; }
	get items() { return this.entityManager.items; }
	set items(val) { this.entityManager.items = val; }
	get obstacles() { return this.entityManager.obstacles; }
	set obstacles(val) { this.entityManager.obstacles = val; }
	get boss() { return this.entityManager.boss; }
	set boss(val) { this.entityManager.boss = val; }
	get bossActiveRatio() { return this.entityManager.bossActiveRatio; }
	set bossActiveRatio(val) { this.entityManager.bossActiveRatio = val; }
	get caveWalls() { return this.entityManager.caveWalls; }

	get highScore() { return this.scoreManager.highScore; }
	set highScore(val) { this.scoreManager.highScore = val; }
	get highScores() { return this.scoreManager.highScores; }
	set highScores(val) { this.scoreManager.highScores = val; }
	get isNewHighScore() { return this.scoreManager.isNewHighScore; }
	set isNewHighScore(val) { this.scoreManager.isNewHighScore = val; }

	get debugSettings() { return this.debugManager.settings; }
	set debugSettings(val) { this.debugManager.settings = val; }
	get isDebugMenuOpen() { return this.debugManager.isOpen; }
	set isDebugMenuOpen(val) { this.debugManager.isOpen = val; }

	get isRankingModalOpen() { return this.uiManager.isRankingModalOpen; }
	get isConfirmModalOpen() { return this.uiManager.isConfirmModalOpen; }
	get isEnteringName() { return this.uiManager.isEnteringName; }
	get bossHUDVisible() { return this.uiManager.bossHUDVisible; }

	// =========================================================================
	// 初期化・メインループ
	// =========================================================================

	/**
	 * ゲームの初期化
	 */
	init() {
		const container = document.getElementById('game-container');
		if (!container) {
			console.error('Game container not found');
			return;
		}

		// コアシステムの初期化
		this.renderer = new Renderer(container);
		this.input = new InputManager();
		this.touchController = new TouchController(this.input);
		this.cameraController = new CameraController(this.renderer.camera);

		// エンティティプールおよび各種マネージャーの初期化
		this.entityManager.initPools();
		this.enemySpawner = new EnemySpawner(this);
		this.effectManager = new EffectManager(this);
		this.stageManager = new StageManager(this);

		// 初期状態の設定とタイトルデモ構築
		this.state = GameState.TITLE;
		this.entityManager.setupTitleDemo();

		// UI・デバッグメニュー初期化
		this.uiManager.updateUI();
		this.uiManager.initUIEvents();
		this.debugManager.init();

		// メインループ開始
		this.start();
	}

	/**
	 * ゲームループの開始
	 */
	start() {
		this.clock.getDelta();
		const loop = () => {
			this.animationFrameId = requestAnimationFrame(loop);
			this.update();
			this.render();
		};
		loop();
	}

	/**
	 * 毎フレームの更新処理
	 */
	update() {
		let deltaTime = this.clock.getDelta();

		// タブ非アクティブ復帰時のトンネリング（衝突すり抜け）防止のため上限キャップ
		deltaTime = Math.min(deltaTime, 0.1);
		this.lastDeltaTime = deltaTime;

		this.debugManager.updateFps(deltaTime);

		if (this.input) {
			this.input.update(deltaTime);
		}

		// デバッグメニュー・ポーズメニュー表示中のゲームパッド入力処理
		if (this.debugManager.isOpen && this.input) {
			const gp = this.input.getGamepad();
			if (gp) this.debugManager.updateGamepad(gp);
		}
		if (this.state === GameState.PAUSE && this.input) {
			const gp = this.input.getGamepad();
			if (gp) this.uiManager.updatePauseMenuGamepad(gp);
		}

		this._handleGlobalCancelAndPause();

		switch (this.state) {
			case GameState.TITLE:
				this.updateTitle(deltaTime);
				break;
			case GameState.PLAYING:
				this.updatePlaying(deltaTime);
				break;
			case GameState.PAUSE:
				break;
			case GameState.GAMEOVER:
				this.updateGameOver(deltaTime);
				break;
			case GameState.CLEAR:
				this.updateGameClear(deltaTime);
				break;
		}

		if (this.input) {
			this.input.postUpdate();
		}
	}

	/**
	 * ESCキー・ポーズボタンによるグローバルなキャンセル・ポーズ切替処理
	 */
	_handleGlobalCancelAndPause() {
		if (!this.input) return;

		const isPausePressed = this.input.isPauseJustPressed();
		const isEscapeJustPressed = this.input.isKeyJustPressed('Escape');

		if (this.state === GameState.TITLE) {
			if (!isEscapeJustPressed && !isPausePressed) return;

			if (this.uiManager.isConfirmModalOpen) {
				const noBtn = document.getElementById('confirm-no-btn');
				if (noBtn) noBtn.click();
			} else if (this.uiManager.isRankingModalOpen) {
				const closeBtn = document.getElementById('ranking-close-btn');
				if (closeBtn) closeBtn.click();
			}
			return;
		}

		if (!isPausePressed) return;

		if (this.state === GameState.PLAYING) {
			this.state = GameState.PAUSE;
			if (window.audioManager) audioManager.pauseBGM();
			this.uiManager.resetPauseMenuState();
			this.uiManager.updateUI();

			setTimeout(() => {
				const resumeBtn = document.getElementById('pause-resume-btn');
				if (resumeBtn) resumeBtn.focus();
			}, 50);
		} else if (this.state === GameState.PAUSE) {
			this.state = GameState.PLAYING;
			if (window.audioManager) audioManager.resumeBGM();
			this.uiManager.updateUI();
		}
	}

	/**
	 * 描画処理
	 * @param {number} [deltaTime]
	 */
	render(deltaTime) {
		if (!this.renderer) return;
		const dt = deltaTime !== undefined ? deltaTime : (this.lastDeltaTime || 0.016);
		this.renderer.render(dt);
	}

	// =========================================================================
	// 状態ごとの更新処理
	// =========================================================================

	/**
	 * タイトル画面状態の更新
	 * @param {number} deltaTime
	 */
	updateTitle(deltaTime) {
		const elapsedTime = this.clock.getElapsedTime();
		this.entityManager.updateTitleDemo(deltaTime, elapsedTime);

		const gp = this.input ? this.input.getGamepad() : null;
		const gpStartJust = gp && gp.buttons[9]?.pressed && !this.input.prevGamepadButtons[9];

		if (gpStartJust && !this.debugManager.isOpen) {
			this.startGame();
		}

		if (this.input && !this.debugManager.isOpen) {
			this.uiManager.updateTitleMenuGamepad(gp);
		}
	}

	/**
	 * ゲームプレイ状態の更新
	 * @param {number} deltaTime
	 */
	updatePlaying(deltaTime) {
		if (!this.player && this.state !== GameState.GAMEOVER) return;

		let timeScale = 1.0;
		if (this.stageManager && GameConfig.loopSystem) {
			timeScale = this.stageManager.getTimeScale();
		}
		const gameDeltaTime = deltaTime * timeScale;

		let playerX = 0.0;
		let playerY = 1.0;
		let playerZ = 0.0;
		if (this.player && this.player.mesh) {
			playerX = this.player.mesh.position.x;
			playerY = this.player.mesh.position.y;
			playerZ = this.player.mesh.position.z;
		} else if (this.lastPlayerPosition) {
			playerX = this.lastPlayerPosition.x;
			playerY = this.lastPlayerPosition.y;
			playerZ = this.lastPlayerPosition.z;
		}
		const playerPos = new THREE.Vector3(playerX, playerY, playerZ);
		const cameraZ = (this.renderer && this.renderer.camera)
			? this.renderer.camera.position.z
			: (playerZ + 13.0);

		const activePlayer = (this.player && this.player.mesh)
			? this.player
			: { mesh: { position: playerPos }, life: 0, ammo: 0, powerLevel: 1, state: 'DEAD' };

		if (this.player && this.player.mesh && this.player.state === 'DYING') {
			this.scrollSpeed = Math.max(0, this.scrollSpeed - deltaTime * GameConfig.game.scrollSpeed * 0.285);
		}

		if (this.renderer && this.renderer.dirLight) {
			this.renderer.dirLight.position.set(playerX, 50, playerZ);
			this.renderer.dirLight.target.position.set(playerX, 0, playerZ);
		}

		if (this.stageManager) {
			this.stageManager.update(deltaTime);
			if (this.stageManager.state === 'TRANSITION') {
				this.entityManager.bossDefeatedTimer = (this.entityManager.bossDefeatedTimer || 0.0) + deltaTime;
			}
		}

		if (this.player && this.player.mesh) {
			this.player.update(deltaTime, gameDeltaTime);
		}

		const currentStage = this.stageManager ? this.stageManager.getCurrentStage() : null;
		this.entityManager.updatePlayingEntities(
			deltaTime,
			gameDeltaTime,
			activePlayer,
			playerPos,
			playerZ,
			cameraZ,
			currentStage
		);

		this.debugManager.checkShortcuts();

		if (this.player && this.player.mesh && this.player.state === 'ALIVE') {
			this.collisionManager.checkCollisions();
		}

		if (this.effectManager) {
			this.effectManager.update(deltaTime, playerPos);
		}

		this.cameraController.update(gameDeltaTime, this.scrollSpeed, currentStage, this.entityManager.bossActiveRatio);

		if (this.renderer) {
			this.renderer.followPlayerZ(playerZ);
		}
	}

	/**
	 * ゲームオーバー状態の更新
	 * @param {number} deltaTime
	 */
	updateGameOver(deltaTime) {
		// ゲームオーバー中も背景・敵・弾・カメラの更新を維持する
		this.updatePlaying(deltaTime);

		if (this.input) {
			const gp = this.input.getGamepad();
			if (gp) this.uiManager.updateGameOverMenuGamepad(gp);
		}
	}

	/**
	 * ゲームクリア状態の更新
	 * @param {number} deltaTime
	 */
	updateGameClear(deltaTime) {
		if (this.player) {
			this.player.update(deltaTime);
			this.cameraController.update(deltaTime, this.scrollSpeed);
		}

		if (this.input && this.input.isStartJustPressed()) {
			this.startGame();
		}
	}

	// =========================================================================
	// 状態遷移（ゲーム開始・ゲームオーバー・タイトル復帰・破棄）
	// =========================================================================

	/**
	 * ゲーム開始処理
	 */
	startGame() {
		if (window.audioManager) {
			audioManager.stopBGM();
		}

		// デバッグ設定のシード値上書きを適用
		if (this.debugManager.settings.seedOverride !== null) {
			const targetStage = GameConfig.stages[this.debugManager.settings.startStage];
			if (targetStage && targetStage.cave) {
				targetStage.cave.seed = this.debugManager.settings.seedOverride;
			}
		}

		this.entityManager.clearActiveEntities();

		const fadeEl = document.getElementById('screen-fade');
		if (fadeEl) fadeEl.classList.remove('active');

		this.state = GameState.PLAYING;
		this.score = 0;
		this.scoreManager.isNewHighScore = false;
		this.scrollSpeed = GameConfig.game.scrollSpeed;

		if (this.input && this.input.resetMovement) {
			this.input.resetMovement();
		}

		this.clock.start();

		this.entityManager.clearTitleDemo();
		this.setupGameScene();

		if (this.stageManager) {
			this.stageManager.init();
		}

		this.uiManager.updateUI();
	}

	/**
	 * ゲームプレイ用シーンの構築
	 */
	setupGameScene() {
		this.entityManager.clearGridHelper();
		this.entityManager.clearCaveWalls();

		if (this.player) {
			this.player.destroy();
		}
		this.player = new Player(this);

		if (this.debugManager.settings.invincible) {
			this.player.isDebugInvincible = true;
		}
		if (this.debugManager.settings.maxPower) {
			this.player.powerLevel = GameConfig.player.maxPowerLevel;
		}

		if (this.cameraController) {
			this.cameraController.isDyingMode = false;
			this.cameraController.setTarget(this.player.mesh);
		}

		this.scrollSpeed = GameConfig.game.scrollSpeed;
	}

	/**
	 * ゲームオーバー移行処理
	 */
	handleGameOver() {
		if (window.audioManager) {
			audioManager.stopBGM();
			audioManager.playBGM('gameOver');
		}

		this.state = GameState.GAMEOVER;

		if (this.player) {
			this.lastPlayerPosition = this.player.mesh.position.clone();
			this.player.destroy();
			this.player = null;
		} else {
			this.lastPlayerPosition = new THREE.Vector3(0, 1.0, 0);
		}

		this.cameraController.setTarget(null);

		const isRecordable = this.debugManager.isScoreRecordable();
		this.uiManager.isEnteringName = this.scoreManager.isScoreInTop10(this.score, isRecordable);
		this.scoreManager.isNewHighScore = this.score > this.scoreManager.highScore && isRecordable;
		if (this.scoreManager.isNewHighScore) {
			this.scoreManager.highScore = this.score;
		}

		this.uiManager.resetGameOverMenuState();
		this.uiManager.updateUI();

		setTimeout(() => {
			if (this.uiManager.isEnteringName) {
				const inputEl = document.getElementById('highscore-name-input');
				if (inputEl) inputEl.focus();
			} else {
				const restartBtn = document.getElementById('gameover-restart-btn');
				if (restartBtn) restartBtn.focus();
			}
		}, 50);
	}

	/**
	 * ゲームを終了してタイトル画面に戻る
	 */
	exitToTitle() {
		this.state = GameState.TITLE;
		this.scrollSpeed = GameConfig.game.scrollSpeed;

		if (this.input && this.input.resetMovement) {
			this.input.resetMovement();
		}

		this.entityManager.clearActiveEntities();

		if (this.player) {
			this.player.destroy();
			this.player = null;
		}

		const bossHUD = document.getElementById('boss-hud');
		if (bossHUD) bossHUD.classList.add('boss-hud--hidden');
		this.uiManager.bossHUDVisible = false;

		this.entityManager.clearGridHelper();
		this.entityManager.clearCaveWalls();
		this.entityManager.setupTitleDemo();

		if (this.cameraController) {
			this.cameraController.isDyingMode = false;
		}
		this.renderer.camera.position.set(0, 5.0, 18.0);
		this.renderer.camera.lookAt(0, 1.0, -20.0);

		this.uiManager.updateUI();

		if (window.audioManager) {
			audioManager.stopBGM();
			audioManager.resumeBGM();
		}
	}

	/**
	 * ゲームの破棄・クリーンアップ
	 */
	destroy() {
		if (this.animationFrameId) {
			cancelAnimationFrame(this.animationFrameId);
		}

		this.entityManager.destroy();

		if (this.enemySpawner) {
			this.enemySpawner.destroy();
			this.enemySpawner = null;
		}

		if (this.effectManager) {
			this.effectManager.destroy();
			this.effectManager = null;
		}

		if (this.player) {
			this.player.destroy();
			this.player = null;
		}
	}

	// =========================================================================
	// マネージャーへの委譲メソッド（外部モジュールとの互換維持）
	// =========================================================================

	spawnPlayerBullet(x, y, z, dirX = 0, dirY = 0, dirZ = -1, customSpeed = null) {
		this.entityManager.spawnPlayerBullet(x, y, z, dirX, dirY, dirZ, customSpeed);
	}

	spawnEnemyBullet(x, y, z, dirX = 0, dirY = 0, dirZ = 1, customSpeed = null) {
		this.entityManager.spawnEnemyBullet(x, y, z, dirX, dirY, dirZ, customSpeed);
	}

	spawnItem(x, y, z) {
		this.entityManager.spawnItem(x, y, z);
	}

	spawnBoss(stageIndex) {
		this.entityManager.spawnBoss(stageIndex);
	}

	damageBoss(amount) {
		this.entityManager.damageBoss(amount);
	}

	clearActiveEntities() {
		this.entityManager.clearActiveEntities();
	}

	clearGridHelper() {
		this.entityManager.clearGridHelper();
	}

	setupCaveWalls() {
		this.entityManager.setupCaveWalls();
	}

	clearCaveWalls() {
		this.entityManager.clearCaveWalls();
	}

	updateCaveWalls(playerZ) {
		this.entityManager.updateCaveWalls(playerZ);
	}

	checkCollisions() {
		this.collisionManager.checkCollisions();
	}

	updateUI() {
		this.uiManager.updateUI();
	}

	triggerHUDFlash(elementId, className) {
		this.uiManager.triggerHUDFlash(elementId, className);
	}

	triggerNoAmmoWarning() {
		this.uiManager.triggerNoAmmoWarning();
	}

	showBossHUD() {
		this.uiManager.showBossHUD();
	}

	hideBossHUD() {
		this.uiManager.hideBossHUD();
	}

	updateBossHPBar() {
		this.uiManager.updateBossHPBar();
	}

	toggleDebugMenu(forceState = null) {
		this.debugManager.toggle(forceState);
	}

	isScoreRecordable() {
		return this.debugManager.isScoreRecordable();
	}
}
