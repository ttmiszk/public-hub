import { CONFIG } from './config.js';

/**
 * スティック入力にデッドゾーンを適用して再スケーリングするユーティリティ
 * @param {number} value 生の軸入力値 (-1.0 〜 1.0)
 * @param {number} deadzone デッドゾーン閾値 (0.0 〜 <1.0)
 * @returns {number}
 */
export function applyDeadzone(value, deadzone = CONFIG.INPUT.GAMEPAD_DEADZONE) {
	const absVal = Math.abs(value);
	if (absVal <= deadzone) {
		return 0;
	}
	const scaled = (absVal - deadzone) / (1 - deadzone);
	return Math.min(1, scaled) * Math.sign(value);
}

/**
 * キーボードと Gamepad API の入力を統合管理するクラス
 * 1フレーム内の「押下継続(Held)」と「押した瞬間(JustPressed)」を正規化して提供する。
 */
export class InputManager {
	constructor(targetWindow = typeof window !== 'undefined' ? window : null) {
		this._window = targetWindow;
		this._pressedKeys = new Set();
		this._connectedGamepads = new Map();
		this._connectionListeners = new Set();

		// 公開入力状態（毎フレーム update() で更新）
		this.moveX = 0;
		this.moveY = 0;
		this.jumpHeld = false;
		this.jumpJustPressed = false;
		this.confirmHeld = false;
		this.confirmJustPressed = false;
		this.pauseJustPressed = false;
		this.cameraSwitchJustPressed = false;
		this.muteJustPressed = false;
		this.menuUpJustPressed = false;
		this.menuDownJustPressed = false;
		this.menuLeftJustPressed = false;
		this.menuRightJustPressed = false;
		this.anyInteractionJustPressed = false;

		// エッジトリガー判定用の前フレーム状態
		this._prevJump = false;
		this._prevConfirm = false;
		this._prevPause = false;
		this._prevCameraSwitch = false;
		this._prevMute = false;
		this._prevMenuUp = false;
		this._prevMenuDown = false;
		this._prevMenuLeft = false;
		this._prevMenuRight = false;
		this._hadKeyDownThisFrame = false;

		this._onKeyDown = this._handleKeyDown.bind(this);
		this._onKeyUp = this._handleKeyUp.bind(this);
		this._onBlur = this._handleBlur.bind(this);
		this._onGamepadConnected = this._handleGamepadConnected.bind(this);
		this._onGamepadDisconnected = this._handleGamepadDisconnected.bind(this);

		this._bindEvents();
		this._scanInitialGamepads();
	}

	_bindEvents() {
		if (!this._window) {
			return;
		}
		this._window.addEventListener('keydown', this._onKeyDown);
		this._window.addEventListener('keyup', this._onKeyUp);
		this._window.addEventListener('blur', this._onBlur);
		this._window.addEventListener('gamepadconnected', this._onGamepadConnected);
		this._window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);
	}

	_scanInitialGamepads() {
		const pads = this._getGamepads();
		for (const pad of pads) {
			if (pad && pad.connected) {
				this._connectedGamepads.set(pad.index, pad.id || `Gamepad ${pad.index + 1}`);
			}
		}
	}

	_handleKeyDown(event) {
		const preventCodes = new Set([
			'ArrowUp',
			'ArrowDown',
			'ArrowLeft',
			'ArrowRight',
			'Space'
		]);
		if (preventCodes.has(event.code)) {
			event.preventDefault();
		}
		this._pressedKeys.add(event.code);
		this._hadKeyDownThisFrame = true;
	}

	_handleKeyUp(event) {
		this._pressedKeys.delete(event.code);
	}

	_handleBlur() {
		// ウィンドウフォーカス喪失時のキー押しっぱなし残留を防止する
		this._pressedKeys.clear();
	}

	_handleGamepadConnected(event) {
		const pad = event.gamepad;
		if (!pad) {
			return;
		}
		this._connectedGamepads.set(pad.index, pad.id || `Gamepad ${pad.index + 1}`);
		this._notifyConnectionChange();
	}

	_handleGamepadDisconnected(event) {
		const pad = event.gamepad;
		if (!pad) {
			return;
		}
		this._connectedGamepads.delete(pad.index);
		this._notifyConnectionChange();
	}

	/**
	 * ゲームパッド接続状態の変化を購読する
	 * @param {(info: { connected: boolean, count: number, primaryName: string }) => void} listener
	 * @returns {() => void}
	 */
	onGamepadChange(listener) {
		this._connectionListeners.add(listener);
		listener(this.getGamepadStatus());
		return () => this._connectionListeners.delete(listener);
	}

	_notifyConnectionChange() {
		const status = this.getGamepadStatus();
		for (const listener of this._connectionListeners) {
			listener(status);
		}
	}

	getGamepadStatus() {
		const firstEntry = this._connectedGamepads.values().next();
		return {
			connected: this._connectedGamepads.size > 0,
			count: this._connectedGamepads.size,
			primaryName: firstEntry.done ? '' : firstEntry.value
		};
	}

	_getGamepads() {
		if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
			return [];
		}
		try {
			return navigator.getGamepads() || [];
		} catch (_err) {
			return [];
		}
	}

	/**
	 * 毎フレームの先頭で呼び出し、入力状態とエッジトリガーを更新する
	 */
	update() {
		// キーボード入力の読み取り
		let keyX = 0;
		if (this._pressedKeys.has('ArrowLeft')) {
			keyX -= 1;
		}
		if (this._pressedKeys.has('ArrowRight')) {
			keyX += 1;
		}

		let keyY = 0;
		if (this._pressedKeys.has('ArrowUp')) {
			keyY += 1;
		}
		if (this._pressedKeys.has('ArrowDown')) {
			keyY -= 1;
		}

		const keyJump = this._pressedKeys.has('Space');
		const keyConfirm = this._pressedKeys.has('Enter');
		const keyPause = this._pressedKeys.has('Escape');
		const keyCamera = this._pressedKeys.has('KeyC') || this._pressedKeys.has('KeyV');
		const keyMute = this._pressedKeys.has('KeyM');

		// ゲームパッド入力の読み取り（最初に検出された接続済みパッドを優先）
		let padX = 0;
		let padY = 0;
		let padJump = false;
		let padConfirm = false;
		let padPause = false;
		let padCamera = false;

		const pads = this._getGamepads();
		let detectedAny = false;
		for (const pad of pads) {
			if (!pad || !pad.connected) {
				continue;
			}
			if (!this._connectedGamepads.has(pad.index)) {
				this._connectedGamepads.set(pad.index, pad.id || `Gamepad ${pad.index + 1}`);
				detectedAny = true;
			}

			// 標準マッピング: 0=A, 3=Y, 5=RB, 9=Start, 12=Up, 13=Down, 14=Left, 15=Right
			const buttons = pad.buttons || [];
			const axes = pad.axes || [];

			const stickX = axes.length > 0 ? applyDeadzone(axes[0]) : 0;
			// Gamepad の Y 軸は上が負値のため、上=+1 に揃えるよう反転する
			const stickY = axes.length > 1 ? applyDeadzone(-axes[1]) : 0;

			const dpadLeft = Boolean(buttons[14]?.pressed);
			const dpadRight = Boolean(buttons[15]?.pressed);
			const dpadUp = Boolean(buttons[12]?.pressed);
			const dpadDown = Boolean(buttons[13]?.pressed);

			let dpadX = 0;
			if (dpadLeft) {
				dpadX -= 1;
			}
			if (dpadRight) {
				dpadX += 1;
			}

			let dpadY = 0;
			if (dpadUp) {
				dpadY += 1;
			}
			if (dpadDown) {
				dpadY -= 1;
			}

			padX = dpadX !== 0 ? dpadX : stickX;
			padY = dpadY !== 0 ? dpadY : stickY;

			// Aボタンはジャンプおよびメニュー決定を兼ねる
			padJump = Boolean(buttons[0]?.pressed);
			padConfirm = Boolean(buttons[0]?.pressed);
			padCamera = Boolean(buttons[3]?.pressed) || Boolean(buttons[5]?.pressed);
			padPause = Boolean(buttons[9]?.pressed);
			break;
		}

		if (detectedAny) {
			this._notifyConnectionChange();
		}

		// キーボードとゲームパッドを統合（[-1, 1] へクランプ）
		this.moveX = Math.max(-1, Math.min(1, keyX + padX));
		this.moveY = Math.max(-1, Math.min(1, keyY + padY));

		const jumpNow = keyJump || padJump;
		const confirmNow = keyConfirm || padConfirm;
		const pauseNow = keyPause || padPause;
		const cameraNow = keyCamera || padCamera;
		const menuUpNow = this.moveY >= CONFIG.INPUT.STICK_DIGITAL_THRESHOLD;
		const menuDownNow = this.moveY <= -CONFIG.INPUT.STICK_DIGITAL_THRESHOLD;
		const menuLeftNow = this.moveX <= -CONFIG.INPUT.STICK_DIGITAL_THRESHOLD;
		const menuRightNow = this.moveX >= CONFIG.INPUT.STICK_DIGITAL_THRESHOLD;

		this.jumpHeld = jumpNow;
		this.jumpJustPressed = jumpNow && !this._prevJump;

		this.confirmHeld = confirmNow;
		this.confirmJustPressed = confirmNow && !this._prevConfirm;

		this.pauseJustPressed = pauseNow && !this._prevPause;
		this.cameraSwitchJustPressed = cameraNow && !this._prevCameraSwitch;
		this.muteJustPressed = keyMute && !this._prevMute;
		this.menuUpJustPressed = menuUpNow && !this._prevMenuUp;
		this.menuDownJustPressed = menuDownNow && !this._prevMenuDown;
		this.menuLeftJustPressed = menuLeftNow && !this._prevMenuLeft;
		this.menuRightJustPressed = menuRightNow && !this._prevMenuRight;
		this.anyInteractionJustPressed = this._hadKeyDownThisFrame
			|| this.jumpJustPressed
			|| this.confirmJustPressed
			|| this.pauseJustPressed
			|| this.cameraSwitchJustPressed;
		this._hadKeyDownThisFrame = false;

		this._prevJump = jumpNow;
		this._prevConfirm = confirmNow;
		this._prevPause = pauseNow;
		this._prevCameraSwitch = cameraNow;
		this._prevMute = keyMute;
		this._prevMenuUp = menuUpNow;
		this._prevMenuDown = menuDownNow;
		this._prevMenuLeft = menuLeftNow;
		this._prevMenuRight = menuRightNow;
	}

	/**
	 * イベントリスナーを解放する
	 */
	dispose() {
		if (!this._window) {
			return;
		}
		this._window.removeEventListener('keydown', this._onKeyDown);
		this._window.removeEventListener('keyup', this._onKeyUp);
		this._window.removeEventListener('blur', this._onBlur);
		this._window.removeEventListener('gamepadconnected', this._onGamepadConnected);
		this._window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
		this._pressedKeys.clear();
		this._connectionListeners.clear();
	}
}
