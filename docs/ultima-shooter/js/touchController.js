/**
 * @fileoverview touchController.js
 * モバイルブラウザ向けタッチ操作コントローラー。
 * 仮想アナログジョイスティック、FIREボタン、CAM（視点切替）ボタン、PAUSEボタンの
 * マルチタッチ入力を処理し、InputManager へ抽象化された入力値を渡す。
 */

/**
 * モバイルタッチコントローラークラス
 */
class TouchController {
	/**
	 * @param {InputManager} inputManager
	 */
	constructor(inputManager) {
		/** @type {InputManager} */
		this.input = inputManager;

		/** @type {boolean} タッチ操作UIを有効化するか */
		this.enabled = this._detectTouchCapability();
		/** @type {boolean} ゲーム状態として表示許可されているか */
		this.visible = false;

		// マルチタッチ追跡ID
		/** @type {number|null} */
		this.joystickTouchId = null;
		/** @type {number|null} */
		this.fireTouchId = null;

		/** @type {number} ジョイスティックのデッドゾーン (0.0〜1.0) */
		this.deadzone = 0.1;

		// DOM要素参照
		this.rootEl = document.getElementById('touch-controls');
		this.joystickZoneEl = document.getElementById('touch-joystick-zone');
		this.joystickBaseEl = document.getElementById('touch-joystick-base');
		this.joystickKnobEl = document.getElementById('touch-joystick-knob');
		this.fireBtnEl = document.getElementById('touch-fire-btn');
		this.pauseBtnEl = document.getElementById('touch-pause-btn');
		this.cameraBtnEl = document.getElementById('touch-camera-btn');

		this._bindEvents();
	}

	/**
	 * タッチ対応デバイスかどうかを判定する
	 * @returns {boolean}
	 */
	_detectTouchCapability() {
		const coarsePointer = typeof window.matchMedia === 'function' &&
			window.matchMedia('(pointer: coarse)').matches;
		const hasTouch = ('ontouchstart' in window) && (navigator.maxTouchPoints > 0);
		return coarsePointer || hasTouch;
	}

	/**
	 * タッチUIの表示状態を更新する（プレイ中かつタッチ有効時のみ表示）
	 * @param {boolean} visible
	 */
	setVisible(visible) {
		this.visible = !!visible;
		if (!this.rootEl) return;

		const wasShown = !this.rootEl.classList.contains('hidden');
		const shouldShow = this.enabled && this.visible;
		this.rootEl.classList.toggle('hidden', !shouldShow);
		this.rootEl.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
		if (document.body) {
			document.body.classList.toggle('touch-ui-active', shouldShow);
		}

		// 非表示へ遷移した瞬間、またはアクティブなタッチが残っている場合のみリセットする
		// （PCなど非タッチ環境で updateUI() ごとにキーボード入力が初期化されるのを防止）
		if (!shouldShow && (wasShown || this.joystickTouchId !== null || this.fireTouchId !== null)) {
			this._resetActiveTouches();
		}
	}

	/**
	 * 進行中のタッチ入力状態を安全にリセットする
	 */
	_resetActiveTouches() {
		this.joystickTouchId = null;
		this.fireTouchId = null;

		if (this.joystickKnobEl) {
			this.joystickKnobEl.style.transform = 'translate3d(0px, 0px, 0px)';
		}
		if (this.joystickBaseEl) {
			this.joystickBaseEl.classList.remove('active');
		}
		if (this.fireBtnEl) {
			this.fireBtnEl.classList.remove('active');
		}
		if (this.input) {
			this.input.setTouchMove(0.0, 0.0, false);
			this.input.setTouchFire(false);
		}
	}

	/**
	 * タッチイベントのバインド
	 */
	_bindEvents() {
		// PC/ハイブリッド端末でも最初のタッチ入力を検知したタイミングで自動有効化する
		window.addEventListener('touchstart', () => {
			if (!this.enabled) {
				this.enabled = true;
				this.setVisible(this.visible);
			}
		}, { passive: true, once: true });

		if (!this.rootEl) return;

		// 仮想ジョイスティック
		if (this.joystickZoneEl) {
			this.joystickZoneEl.addEventListener('touchstart', (e) => {
				e.preventDefault();
				if (this.joystickTouchId !== null) return;
				const touch = e.changedTouches[0];
				if (!touch) return;
				this.joystickTouchId = touch.identifier;
				if (this.joystickBaseEl) this.joystickBaseEl.classList.add('active');
				this._updateJoystickFromTouch(touch);
			}, { passive: false });

			this.joystickZoneEl.addEventListener('touchmove', (e) => {
				if (this.joystickTouchId === null) return;
				const touch = this._findTouchById(e.changedTouches, this.joystickTouchId);
				if (!touch) return;
				e.preventDefault();
				this._updateJoystickFromTouch(touch);
			}, { passive: false });

			const endJoystick = (e) => {
				if (this.joystickTouchId === null) return;
				const touch = this._findTouchById(e.changedTouches, this.joystickTouchId);
				if (!touch) return;
				e.preventDefault();
				this.joystickTouchId = null;
				if (this.joystickKnobEl) {
					this.joystickKnobEl.style.transform = 'translate3d(0px, 0px, 0px)';
				}
				if (this.joystickBaseEl) {
					this.joystickBaseEl.classList.remove('active');
				}
				if (this.input) {
					this.input.setTouchMove(0.0, 0.0, false);
				}
			};
			this.joystickZoneEl.addEventListener('touchend', endJoystick, { passive: false });
			this.joystickZoneEl.addEventListener('touchcancel', endJoystick, { passive: false });
		}

		// FIREボタン（押しっぱなし連射）
		if (this.fireBtnEl) {
			this.fireBtnEl.addEventListener('touchstart', (e) => {
				e.preventDefault();
				if (this.fireTouchId !== null) return;
				const touch = e.changedTouches[0];
				if (!touch) return;
				this.fireTouchId = touch.identifier;
				this.fireBtnEl.classList.add('active');
				if (this.input) this.input.setTouchFire(true);
			}, { passive: false });

			const endFire = (e) => {
				if (this.fireTouchId === null) return;
				const touch = this._findTouchById(e.changedTouches, this.fireTouchId);
				if (!touch) return;
				e.preventDefault();
				this.fireTouchId = null;
				this.fireBtnEl.classList.remove('active');
				if (this.input) this.input.setTouchFire(false);
			};
			this.fireBtnEl.addEventListener('touchend', endFire, { passive: false });
			this.fireBtnEl.addEventListener('touchcancel', endFire, { passive: false });
		}

		// PAUSEボタン
		if (this.pauseBtnEl) {
			this.pauseBtnEl.addEventListener('touchstart', (e) => {
				e.preventDefault();
				if (this.input) this.input.triggerTouchPause();
			}, { passive: false });
		}

		// CAM（視点切替）ボタン
		if (this.cameraBtnEl) {
			this.cameraBtnEl.addEventListener('touchstart', (e) => {
				e.preventDefault();
				if (this.input) this.input.triggerTouchCameraToggle();
			}, { passive: false });
		}
	}

	/**
	 * TouchList から指定IDのタッチオブジェクトを検索する
	 * @param {TouchList} touchList
	 * @param {number} id
	 * @returns {Touch|null}
	 */
	_findTouchById(touchList, id) {
		for (let i = 0; i < touchList.length; i++) {
			if (touchList[i].identifier === id) return touchList[i];
		}
		return null;
	}

	/**
	 * タッチ座標からジョイスティックのアナログ入力値を算出し InputManager へ反映する
	 * @param {Touch} touch
	 */
	_updateJoystickFromTouch(touch) {
		if (!this.joystickBaseEl || !this.input) return;

		const rect = this.joystickBaseEl.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const maxRadius = Math.max(20, rect.width * 0.38);

		const dx = touch.clientX - centerX;
		const dy = touch.clientY - centerY;
		const dist = Math.hypot(dx, dy);

		const clampedDist = Math.min(dist, maxRadius);
		const angle = Math.atan2(dy, dx);
		const clampedX = dist > 0 ? Math.cos(angle) * clampedDist : 0;
		const clampedY = dist > 0 ? Math.sin(angle) * clampedDist : 0;

		if (this.joystickKnobEl) {
			this.joystickKnobEl.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0px)`;
		}

		// デッドゾーン適用後に 0.0〜1.0 へ再マッピング
		const normalizedMag = clampedDist / maxRadius;
		if (normalizedMag <= this.deadzone) {
			this.input.setTouchMove(0.0, 0.0, true);
			return;
		}

		const scaledMag = (normalizedMag - this.deadzone) / (1.0 - this.deadzone);
		const normX = Math.cos(angle) * scaledMag;
		const normY = Math.sin(angle) * scaledMag;
		this.input.setTouchMove(normX, normY, true);
	}
}
