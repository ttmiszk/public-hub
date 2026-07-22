/**
 * @fileoverview enemySpawner.js
 * 敵出現制御クラス。ウェーブ単位での敵のグループ出現や、
 * ステージ設定に応じた敵の種類・出現確率の制御を行う。
 */

/**
 * 敵スポーン管理クラス
 * 時間経過に応じてプレイヤーの前方に敵機を自動生成する。
 * 各敵タイプごとの ObjectPool を管理し、メモリ効率を確保する。
 *
 * 【ウェーブグループ方式】
 * 敵の出現を「グループ」単位で管理する。
 * 1グループは同じタイプの敵を複数機まとめて出現させ、
 * グループ切り替え時に通常より長い待機時間を設けることで、
 * 攻撃パターンにまとまりと戦略性を持たせる。
 *
 *   例: [AAA] --長い間隔-- [BBB] --長い間隔-- [DD] --長い間隔-- ...
 */
class EnemySpawner {
    /**
     * @param {Game} game - ゲームメインクラスへの参照
     */
    constructor(game) {
        /** @type {Game} */
        this.game = game;
        
        /** @type {number} 次のスポーンまでの残り時間 */
        this.spawnTimer = 0.0;
        
        /** @type {boolean} スポーン一時停止フラグ */
        this.isSpawnStopped = false;
        
        /** @type {Object<string, ObjectPool>} 敵タイプごとのオブジェクトプール */
        this.pools = {};

        // ── ウェーブグループ管理 ──────────────────────────────
        /** @type {string|null} 現在のグループで出現させる敵タイプ */
        this.currentGroupType = null;

        /** @type {number} 現在グループの残り出現数 (0 になったら次グループへ) */
        this.currentGroupRemaining = 0;
        // ─────────────────────────────────────────────────────
        
        this.initPools();
    }

    /**
     * 各敵タイプ用のオブジェクトプール初期化
     */
    initPools() {
        const scene = this.game.renderer.scene;
        
        // A, B, C, D, E, F 各タイプ用のプールを用意
        const types = ['A', 'B', 'C', 'D', 'E', 'F'];
        
        for (let type of types) {
            this.pools[type] = new ObjectPool(
                () => new Enemy(scene, type),
                (enemy, x, y, z) => enemy.init(x, y, z),
                5 // 各タイプの初期プールサイズ
            );
        }
    }

    /**
     * スポーナーの毎フレーム更新
     * @param {number} deltaTime
     * @param {number} playerZ - プレイヤーの現在Z座標
     */
    update(deltaTime, playerZ) {
        if (this.isSpawnStopped) return;

        this.spawnTimer += deltaTime;
        
        // 現在のステージ設定からスポーン間隔を取得
        const currentStage = this.game.stageManager ? this.game.stageManager.getCurrentStage() : null;
        const baseInterval = currentStage ? currentStage.spawnInterval : GameConfig.enemies.spawnInterval;
        
        // 周回難易度係数を取得（1周目は1.0で変化なし）
        const diffScale = (this.game.stageManager && GameConfig.loopSystem.applySpawnInterval)
            ? this.game.stageManager.getDifficultyScale()
            : 1.0;

        // 時間経過による難易度上昇 (最大20%の間隔短縮)
        const playTime = this.game.clock.getElapsedTime();
        const timeFactor = Math.min(1.0, playTime / 240.0); // 4分で最大

        // ボス出現走行距離超過による難易度上昇（出現頻度アップ）
        let overDistanceIntervalScale = 1.0;
        let minInterval = 0.25;
        if (this.game.stageManager) {
            const scaledLength = this.game.stageManager.getScaledStageLength();
            const overDistance = Math.max(0, this.game.stageManager.stageProgressZ - scaledLength);
            if (overDistance > 0) {
                const settings = GameConfig.enemies.overDistanceDifficulty || {
                    spawnIntervalScalePer100m: 0.15,
                    minSpawnInterval: 0.25
                };
                overDistanceIntervalScale += (overDistance / 100.0) * settings.spawnIntervalScalePer100m;
                minInterval = settings.minSpawnInterval;
            }
        }

        // 周回係数と超過走行距離による係数を適用して間隔を決定
        const intervalVal = (baseInterval * (1.0 - timeFactor * 0.20)) / (diffScale * overDistanceIntervalScale);
        const interval = Math.max(intervalVal, minInterval);

        if (this.spawnTimer >= interval) {
            this.spawnTimer = 0.0;

            if (this.currentGroupRemaining <= 0) {
                // 現在グループが終了 → 新グループを選定し、グループ間インターバルを追加する。
                // spawnTimer をマイナス値にセットすることで次スポーンまでの余分な待機を実現する。
                // 待機時間はランダム化: 短いと異種が画面上に混在、長いとグループが明確に分離される。
                const { breakMultiplierMin, breakMultiplierMax } = GameConfig.enemies.waveGroup;
                const breakMultiplier = breakMultiplierMin + Math.random() * (breakMultiplierMax - breakMultiplierMin);
                this.spawnTimer = -interval * (breakMultiplier - 1.0);

                this.startNewGroup(currentStage);
                // グループ切り替え時は今回スポーンせず待機
                return;
            }

            // 現在グループの敵を1機スポーン
            this.spawnGroupEnemy(playerZ, currentStage);
        }
    }

    /**
     * 新しいウェーブグループを開始する。
     * ステージの spawnWeights に基づく重み付きランダム抽選で敵タイプを決定し、
     * グループサイズも waveGroup 設定に従いランダムに決定する。
     *
     * @param {Object|null} currentStage
     */
    startNewGroup(currentStage) {
        // spawnWeights で敵タイプを重み付き抽選
        const weights = (currentStage && currentStage.spawnWeights)
            ? currentStage.spawnWeights
            : { A: 0.4, B: 0.3, C: 0.2, D: 0.1, E: 0, F: 0 };

        let totalWeight = 0;
        for (let key in weights) totalWeight += weights[key];

        const rand = Math.random() * totalWeight;
        let type = 'A'; // フォールバック
        let cumulative = 0;

        for (let key in weights) {
            cumulative += weights[key];
            if (rand <= cumulative) {
                type = key;
                break;
            }
        }

        // グループサイズを waveGroup 設定に従い決定し、周回係数で最大値を拡張する
        const waveGroup = GameConfig.enemies.waveGroup;
        // 周回係数によりグループサイズの上限を拡張（1周目は係数そのまま）
        const diffScale = (this.game.stageManager && GameConfig.loopSystem.applyGroupSize)
            ? this.game.stageManager.getDifficultyScale()
            : 1.0;

        // ボス出現走行距離超過による同時出現数（グループサイズ）の増加
        let overDistanceGroupSizeBonus = 0;
        if (this.game.stageManager) {
            const scaledLength = this.game.stageManager.getScaledStageLength();
            const overDistance = Math.max(0, this.game.stageManager.stageProgressZ - scaledLength);
            if (overDistance > 0) {
                const settings = GameConfig.enemies.overDistanceDifficulty || {
                    groupSizeBonusPer100m: 0.5,
                    maxGroupSizeBonus: 10
                };
                overDistanceGroupSizeBonus = Math.min(
                    settings.maxGroupSizeBonus,
                    Math.floor((overDistance / 100.0) * settings.groupSizeBonusPer100m)
                );
            }
        }

        const scaledMaxSize = Math.floor(waveGroup.maxSize * diffScale) + overDistanceGroupSizeBonus;
        // 最小出現数も同様に引き上げるが、最大値を超えないように制限
        const scaledMinSize = waveGroup.minSize + Math.floor(overDistanceGroupSizeBonus * 0.5);
        const effectiveMinSize = Math.min(scaledMaxSize, scaledMinSize);
        const effectiveSizeRange = scaledMaxSize - effectiveMinSize;
        const groupSize = effectiveMinSize + Math.floor(Math.random() * (Math.max(0, effectiveSizeRange) + 1));

        this.currentGroupType = type;
        this.currentGroupRemaining = groupSize;
    }

    /**
     * 現在グループの敵を1機スポーンする。
     * スポーン位置はプレイヤー前方の洞窟内にランダム配置。
     *
     * @param {number} playerZ
     * @param {Object|null} currentStage
     */
    spawnGroupEnemy(playerZ, currentStage) {
        const type = this.currentGroupType;
        if (!type) return;

        // プレイヤーの前方視界外
        const spawnZ = playerZ - GameConfig.enemies.spawnZDistance;

        // スポーンZにおける洞窟の動的境界を取得
        const bounds = getCaveBoundsAt(spawnZ, currentStage);
        
        // 敵が壁に埋まりすぎないようにマージンを考慮
        const marginX = 3.0;
        const marginY = 2.0;
        const a = Math.max(0.1, bounds.width / 2 - marginX);
        const b_h = Math.max(0.1, bounds.height / 2 - marginY);
        
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random());
        
        const spawnX = bounds.centerX + a * radius * Math.cos(angle);
        const spawnY = bounds.centerY + b_h * radius * Math.sin(angle);

        // 対象タイプのプールから敵を取得して配置
        const pool = this.pools[type];
        if (pool) {
            const enemy = pool.obtain(spawnX, spawnY, spawnZ);
            
            // ステージに応じた敵スピード/耐久力の補正
            if (currentStage) {
                const baseSpeed = GameConfig.enemies.types[type].speed;
                enemy.speed = baseSpeed * currentStage.enemySpeedScale;
                
                const baseHp = GameConfig.enemies.types[type].hp;
                // 後半ステージで敵HPを少し底上げ
                enemy.maxHp = baseHp + (currentStage.number >= 3 ? 1 : 0);
                enemy.hp = enemy.maxHp;
            } else {
                // ステージ情報なしの場合
                const baseSpeed = GameConfig.enemies.types[type].speed;
                enemy.speed = baseSpeed;
            }

            this.game.enemies.push(enemy);
            this.currentGroupRemaining--;
        }
    }

    /**
     * スポーンを一時停止（ボス戦開始時など）
     */
    stopSpawn() {
        this.isSpawnStopped = true;
    }

    /**
     * スポーンを再開
     */
    resumeSpawn() {
        this.isSpawnStopped = false;
        this.spawnTimer = 0.0;
        // グループ状態もリセットし、再開時に新グループから始める
        this.currentGroupType = null;
        this.currentGroupRemaining = 0;
    }

    /**
     * 特定の敵機をプールに返却する
     * @param {Enemy} enemy
     */
    releaseEnemy(enemy) {
        enemy.deactivate();
        const pool = this.pools[enemy.type];
        if (pool) {
            pool.release(enemy);
        }
    }

    /**
     * スポーナー全体のクリーンアップ
     */
    destroy() {
        for (let type in this.pools) {
            const pool = this.pools[type];
            for (let enemy of pool.pool) {
                enemy.destroy();
            }
        }
        this.pools = {};
    }
}
