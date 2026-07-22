/**
 * @fileoverview cameraController.js
 * カメラ制御クラス。自機の移動に対するカメラの滑らかな追従（Lerp）や、
 * ボス戦時のカメラアングル調整などの演出を担当する。
 */

/**
 * カメラ制御クラス
 * 自機（Player）をターゲットとし、その背後から滑らかに追従（lerp補間）する三人称カメラワークを実装する。
 * ターゲットが不在の場合は、カメラを自動的に前進（自動スクロール）させる。
 * 高さ（Y軸）のみlerp遅延を完全に廃止し即時同期させることで、上下の限界境界での自機の沈み込み（跳ね返りの視覚的錯覚）や、発射位置が画面外にはみ出してミサイルが消えるバグを根本的に解消。
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
        
        // 自機との相対位置 (超近接追尾・一人称に近い設定)
        this.offset = new THREE.Vector3(0.0, 1.2, 3.2);
        // カメラが注視するオフセット（自機の少し前方）
        this.lookAtOffset = new THREE.Vector3(0.0, 0.0, -10.0);
        
        // カメラ追従の滑らかさ (0.0 〜 1.0)
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
     * @param {number} deltaTime - フレーム間経過時間 (秒)
     * @param {number} scrollSpeed - 自動前進速度 (Zマイナス方向の移動量/秒)
     * @param {Object} [stageConfig] - ステージ設定 (GameConfig.stages[index])
     */
    update(deltaTime, scrollSpeed, stageConfig = null, bossActiveRatio = 0.0) {
        if (this.isDyingMode && this.target) {
            // 墜落見送りモード
            // カメラは減速していくスクロール速度に同期して前進する
            this.camera.position.z -= scrollSpeed * deltaTime;
            
            // 壁抜けを防止するため、カメラのXY座標を洞窟の中央付近へゆっくりと戻す
            const camCave = stageConfig ? getCaveBoundsAt(this.camera.position.z, stageConfig, bossActiveRatio) : null;
            if (camCave) {
                this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, camCave.centerX, 0.03);
                this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, camCave.centerY + 1.0, 0.03);
            }
            
            // 注視点は墜落していく自機（target）を捉え続ける
            const lookAtTarget = this.target.position;
            this.camera.lookAt(lookAtTarget);
            
            // ロール角は滑らかに直立（0）に戻す
            this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, 0.0, 0.05);
            this.camera.up.set(Math.sin(this.currentRoll), Math.cos(this.currentRoll), 0);
            return;
        }

        if (this.target) {
            const playerZ = this.target.position.z;
            const cave = stageConfig ? getCaveBoundsAt(playerZ, stageConfig, bossActiveRatio) : null;
            
            // 自機が上に上がるにつれて、天井へのカメラ突き抜けを防ぐためにYオフセットを動的に下げる
            let dynamicOffsetY = this.offset.y; // デフォルト 2.5
            if (cave && this.target.position.y > cave.centerY) {
                // 自機Yが 洞窟中心 から (天井 - 1.0) に向かうにつれて、
                // Yオフセットを 2.5 から 0.5 に滑らかに減少させる
                const startY = cave.centerY;
                const maxYVal = cave.top - 1.0;
                const t = Math.min(1.0, Math.max(0.0, (this.target.position.y - startY) / (maxYVal - startY)));
                dynamicOffsetY = THREE.MathUtils.lerp(this.offset.y, 0.5, t);
            }

            // 1. カメラの目標位置（X, Y）を算出
            // プレイヤーに完全に追尾（100%同期）させ、一人称に近い近接追尾にすることで、壁際に寄っても自機が画面外へ見えなくなるのを防ぐ
            const camTargetZ = playerZ + this.offset.z;
            const camCave = stageConfig ? getCaveBoundsAt(camTargetZ, stageConfig, bossActiveRatio) : null;
            
            let targetX = this.target.position.x;
            let targetY = this.target.position.y + dynamicOffsetY;

            // 自機に密着して追従するため、lerpを少し強めにする
            let newX = THREE.MathUtils.lerp(this.camera.position.x, targetX, this.lerpSpeed * 0.9);
            let newY = THREE.MathUtils.lerp(this.camera.position.y, targetY, this.lerpSpeed * 1.1);
            
            // 洞窟の壁をカメラが突き抜けないようにクランプ (近接用マージン)
            if (camCave) {
                const marginX = 1.8; // カメラが壁にめり込まない限界
                const marginYMin = 1.2;
                const marginYMax = 0.8;
                
                newX = Math.max(camCave.left + marginX, Math.min(camCave.right - marginX, newX));
                newY = Math.max(camCave.bottom + marginYMin, Math.min(camCave.top - marginYMax, newY));
            }
            
            this.camera.position.x = newX;
            this.camera.position.y = newY;
            this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, camTargetZ, this.lerpSpeed);
            
            // 2. カメラ注視点（LookAt）を「カーブの先（洞窟の前方）」に向ける
            // プレイヤーの 50 ユニット前方の洞窟中心を算出
            const lookZ = playerZ - 50.0;
            const boundsForward = stageConfig ? getCaveBoundsAt(lookZ, stageConfig, bossActiveRatio) : null;
            const lookAtTarget = new THREE.Vector3(0, 6.0, lookZ);
            
            if (boundsForward) {
                lookAtTarget.x = boundsForward.centerX;
                lookAtTarget.y = boundsForward.centerY;
            } else {
                lookAtTarget.addVectors(this.target.position, this.lookAtOffset);
            }
            this.camera.lookAt(lookAtTarget);

            // 3. カメラのRoll（左右の傾き）演出の適用
            // プレイヤーの左右入力（旋回）と、前方のカーブの曲率（中心のズレ）から目標の傾きを計算
            const inputX = (window.game && window.game.input) ? window.game.input.getMoveX() : 0.0;
            const curveDiff = boundsForward ? (boundsForward.centerX - this.target.position.x) : 0.0;
            
            // 入力による傾き（最大6度） + カーブによる遠心力傾き（最大5度）
            const targetRoll = -inputX * 0.10 - curveDiff * 0.010;
            this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, targetRoll, 0.08); // 滑らかに補間
            
            // カメラの上方向ベクトルを設定して傾きを反映
            this.camera.up.set(Math.sin(this.currentRoll), Math.cos(this.currentRoll), 0);
        } else {
            // タイトルデモ中など、自機がいない場合の自動前進
            // ゲームオーバー時は停止させる
            if (window.game && window.game.state === 'GAMEOVER') {
                // 何もしない（停止）
            } else {
                this.camera.position.z -= scrollSpeed * deltaTime;
            }
            
            // ロールは直立に戻す
            this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, 0.0, 0.1);
            this.camera.up.set(Math.sin(this.currentRoll), Math.cos(this.currentRoll), 0);
        }

        // 4. スクリーンシェイク（画面揺れ）の適用
        if (this.shakeTimer > 0) {
            this.shakeTimer -= deltaTime;
            const progress = Math.max(0.0, this.shakeTimer / this.shakeDuration);
            const currentShake = this.shakeAmount * progress;
            
            // カメラの向き（回転角）にランダムな角度オフセットを加えて揺らす
            // これにより、画面全体（自機、壁、敵など）が同期して一体となって揺れて見えるようになる
            const shakeAngle = 0.02 * currentShake;
            this.camera.rotation.x += (Math.random() - 0.5) * shakeAngle;
            this.camera.rotation.y += (Math.random() - 0.5) * shakeAngle;
        }
    }
}
