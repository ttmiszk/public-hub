/**
 * @fileoverview cameraController.js
 * カメラ制御クラス。3つの視点モード（後方追尾 / 自機中心固定 / 一人称コックピット）の
 * 切り替え、自機追従、壁めり込み防止、ロール傾き、スクリーンシェイク演出を担当する。
 */

/**
 * カメラ視点モードの定義
 * @enum {string}
 */
const CameraMode = {
	CHASE: 'CHASE',       // 後方からの追尾視点（従来）
	LOCKED: 'LOCKED',     // 自機を画面中心に固定する後方追尾視点
	COCKPIT: 'COCKPIT'    // 一人称コックピット視点
};

const CAMERA_MODE_ORDER = [CameraMode.CHASE, CameraMode.LOCKED, CameraMode.COCKPIT];

const CAMERA_MODE_LABELS = {
	[CameraMode.CHASE]: 'CHASE VIEW',
	[CameraMode.LOCKED]: 'CENTER LOCK VIEW',
	[CameraMode.COCKPIT]: 'COCKPIT VIEW'
};

// GC 対策用の一時ベクトル
const _camTempPos = new THREE.Vector3();
const _camTempLook = new THREE.Vector3();
const _camTempForward = new THREE.Vector3();
const _camTempUp = new THREE.Vector3();

/**
 * カメラ制御クラス
 */
class CameraController {
	/**
	 * @param {THREE.Camera} camera
	 */
	constructor(camera) {
		/** @type {THREE.Camera} */
		this.camera = camera;
		/** @type {THREE.Object3D|null} */
		this.target = null;

		/** @type {CameraMode} 現在の視点モード */
		this.mode = this._loadSavedMode();

		// 後方追尾モード用の基準オフセット
		this.offset = new THREE.Vector3(0.0, 1.2, 3.2);
		this.lookAtOffset = new THREE.Vector3(0.0, 0.0, -10.0);

		// 自機中心固定モード用の固定オフセット
		this.lockedOffset = new THREE.Vector3(0.0, 1.35, 4.6);

		// コックピット視点用のローカル位置（発射口高さとの視差を抑えたコックピット基準点）
		this.cockpitLocalOffset = new THREE.Vector3(0.0, 0.24, -0.82);

		// カメラ追従の滑らかさ (CHASE モード用)
		this.lerpSpeed = GameConfig.camera.lerpSpeed;

		// 現在のカメラ傾きロール角 (ラジアン)
		this.currentRoll = 0.0;

		/** @type {boolean} 自機墜落中の見送りモードフラグ */
		this.isDyingMode = false;

		// スクリーンシェイク（画面揺れ）用変数
		this.shakeAmount = 0.0;
		this.shakeDuration = 0.0;
		this.shakeTimer = 0.0;
	}

	/**
	 * 保存済みのカメラモードを localStorage から読み込む
	 * @returns {CameraMode}
	 */
	_loadSavedMode() {
		try {
			const saved = localStorage.getItem('ultima_camera_mode');
			if (saved && CAMERA_MODE_ORDER.includes(saved)) {
				return saved;
			}
		} catch (e) {}
		return CameraMode.CHASE;
	}

	/**
	 * 現在のカメラモードを localStorage へ保存する
	 */
	_saveMode() {
		try {
			localStorage.setItem('ultima_camera_mode', this.mode);
		} catch (e) {}
	}

	/**
	 * カメラモードを次のモードへ切り替える（CHASE → LOCKED → COCKPIT → CHASE）
	 * @returns {CameraMode} 切り替え後のモード
	 */
	cycleMode() {
		const idx = CAMERA_MODE_ORDER.indexOf(this.mode);
		const nextIdx = (idx + 1) % CAMERA_MODE_ORDER.length;
		this.mode = CAMERA_MODE_ORDER[nextIdx];
		this._saveMode();
		return this.mode;
	}

	/**
	 * 現在のモード表示ラベルを返す
	 * @returns {string}
	 */
	getModeLabel() {
		return CAMERA_MODE_LABELS[this.mode] || this.mode;
	}

	/**
	 * 一人称コックピット視点かどうか（墜落見送り時は三人称へ戻る）
	 * @returns {boolean}
	 */
	isCockpitViewActive() {
		return this.mode === CameraMode.COCKPIT && !this.isDyingMode && !!this.target;
	}

	/**
	 * 追従対象のオブジェクトを設定する
	 * @param {THREE.Object3D|null} target
	 */
	setTarget(target) {
		this.target = target;
	}

	/**
	 * スクリーンシェイク（画面揺れ）をトリガーする
	 * @param {number} amount - 揺れの最大幅
	 * @param {number} duration - 揺れ時間（秒）
	 */
	shake(amount, duration) {
		this.shakeAmount = amount;
		this.shakeDuration = duration;
		this.shakeTimer = duration;
	}

	/**
	 * 毎フレームの更新処理
	 * @param {number} deltaTime
	 * @param {number} scrollSpeed
	 * @param {Object|null} [stageConfig=null]
	 * @param {number} [bossActiveRatio=0.0]
	 */
	update(deltaTime, scrollSpeed, stageConfig = null, bossActiveRatio = 0.0) {
		if (this.isDyingMode && this.target) {
			this._updateDyingView(deltaTime, scrollSpeed, stageConfig, bossActiveRatio);
			this._applyShake(deltaTime);
			return;
		}

		if (this.target) {
			if (this.mode === CameraMode.LOCKED) {
				this._updateLockedView(stageConfig, bossActiveRatio);
			} else if (this.mode === CameraMode.COCKPIT) {
				this._updateCockpitView();
			} else {
				this._updateChaseView(stageConfig, bossActiveRatio);
			}
		} else {
			// 自機不在時（タイトルデモ・ゲームオーバー）
			if (!(window.game && window.game.state === 'GAMEOVER')) {
				this.camera.position.z -= scrollSpeed * deltaTime;
			}
			this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, 0.0, 0.1);
			this.camera.up.set(Math.sin(this.currentRoll), Math.cos(this.currentRoll), 0);
		}

		this._applyShake(deltaTime);
	}

	/**
	 * 墜落見送りモードの更新
	 */
	_updateDyingView(deltaTime, scrollSpeed, stageConfig, bossActiveRatio) {
		this.camera.position.z -= scrollSpeed * deltaTime;

		const camCave = stageConfig ? getCaveBoundsAt(this.camera.position.z, stageConfig, bossActiveRatio) : null;
		if (camCave) {
			this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, camCave.centerX, 0.03);
			this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, camCave.centerY + 1.0, 0.03);
		}

		this.camera.lookAt(this.target.position);
		this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, 0.0, 0.05);
		this.camera.up.set(Math.sin(this.currentRoll), Math.cos(this.currentRoll), 0);
	}

	/**
	 * 視点1: 従来の後方追尾視点（CHASE）
	 */
	_updateChaseView(stageConfig, bossActiveRatio) {
		const playerZ = this.target.position.z;
		const cave = stageConfig ? getCaveBoundsAt(playerZ, stageConfig, bossActiveRatio) : null;

		let dynamicOffsetY = this.offset.y;
		if (cave && this.target.position.y > cave.centerY) {
			const startY = cave.centerY;
			const maxYVal = cave.top - 1.0;
			const t = Math.min(1.0, Math.max(0.0, (this.target.position.y - startY) / (maxYVal - startY)));
			dynamicOffsetY = THREE.MathUtils.lerp(this.offset.y, 0.5, t);
		}

		const camTargetZ = playerZ + this.offset.z;
		const camCave = stageConfig ? getCaveBoundsAt(camTargetZ, stageConfig, bossActiveRatio) : null;

		const targetX = this.target.position.x;
		const targetY = this.target.position.y + dynamicOffsetY;

		let newX = THREE.MathUtils.lerp(this.camera.position.x, targetX, this.lerpSpeed * 0.9);
		let newY = THREE.MathUtils.lerp(this.camera.position.y, targetY, this.lerpSpeed * 1.1);

		if (camCave) {
			const marginX = 1.8;
			const marginYMin = 1.2;
			const marginYMax = 0.8;
			newX = Math.max(camCave.left + marginX, Math.min(camCave.right - marginX, newX));
			newY = Math.max(camCave.bottom + marginYMin, Math.min(camCave.top - marginYMax, newY));
		}

		this.camera.position.x = newX;
		this.camera.position.y = newY;
		this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, camTargetZ, this.lerpSpeed);

		const lookZ = playerZ - 50.0;
		const boundsForward = stageConfig ? getCaveBoundsAt(lookZ, stageConfig, bossActiveRatio) : null;
		_camTempLook.set(0, 6.0, lookZ);

		if (boundsForward) {
			_camTempLook.x = boundsForward.centerX;
			_camTempLook.y = boundsForward.centerY;
		} else {
			_camTempLook.addVectors(this.target.position, this.lookAtOffset);
		}
		this.camera.lookAt(_camTempLook);

		const inputX = (window.game && window.game.input) ? window.game.input.getMoveX() : 0.0;
		const curveDiff = boundsForward ? (boundsForward.centerX - this.target.position.x) : 0.0;
		const targetRoll = -inputX * 0.10 - curveDiff * 0.010;
		this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, targetRoll, 0.08);
		this.camera.up.set(Math.sin(this.currentRoll), Math.cos(this.currentRoll), 0);
	}

	/**
	 * 視点2: 自機中心固定・後方追尾視点（LOCKED）
	 * カメラ位置を自機へ即時同期し、注視点も自機の真正面方向へ固定することで
	 * 自機を画面中央に固定し、周囲の洞窟や敵空間をダイナミックに動かす。
	 */
	_updateLockedView(stageConfig, bossActiveRatio) {
		const px = this.target.position.x;
		const py = this.target.position.y;
		const pz = this.target.position.z;

		// 壁際でカメラが壁外へ突き抜けないよう、天井付近のみ Y オフセットを微調整する
		let offsetY = this.lockedOffset.y;
		const offsetZ = this.lockedOffset.z;
		const camCave = stageConfig ? getCaveBoundsAt(pz + offsetZ, stageConfig, bossActiveRatio) : null;
		if (camCave && (py + offsetY) > (camCave.top - 1.0)) {
			offsetY = Math.max(0.55, (camCave.top - 1.0) - py);
		}

		// 自機に対して遅延ゼロで同期（画面上で自機が前後左右にブレない）
		this.camera.position.set(px, py + offsetY, pz + offsetZ);

		// 注視点を自機の真正面（わずかに上を見据える水平線）に固定
		_camTempLook.set(px, py + offsetY * 0.15, pz - 60.0);
		this.camera.up.set(0, 1, 0);
		this.currentRoll = 0.0;
		this.camera.lookAt(_camTempLook);
	}

	/**
	 * 視点3: 一人称コックピット視点（COCKPIT）
	 * カメラの視線方向を自機の実際の向き（弾の発射方向）と完全に一致させ、
	 * 画面中央(50%, 50%)の照準レティクルと弾道がズレないように制御する。
	 */
	_updateCockpitView() {
		const px = this.target.position.x;
		const py = this.target.position.y;
		const pz = this.target.position.z;

		// コックピット位置（ローカル座標）を自機の姿勢でワールド変換
		_camTempPos.copy(this.cockpitLocalOffset).applyQuaternion(this.target.quaternion);
		this.camera.position.set(px + _camTempPos.x, py + _camTempPos.y, pz + _camTempPos.z);

		// 自機の正確な前方方向（player.fire() の _playerDirStraight と完全一致）
		_camTempForward.set(0, 0, -1).applyQuaternion(this.target.quaternion).normalize();

		// 弾の発射口 (0, 0, -1.9) から交戦距離 45 ユニット先の弾道収束点を注視し、上下視差を極小化
		_camTempLook.set(0, 0, -1.9).applyQuaternion(this.target.quaternion);
		_camTempLook.x += px + _camTempForward.x * 45.0;
		_camTempLook.y += py + _camTempForward.y * 45.0;
		_camTempLook.z += pz + _camTempForward.z * 45.0;

		// 3D 酔い軽減のためロールのみややマイルドに追従（視線軸周りの回転なので照準中心は一切ズレない）
		const targetRoll = this.target.rotation.z * 0.65;
		this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, targetRoll, 0.28);
		_camTempUp.set(-Math.sin(this.currentRoll), Math.cos(this.currentRoll), 0);
		this.camera.up.copy(_camTempUp);
		this.camera.lookAt(_camTempLook);
	}

	/**
	 * スクリーンシェイクの適用
	 * @param {number} deltaTime
	 */
	_applyShake(deltaTime) {
		if (this.shakeTimer <= 0) return;

		this.shakeTimer -= deltaTime;
		const progress = Math.max(0.0, this.shakeTimer / this.shakeDuration);
		const currentShake = this.shakeAmount * progress;
		const shakeAngle = 0.02 * currentShake;
		this.camera.rotation.x += (Math.random() - 0.5) * shakeAngle;
		this.camera.rotation.y += (Math.random() - 0.5) * shakeAngle;
	}
}
