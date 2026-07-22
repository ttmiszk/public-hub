/**
 * @fileoverview inputManager.js
 * 入力管理クラス。キーボードおよびゲームパッド(Gamepad API)の入力をラップし、
 * ゲーム内アクションへのマッピングや入力状態の平滑化を行う。
 */

/**
 * 入力管理クラス
 * キーボードとゲームパッド（Gamepad API）の入力を抽象化し、
 * ゲームロジックからデバイス依存を排除する。
 * ブラウザのデフォルトのキーイベント動作（スクロールなど）との競合を抑止。
 */
class InputManager {
    constructor() {
        /** @type {Object<string, boolean>} */
        this.keys = {};
        /** @type {Object<string, boolean>} */
        this.prevKeys = {};
        
        /** @type {number|null} */
        this.gamepadIndex = null;
        /** @type {boolean[]} */
        this.prevGamepadButtons = [];
        
        /** @type {number} デッドゾーン */
        this.deadzone = 0.18;
        
        // 仮想キーボード入力値 (スムーズな加減速補間用)
        /** @type {number} */
        this.keyboardX = 0.0;
        /** @type {number} */
        this.keyboardY = 0.0;

        // キー長押し時間 (プログレッシブ感度用)
        /** @type {number} */
        this.pressDurationX = 0.0;
        /** @type {number} */
        this.pressDurationY = 0.0;
        /** @type {number} 初期感度比率 (35%) */
        this.minSensitivityMultiplier = 0.35;
        /** @type {number} 最大感度になるまでの長押し時間 (0.25秒) */
        this.sensitivityRampTime = 0.25;

        /** @type {boolean} ゲームパッドが実際に人間によって操作されたか */
        this.gamepadActive = false;

        this.init();
    }

    /**
     * 初期化およびイベント登録
     */
    init() {
        // ブラウザのデフォルトの動作（画面スクロールやフォーカス離脱など）を防止するキーのリスト
        const preventKeys = [
            'Space', 'Enter', 'Escape',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyL', 'KeyK'
        ];

        // キーボード入力監視
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            // input要素にフォーカスがある場合はデフォルト動作を妨げない
            if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                return;
            }
            if (preventKeys.includes(e.code)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                return;
            }
            if (preventKeys.includes(e.code)) {
                e.preventDefault();
            }
        });

        // ゲームパッド接続監視
        window.addEventListener('gamepadconnected', (e) => {
            if (this.gamepadIndex === null) {
                this.gamepadIndex = e.gamepad.index;
            }
        });

        window.addEventListener('gamepaddisconnected', (e) => {
            if (this.gamepadIndex === e.gamepad.index) {
                this.gamepadIndex = null;
                this.gamepadActive = false; // アクティブ状態をリセット
                // 他に接続されているゲームパッドがあれば再割り当て
                const gamepads = navigator.getGamepads();
                for (let gp of gamepads) {
                    if (gp) {
                        this.gamepadIndex = gp.index;
                        break;
                    }
                }
            }
        });
    }

    /**
     * 前フレームの状態を保存する（ゲームループの最後で呼ぶ）
     */
    postUpdate() {
        this.prevKeys = { ...this.keys };
        
        const gp = this.getGamepad();
        if (gp) {
            this.prevGamepadButtons = gp.buttons.map(b => b.pressed);
        } else {
            this.prevGamepadButtons = [];
        }
    }

    /**
     * 現在接続されているゲームパッドを取得
     * @returns {Gamepad|null}
     */
    getGamepad() {
        // デバッグメニューでゲームパッドが無効化されている場合は無視 (幽霊入力防止)
        const game = window.game;
        if (game && game.debugSettings && !game.debugSettings.enableGamepad) {
            return null;
        }

        if (this.gamepadIndex === null) return null;
        const gamepads = navigator.getGamepads();
        const gp = gamepads[this.gamepadIndex];
        
        if (!gp) return null;
        
        // すでにアクティブならそのまま返す
        if (this.gamepadActive) return gp;
        
        // ゲームパッドが実際に操作されたかをチェックしてアクティベートする
        // 1. いずれかのボタンが押されたか
        const buttonPressed = gp.buttons && gp.buttons.some(b => b && b.pressed);
        if (buttonPressed) {
            this.gamepadActive = true;
            return gp;
        }
        
        // 2. スティックがデッドゾーンの1.5倍以上動かされたか
        const stickThreshold = this.deadzone * 1.5;
        const stickMoved = gp.axes && gp.axes.some(a => Math.abs(a) > stickThreshold);
        if (stickMoved) {
            this.gamepadActive = true;
            return gp;
        }
        
        // アクティブになるまでは入力を無視（nullを返す）
        return null;
    }

    /**
     * 横方向の移動入力を取得 (-1.0 〜 1.0)
     * @returns {number}
     */
    getMoveX() {
        // キーボード、D-pad、およびアナログスティックの統合累積値（-1.0 〜 1.0）
        return Math.max(-1.0, Math.min(1.0, this.keyboardX));
    }

    /**
     * 縦方向の移動入力を取得 (-1.0 〜 1.0)
     * @returns {number}
     */
    getMoveY() {
        // キーボード、D-pad、およびアナログスティックの統合累積値（-1.0 〜 1.0）
        return Math.max(-1.0, Math.min(1.0, this.keyboardY));
    }

    /**
     * ショットボタンが押されているか (押しっぱなし連射用)
     * @returns {boolean}
     */
    isFirePressed() {
        if (this.keys['Space']) return true;

        const gp = this.getGamepad();
        if (gp) {
            if (gp.buttons[0]?.pressed || gp.buttons[7]?.pressed) return true;
        }
        return false;
    }

    /**
     * ゲーム開始ボタンが「押された瞬間」か
     * @returns {boolean}
     */
    isStartJustPressed() {
        const kbJust = (this.keys['Space'] && !this.prevKeys['Space']) ||
                       (this.keys['Enter'] && !this.prevKeys['Enter']);
        if (kbJust) return true;

        const gp = this.getGamepad();
        if (gp) {
            const gpButton0Just = gp.buttons[0]?.pressed && !this.prevGamepadButtons[0];
            const gpButton9Just = gp.buttons[9]?.pressed && !this.prevGamepadButtons[9];
            if (gpButton0Just || gpButton9Just) return true;
        }
        return false;
    }

    /**
     * ポーズボタンが「押された瞬間」か
     * @returns {boolean}
     */
    isPauseJustPressed() {
        const kbJust = this.keys['Escape'] && !this.prevKeys['Escape'];
        if (kbJust) return true;

        const gp = this.getGamepad();
        if (gp) {
            const gpButton9Just = gp.buttons[9]?.pressed && !this.prevGamepadButtons[9];
            if (gpButton9Just) return true;
        }
        return false;
    }

    /**
     * ゲームパッドのSELECTボタンが「押された瞬間」であるかを判定
     * @returns {boolean}
     */
    isSelectJustPressed() {
        const gp = this.getGamepad();
        if (gp) {
            const gpButton8Just = gp.buttons[8]?.pressed && !this.prevGamepadButtons[8];
            if (gpButton8Just) return true;
        }
        return false;
    }

    /**
     * 特定のキーが押された瞬間であるかを判定 (デバッグ用など)
     * @param {string} code - キーコード
     * @returns {boolean}
     */
    isKeyJustPressed(code) {
        return !!(this.keys[code] && !this.prevKeys[code]);
    }

    /**
     * 毎フレームの入力更新 (キーボード仮想スティックのスムーズ加減速・慣性補間)
     * @param {number} deltaTime
     */
    update(deltaTime) {
        // キーボードおよびゲームパッドの十字キー入力を取得
        let hasLeft = this.keys['KeyA'] || this.keys['ArrowLeft'];
        let hasRight = this.keys['KeyD'] || this.keys['ArrowRight'];
        let hasUp = this.keys['KeyW'] || this.keys['ArrowUp'];
        let hasDown = this.keys['KeyS'] || this.keys['ArrowDown'];

        const gp = this.getGamepad();
        if (gp) {
            if (gp.buttons[14]?.pressed) hasLeft = true;
            if (gp.buttons[15]?.pressed) hasRight = true;
            if (gp.buttons[12]?.pressed) hasUp = true;
            if (gp.buttons[13]?.pressed) hasDown = true;
        }

        // 左右同時押し、または上下同時押しでのリセット判定
        const resetX = hasLeft && hasRight;
        const resetY = hasUp && hasDown;

        // デジタル入力があるかどうか
        const hasDigitalX = hasLeft || hasRight;
        const hasDigitalY = hasUp || hasDown;

        let targetX = 0.0;
        let isAnalogX = false;

        if (resetX) {
            this.keyboardX = 0.0;
            this.pressDurationX = 0.0; // 同時押し時はタイマーリセット
        } else if (hasDigitalX) {
            if (hasLeft) targetX -= 1.0;
            if (hasRight) targetX += 1.0;
        } else {
            // デジタル入力がない場合、アナログスティックの入力をチェック
            if (gp) {
                const stickX = gp.axes[0];
                if (Math.abs(stickX) > this.deadzone) {
                    targetX = stickX;
                    isAnalogX = true;
                }
            }
        }

        let targetY = 0.0;
        let isAnalogY = false;

        if (resetY) {
            this.keyboardY = 0.0;
            this.pressDurationY = 0.0;
        } else if (hasDigitalY) {
            if (hasUp) targetY -= 1.0;
            if (hasDown) targetY += 1.0;
        } else {
            // デジタル入力がない場合、アナログスティックの入力をチェック
            if (gp) {
                const stickY = gp.axes[1];
                if (Math.abs(stickY) > this.deadzone) {
                    targetY = stickY;
                    isAnalogY = true;
                }
            }
        }

        // キー押し時間の計測 (入力がある間は増加、離されたら 0 にリセット)
        // アナログ入力の場合は、常に最大感度で動かすためにタイマーを最大値(sensitivityRampTime)に固定
        if (targetX !== 0.0) {
            if (isAnalogX) {
                this.pressDurationX = this.sensitivityRampTime;
            } else {
                this.pressDurationX += deltaTime;
            }
        } else {
            this.pressDurationX = 0.0;
        }

        if (targetY !== 0.0) {
            if (isAnalogY) {
                this.pressDurationY = this.sensitivityRampTime;
            } else {
                this.pressDurationY += deltaTime;
            }
        } else {
            this.pressDurationY = 0.0;
        }

        // 操作性のバランスを保ちつつスムーズにするための速度調整 (加速3.2)
        const sensitivity = 3.2;

        // X軸の更新
        if (!resetX && targetX !== 0.0) {
            // プログレッシブ感度の計算 (徐々に立ち上がる)
            let currentSensitivity = sensitivity;
            if (this.pressDurationX < this.sensitivityRampTime) {
                const t = this.pressDurationX / this.sensitivityRampTime;
                const factor = this.minSensitivityMultiplier + (1.0 - this.minSensitivityMultiplier) * t;
                currentSensitivity = sensitivity * factor;
            }

            const prevX = this.keyboardX;
            if (prevX < targetX) {
                this.keyboardX = Math.min(targetX, prevX + currentSensitivity * deltaTime);
            } else if (prevX > targetX) {
                this.keyboardX = Math.max(targetX, prevX - currentSensitivity * deltaTime);
            }
        }
        // キーを離した際 (targetX === 0.0) は、this.keyboardX の値を維持する (従来の gravity 減衰を廃止)

        // Y軸の更新
        if (!resetY && targetY !== 0.0) {
            // プログレッシブ感度の計算 (徐々に立ち上がる)
            let currentSensitivity = sensitivity;
            if (this.pressDurationY < this.sensitivityRampTime) {
                const t = this.pressDurationY / this.sensitivityRampTime;
                const factor = this.minSensitivityMultiplier + (1.0 - this.minSensitivityMultiplier) * t;
                currentSensitivity = sensitivity * factor;
            }

            const prevY = this.keyboardY;
            if (prevY < targetY) {
                this.keyboardY = Math.min(targetY, prevY + currentSensitivity * deltaTime);
            } else if (prevY > targetY) {
                this.keyboardY = Math.max(targetY, prevY - currentSensitivity * deltaTime);
            }
        }
    }

    /**
     * ゲームパッドを振動させる
     * @param {number} duration 振動時間（ミリ秒）
     * @param {number} strongMagnitude 低周波モーターの強度 (0.0〜1.0)
     * @param {number} weakMagnitude 高周波モーターの強度 (0.0〜1.0)
     */
    vibrate(duration = 200, strongMagnitude = 1.0, weakMagnitude = 1.0) {
        const gp = this.getGamepad();
        if (gp && gp.vibrationActuator && gp.vibrationActuator.type === 'dual-rumble') {
            gp.vibrationActuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: duration,
                weakMagnitude: weakMagnitude,
                strongMagnitude: strongMagnitude
            }).catch(e => {
                console.warn('Gamepad vibration failed:', e);
            });
        }
    }
}
