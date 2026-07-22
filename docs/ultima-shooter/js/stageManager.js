/**
 * @fileoverview stageManager.js
 * ステージ進行管理クラス。プレイヤーの進行距離に応じた背景（グリッド、フォグ）の
 * 色変更や、ステージ遷移の演出を管理する。
 */

/**
 * ステージ管理クラス
 * ステージ進行度（Z座標スクロール距離）の計測、テーマカラー変更の指示、
 * ボス戦開始のトリガー、およびステージ間フェード遷移演出を統括する。
 */
class StageManager {
    /**
     * @param {Game} game - ゲームメインクラスへの参照
     */
    constructor(game) {
        /** @type {Game} */
        this.game = game;
        
        /** @type {number} 現在のステージインデックス (0〜2) */
        this.currentStageIndex = 0;
        
        /** @type {number} このステージで進んだ累積スクロール距離 (Z軸正方向換算値) */
        this.stageProgressZ = 0.0;
        
        /** @type {number} このステージで獲得した敵撃破ポイント */
        this.stageKillPoints = 0;
        
        /** @type {number} 前フレーム of プレイヤーZ座標 */
        this.lastPlayerZ = 0.0;
        
        /** @type {boolean} ボスがすでに出現したか */
        this.bossSpawned = false;
        
        /** @type {string} ステージ内の進行状態 ('PLAYING', 'BOSS_WARNING', 'BOSS_BATTLE', 'TRANSITION') */
        this.state = 'PLAYING';
        this.bossWarningTimer = 0.0;

        /**
         * @type {number} 現在の周回数（1周目 = 1）
         * 全ステージクリア後インクリメントされ、難易度係数の計算に使用される。
         */
        this.loopCount = 1;
    }

    /**
     * ステージマネージャーの初期化
     */
    init() {
        this.currentStageIndex = (this.game.debugSettings && this.game.debugSettings.startStage !== undefined) 
            ? this.game.debugSettings.startStage 
            : 0;
        this.stageProgressZ = 0.0;
        this.stageKillPoints = 0;
        this.lastPlayerZ = this.game.player ? this.game.player.mesh.position.z : 0.0;
        this.bossSpawned = false;
        this.bossWarningTimer = 0.0;
        this.state = 'PLAYING';
        // 完全リスタート時に周回数をリセット（デバッグ設定を優先）
        this.loopCount = (this.game.debugSettings && this.game.debugSettings.startLoop !== undefined)
            ? this.game.debugSettings.startLoop
            : 1;

        if (this.game.enemySpawner) {
            this.game.enemySpawner.resumeSpawn();
        }
        
        this.applyStageTheme();
    }

    /**
     * 毎フレームの更新処理
     * @param {number} deltaTime
     */
    update(deltaTime) {
        if (!this.game.player || this.game.state !== GameState.PLAYING) return;

        const playerZ = this.game.player.mesh.position.z;
        
        if (this.state === 'PLAYING') {
            // 即時ボス出現デバッグ設定の適用
            if (this.game.debugSettings && this.game.debugSettings.instantBoss && !this.bossSpawned) {
                this.triggerBossWarning();
            }

            // 自機はZマイナス方向へ前進するため、前位置から現位置を引くことで進んだ正の距離を算出
            const diffZ = this.lastPlayerZ - playerZ;
            if (diffZ > 0) {
                this.stageProgressZ += diffZ;
            }

            const currentStage = this.getCurrentStage();
            if (currentStage && !this.bossSpawned) {
                const scaledLength = this.getScaledStageLength();
                const scaledKillPoints = this.getScaledRequiredKillPoints();

                if (this.stageProgressZ >= scaledLength && this.stageKillPoints >= scaledKillPoints) {
                    this.triggerBossWarning();
                }
            }
        }
        else if (this.state === 'BOSS_WARNING') {
            this.bossWarningTimer += deltaTime;
            
            // アラート表示（4秒間）の開始1.5秒間で、スクロール速度を通常(30.0)から40%(12.0)へ強力に減速ブレーキ
            // 敵が一掃された直後の背景の視覚的突進感（急加速錯覚）を解消し、ボス接近の重厚な緊張感を演出
            const t = Math.min(1.0, this.bossWarningTimer / 1.5);
            const startSpeed = GameConfig.game.scrollSpeed;
            const warningSpeed = GameConfig.game.scrollSpeed * 0.40;
            if (this.game) {
                this.game.scrollSpeed = THREE.MathUtils.lerp(startSpeed, warningSpeed, t);
            }

            if (this.bossWarningTimer >= 4.0) {
                this.triggerBossBattle();
            }
        }
        
        this.lastPlayerZ = playerZ;
    }

    /**
     * 現在のステージ設定を取得
     * @returns {Object} Stage configuration
     */
    getCurrentStage() {
        return GameConfig.stages[this.currentStageIndex];
    }

    /**
     * 現在の周回数に基づく難易度スケール係数を返す。
     * 1周目は 1.0（設定値そのまま）、周回ごとに difficultyScaleMultiplier 倍で増加する。
     * @returns {number} 難易度係数
     */
    getDifficultyScale() {
        const { difficultyScaleMultiplier, maxDifficultyScale } = GameConfig.loopSystem;
        const scale = Math.pow(difficultyScaleMultiplier, this.loopCount - 1);
        return Math.min(scale, maxDifficultyScale);
    }

    /**
     * 現在の周回数に基づく早回し（ゲーム進行速度）スケール係数を返す。
     * 1周目は 1.0、周回ごとに timeScaleStep ずつ増加する。
     * @returns {number} タイムスケール係数
     */
    getTimeScale() {
        if (!GameConfig.loopSystem.timeScaleStep) return 1.0;
        const { timeScaleStep, maxTimeScale } = GameConfig.loopSystem;
        const scale = 1.0 + (this.loopCount - 1) * timeScaleStep;
        return Math.min(scale, maxTimeScale || 1.6);
    }

    /**
     * 現在のステージの難易度補正済みの「ボス出現に必要な撃破ポイント」を返す。
     * 50の倍数に切り上げる。
     * @returns {number} 補正後の要求撃破ポイント
     */
    getScaledRequiredKillPoints() {
        const stage = this.getCurrentStage();
        if (!stage) return 150;
        const scaled = stage.requiredKillPoints * this.getDifficultyScale();
        return Math.ceil(scaled / 50) * 50;
    }

    /**
     * 現在のステージの早回し補正済みの「ボス出現までの走行距離」を返す。
     * @returns {number} 補正後の走行距離
     */
    getScaledStageLength() {
        const stage = this.getCurrentStage();
        if (!stage) return 3000;
        return stage.length * this.getTimeScale();
    }

    /**
     * 現在のステージのテーマ（ビジュアル）を適用する
     */
    applyStageTheme() {
        const stage = this.getCurrentStage();
        if (!stage) return;
        
        
        // 1. レンダラー経由でフォグ、背景色、環境光を更新
        this.game.renderer.updateTheme(stage.theme);
        
        const bottomY = stage.cave ? stage.cave.bottom : -4.0;
        
        // 2. 地面無限スクロールグリッドの色を再作成 (セグメント方式導入に伴い、シーンに追加せずクリアのみ行う)
        this.game.clearGridHelper();

        // 3. 洞窟の壁とカラー壁面の再構築
        this.game.clearCaveWalls();
        this.game.setupCaveWalls();

        // 4. 画面上にステージ名フラッシュ表示
        this.showStageStartNotification(stage.number, stage.name);

        // ステージ別の通常BGMを再生
        if (window.audioManager) {
            const bgmKey = `stage${stage.number}`;
            audioManager.playBGM(bgmKey);
        }
    }

    /**
     * ボス出現の警告（予兆）開始処理
     */
    triggerBossWarning() {
        if (this.bossSpawned) return;
        this.state = 'BOSS_WARNING';
        this.bossWarningTimer = 0.0;
        this.bossSpawned = true; // 重複呼び出し防止

        // 雑魚敵の自動スポーンを停止する
        if (this.game.enemySpawner) {
            this.game.enemySpawner.stopSpawn();
        }

        // 既存の雑魚敵をすべて消去する
        if (this.game.enemies) {
            for (let i = this.game.enemies.length - 1; i >= 0; i--) {
                const enemy = this.game.enemies[i];
                enemy.deactivate();
                this.game.enemySpawner.releaseEnemy(enemy);
                this.game.enemies.splice(i, 1);
            }
        }

        // 既存の敵弾をすべて消去する
        if (this.game.bullets) {
            for (let i = this.game.bullets.length - 1; i >= 0; i--) {
                const bullet = this.game.bullets[i];
                if (bullet && bullet.isEnemy) {
                    bullet.deactivate();
                    this.game.bulletPool.release(bullet);
                    this.game.bullets.splice(i, 1);
                }
            }
        }

        // 通常BGMをフェードアウト (1.5秒)
        if (window.audioManager) {
            audioManager.fadeOutBGM(1.5);
        }

        // 警告UIの表示
        this.showBossWarningNotification();
    }

    /**
     * ボス戦の開始処理（警告完了後に呼び出される）
     */
    triggerBossBattle() {
        this.state = 'BOSS_BATTLE';
        
        // 走行スピードを通常よりやや下げる程度に調整 (前進感を維持し、アイテムを近づけやすくするため 0.8 倍)
        this.game.scrollSpeed = GameConfig.game.scrollSpeed * 0.80;

        // ボス用BGMの再生開始
        if (window.audioManager) {
            const bossBgmKey = `boss${this.getCurrentStage().number}`;
            audioManager.playBGM(bossBgmKey);
        }

        // ボスをスポーン
        this.game.spawnBoss(this.currentStageIndex);
    }

    /**
     * ボス出現警告時に画面中央に警告を点滅フェード表示する
     */
    showBossWarningNotification() {
        const el = document.getElementById('boss-warning');
        if (!el) return;
        
        el.classList.add('active');

        // 警告アラーム音の再生 (0.8秒おきに「ブー」)
        if (window.audioManager) {
            audioManager.play('bossWarningAlarm');
        }
        const alarmInterval = setInterval(() => {
            if (window.audioManager) {
                audioManager.play('bossWarningAlarm');
            }
        }, 800);
        
        // 3.5秒後に非表示にする
        setTimeout(() => {
            clearInterval(alarmInterval);
            el.classList.remove('active');
        }, 3500);
    }

    /**
     * ボス撃破時のコールバック
     */
    onBossDefeated() {
        // ボスBGMをフェードアウト (1.0秒で素早く消す)
        if (window.audioManager) {
            audioManager.fadeOutBGM(1.0);
        }

        this.state = 'TRANSITION';
        
        // ボス撃破1.0秒後（ボス大爆発の最中）にクリアジングルを再生開始
        setTimeout(() => {
            if (window.audioManager) {
                audioManager.playBGM('stageClear');
            }
        }, 1000);
        
        // ボス撃破後のボーナスアイテム回収時間（10秒）を確保してからクリアリザルト演出を開始
        // (最初の3秒間のボスの暴走/爆発と、その後の5秒間のアイテム出現、2秒間の回収時間)
        setTimeout(() => {
            this.playClearPerformance();
        }, 10000);
    }

    /**
     * ステージクリア時のボーナスカウントアップ＆回復アニメーション演出を再生する
     */
    playClearPerformance() {
        // プレイ中BGMの停止
        if (window.audioManager) {
            audioManager.stopBGM();
        }

        const container = document.getElementById('ui-container');
        if (!container || !this.game.player) {
            // 自機がいない場合は即時クリア遷移へ
            this.clearStage();
            return;
        }

        // 1. 各種ボーナスの算出
        const currentStage = this.getCurrentStage();
        const diffScale = this.getDifficultyScale();
        // 周回（ループ）システムの難易度スケールに応じてベースボーナスを乗算（整数に丸める）
        const rawBaseBonus = currentStage.clearBaseBonus || 3000;
        const baseBonus = Math.round(rawBaseBonus * diffScale);
        
        // スコアボーナス: 基本点（スケール適用後） ＋ 残りライフ×20 ＋ 残り弾数×2
        const scoreBonus = baseBonus + (this.game.player.life * 20) + (this.game.player.ammo * 2);

        // 2. クリアパネルの作成（グラスモルフィズム風）
        const panel = document.createElement('div');
        panel.id = 'clear-result-panel';
        panel.className = 'clear-result-overlay';
        panel.innerHTML = `
            <div class="clear-result-panel">
                <div class="panel-header">STAGE CLEAR</div>
                <div class="panel-stage-name">${this.getCurrentStage().name.toUpperCase()}</div>
                
                <div class="result-row total" style="margin-top: 25px;">
                    <span>SCORE BONUS:</span>
                    <span id="bonus-score-val" class="val-gold">0</span>
                </div>
            </div>
        `;
        container.appendChild(panel);

        // 3. アニメーション用の初期値設定
        let currentBonus = 0;
        const duration = 1800; // カウントアップ演出の所要時間 (1.8秒)
        const fps = 60;
        const totalSteps = Math.round((duration / 1000) * fps);
        const stepVal = Math.ceil(scoreBonus / totalSteps);

        let currentStep = 0;
        
        // 4. カウントアップのタイマー開始
        const animInterval = setInterval(() => {
            currentStep++;
            
            // スコアボーナスのカウントアップ
            currentBonus = Math.min(scoreBonus, currentBonus + stepVal);
            const bonusEl = document.getElementById('bonus-score-val');
            if (bonusEl) {
                bonusEl.innerText = `+${currentBonus}`;
            }
            
            // HUD（ゲージと数値テキスト）を同期更新
            this.game.updateUI();

            if (currentStep >= totalSteps) {
                clearInterval(animInterval);
                
                // 最終スコアを確定
                this.game.score += scoreBonus;
                this.game.updateUI();

                // 2秒間クリアの余韻を持たせてから、フェードアウトしてクリア確定処理へ
                setTimeout(() => {
                    panel.classList.add('fade-out');
                    setTimeout(() => {
                        if (panel.parentNode) {
                            panel.parentNode.removeChild(panel);
                        }
                        this.clearStage();
                    }, 600);
                }, 2000);
            }
        }, 1000 / fps);
    }

    /**
     * ステージクリア確定処理
     */
    clearStage() {
        const isLastStage = this.currentStageIndex === GameConfig.stages.length - 1;
        if (isLastStage) {
            this.triggerGameClear();
        } else {
            this.transitionToNextStage();
        }
    }

    /**
     * 次のステージへのフェード遷移
     */
    transitionToNextStage() {
        const fadeEl = document.getElementById('screen-fade');
        if (fadeEl) {
            fadeEl.classList.add('active');
        }

        setTimeout(() => {
            this.currentStageIndex++;
            this.stageProgressZ = 0.0;
            this.stageKillPoints = 0;
            this.bossSpawned = false;
            this.state = 'PLAYING';
            
            // 敵、弾、アイテム、障害物の全クリア
            this.game.clearActiveEntities();
            
            // 自機座標のZ位置を0にリセットして浮動小数点数の桁落ち誤差をリフレッシュ
            if (this.game.player) {
                this.game.player.mesh.position.set(0, 1.0, 0);
            }
            this.lastPlayerZ = 0.0;
            
            // カメラ追従と位置のリセット
            this.game.cameraController.setTarget(this.game.player.mesh);
            this.game.renderer.camera.position.set(0, 7.5, 13.0);
            
            // スクロール速度の復元
            this.game.scrollSpeed = GameConfig.game.scrollSpeed;
            
            // スポーナーの復旧
            if (this.game.enemySpawner) {
                this.game.enemySpawner.resumeSpawn();
            }

            // 新ステージテーマ適用
            this.applyStageTheme();


            
            // HUD更新
            this.game.updateUI();

            setTimeout(() => {
                if (fadeEl) fadeEl.classList.remove('active');
            }, 600);
        }, 1200);
    }

    /**
     * 全ステージクリア時の周回継続処理
     * ゲームを終了させずに loopCount をインクリメントし、ステージ1から再スタートする。
     */
    triggerGameClear() {
        this.loopCount++;
        const scale = this.getDifficultyScale();
        // 全クリア演出パネルを表示してから周回継続
        this._showLoopContinuePanel(scale, () => {
            this._startNextLoop();
        });
    }

    /**
     * 全ステージクリア後の「周回継続」通知パネルを表示する。
     * @param {number} scale - 次周回の難易度係数
     * @param {Function} onComplete - パネル消去後のコールバック
     * @private
     */
    _showLoopContinuePanel(scale, onComplete) {
        const container = document.getElementById('ui-container');
        if (!container) {
            onComplete();
            return;
        }

        const loopLabel = this.loopCount;
        const scalePercent = Math.round((scale - 1.0) * 100);

        const panel = document.createElement('div');
        panel.id = 'loop-continue-panel';
        panel.className = 'clear-result-overlay';
        panel.innerHTML = `
            <div class="clear-result-panel">
                <div class="panel-header" style="color:#ffd700;">MISSION COMPLETE</div>
                <div class="panel-stage-name">ALL STAGES CLEARED!</div>
                <div class="result-row" style="margin-top:16px;">
                    <span>NEXT LOOP:</span>
                    <span class="val-gold">LOOP ${loopLabel}</span>
                </div>
                <div class="result-row">
                    <span>DIFFICULTY:</span>
                    <span class="val-gold">+${scalePercent}%</span>
                </div>
                <div style="margin-top:18px; font-size:0.95rem; color:#aaa; letter-spacing:0.05em;">
                    CONTINUING...
                </div>
            </div>
        `;
        container.appendChild(panel);

        // 3.5秒間表示した後フェードアウトして継続
        setTimeout(() => {
            panel.classList.add('fade-out');
            setTimeout(() => {
                if (panel.parentNode) panel.parentNode.removeChild(panel);
                onComplete();
            }, 600);
        }, 3500);
    }

    /**
     * 次の周回（ステージ1から）を開始する。
     * @private
     */
    _startNextLoop() {
        const fadeEl = document.getElementById('screen-fade');
        if (fadeEl) fadeEl.classList.add('active');

        setTimeout(() => {
            // ステージをリセットしてステージ1へ
            this.currentStageIndex = 0;
            this.stageProgressZ = 0.0;
            this.stageKillPoints = 0;
            this.bossSpawned = false;
            this.state = 'PLAYING';

            // 敵、弾、アイテム、障害物の全クリア
            this.game.clearActiveEntities();

            // 自機座標をリセット
            if (this.game.player) {
                this.game.player.mesh.position.set(0, 1.0, 0);
            }
            this.lastPlayerZ = 0.0;

            // カメラ追従と位置のリセット
            this.game.cameraController.setTarget(this.game.player.mesh);
            this.game.renderer.camera.position.set(0, 7.5, 13.0);

            // スクロール速度の復元（ボス戦で変更された場合に備えて）
            this.game.scrollSpeed = GameConfig.game.scrollSpeed;

            // スポーナーの復旧
            if (this.game.enemySpawner) {
                this.game.enemySpawner.resumeSpawn();
            }

            // ゲーム状態をPLAYINGに戻す
            this.game.state = GameState.PLAYING;

            // 新ステージテーマ適用（周回数付きの通知表示も行われる）
            this.applyStageTheme();

            // HUD更新
            this.game.updateUI();

            setTimeout(() => {
                if (fadeEl) fadeEl.classList.remove('active');
            }, 600);
        }, 1200);
    }

    /**
     * ステージ開始時に中央にステージ名をフェード表示する演出
     * 2周目以降は周回数（LOOP N）も併記する。
     * @param {number} stageNum
     * @param {string} stageName
     */
    showStageStartNotification(stageNum, stageName) {
        const container = document.getElementById('ui-container');
        if (!container) return;
        
        const el = document.createElement('div');
        el.className = 'stage-start-title stage-title-flash';

        // 2周目以降は「LOOP N」を付与して周回数を明示する
        const loopTag = this.loopCount > 1
            ? `<span style="font-size:1.1rem; color:#ffd700; font-weight:700; letter-spacing:0.1em;">LOOP ${this.loopCount}</span><br>`
            : '';

        el.innerHTML = `${loopTag}STAGE 0${stageNum}<br><span style="font-size:1.8rem; color:#fff; font-weight:700;">${stageName.toUpperCase()}</span>`;
        
        container.appendChild(el);
        
        setTimeout(() => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }, 3200);
    }

    /**
     * 敵機撃破時のポイント加算
     * @param {string} enemyType - 撃破された敵のタイプ
     */
    addEnemyKill(enemyType) {
        const config = GameConfig.enemies.types[enemyType];
        const points = config ? (config.killPoints || 10) : 10;
        this.stageKillPoints += points;
        
        this.game.triggerHUDFlash('point-val', 'hud-flash-power');
        this.game.updateUI();
    }
}
