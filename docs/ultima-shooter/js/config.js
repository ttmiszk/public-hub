/**
 * ゲーム全体の定数・設定値管理オブジェクト
 * 将来的なパラメータ調整や難易度調整を一元化するために定義。
 */
const GameConfig = {
    // グローバルゲーム設定
    game: {
        /** 自動前進スクロール速度 (Z軸マイナス方向の移動量/秒) */
        scrollSpeed: 30.0,
    },

    // 周回（ループ）システム設定
    loopSystem: {
        /**
         * 周回ごとの難易度乗算係数。
         * 難易度スケール = difficultyScaleMultiplier ^ (loopCount - 1)
         *   1周目: 1.00 (設定値そのまま、既存バランスを維持)
         *   2周目: 1.20
         *   3周目: 2.25
         *   ...
         */
        difficultyScaleMultiplier: 1.5,
        /** 難易度スケールの上限（無限に強くなりすぎないよう制限） */
        maxDifficultyScale: 10.0,
        /** 
         * 早回し（ゲーム進行速度）の1周ごとの加算量
         * 1周目: 1.0, 2周目: 1.2, 3周目: 1.4...
         */
        timeScaleStep: 0.2,
        /** 早回しスケールの上限（4周目到達時に1.6でカンスト） */
        maxTimeScale: 1.6,
        /** 難易度向上対象: 敵機の移動速度 */
        applyEnemySpeed: true,
        /** 難易度向上対象: 敵弾の速度 */
        applyBulletSpeed: true,
        /** 難易度向上対象: ウェーブグループの最大サイズ（同時出現数） */
        applyGroupSize: true,
        /** 難易度向上対象: スポーン間隔の短縮（出現頻度） */
        applySpawnInterval: true,
        /** 難易度向上対象: ボスのHP */
        applyBossHp: true,
        /** 難易度向上対象: ボスの移動速度 */
        applyBossMoveSpeed: true,
        /** 難易度向上対象: ボスの弾速 */
        applyBossBulletSpeed: true,
    },
    
    // プレイヤー関連設定
    player: {
        /** 最大ライフ */
        maxLife: 100,
        /** 移動速度 */
        speed: 20.0,
        /** 左右の移動制限範囲 (X座標の絶対値上限。壁の外側のフェイルセーフ制限値) */
        limitX: 26.0,
        /** 下方向の移動制限範囲 (Y座標の下限。壁の外側のフェイルセーフ制限値) */
        limitYMin: -6.0,
        /** 上方向の移動制限範囲 (Y座標の上限。壁の外側のフェイルセーフ制限値) */
        limitYMax: 18.0,
        /** ショット連射間隔 (秒) */
        fireCooldown: 0.15,
        /** 押しっぱなし時のオート連射間隔 (秒) */
        autoFireInterval: 1.0,
        /** 初期弾数 */
        initialAmmo: 300,
        /** 最大弾数 */
        maxAmmo: 999,
        /** 被弾時の無敵時間 (秒) */
        invincibleDuration: 1.0,
        /** プレイヤーの当たり判定半径 (BoundingSphere) */
        hitRadius: 1.0,
        /** 敵機との衝突ダメージ */
        collisionDamage: 20,
        /** 最大パワーレベル（ショット強化段階） */
        maxPowerLevel: 3,
    },
    
    // 弾（ショット）関連設定
    bullet: {
        /** 自機弾の移動速度 */
        speed: 100.0,
        /** 弾が自機からどれだけ離れたら消滅するか (Z軸差分の絶対値) */
        maxDistance: 150.0,
        /** 弾の当たり判定半径 */
        hitRadius: 0.5,
    },
    
    // 敵関連設定
    enemies: {
        /** 敵のスポーン判定を行う間隔 (秒) */
        spawnInterval: 1.2,
        /** プレイヤーの何マス前方に敵を出現させるか (Z座標オフセット) */
        spawnZDistance: 120.0,
        /** 敵機の描画スケール（当たり判定スケールにも適用） */
        scale: 2.4,

        /** ボス出現走行距離超過時の難易度上昇設定 */
        overDistanceDifficulty: {
            /** 出現頻度の上昇率（100m超過ごとの出現間隔の短縮率係数。高いほど出現が早くなる） */
            spawnIntervalScalePer100m: 0.15,
            /** スポーン間隔の最小値（秒）。極端な無限スポーンを防ぐための下限 */
            minSpawnInterval: 0.15,
            /** 同時出現数の増加量（100m超過ごとの加算量） */
            groupSizeBonusPer100m: 0.5,
            /** 同時出現数ボーナスの上限値 */
            maxGroupSizeBonus: 10
        },

        /**
         * ウェーブグループ設定
         * 同一タイプの敵をまとめて出現させることで攻撃パターンにまとまりを持たせる。
         */
        waveGroup: {
            /** 1グループあたりの最小出現数 */
            minSize: 2,
            /** 1グループあたりの最大出現数 */
            maxSize: 4,
            /**
             * グループ間の待機時間倍率（ランダム範囲）
             * (通常スポーン間隔 × ランダム値) だけ余分に待機してから次グループを開始する。
             * ～0.3: 前グループがまだ画面上に残っている状態で次グループが出現 → 異種混在
             * ～1.0: 前グループが消えるタイミングで切り替わる
             * ～2.5: 画面が一瞬静かになり、新グループが波のように登場 → 明確な切り替わり感
             * Min を小さくすると異なる種類の敵が画面上に混在しやすくなる。
             * Max を大きくすると切り替わりが明確になる。
             */
            breakMultiplierMin: 0.3,  // 短い → 前グループと重なりやすい
            breakMultiplierMax: 2.5,  // 長い → グループが明確に分かれる
        },
        
        /** 敵タイプごとの個別設定 */
        types: {
            A: {
                name: 'Straight',
                hp: 1,           // 耐久力
                score: 100,      // 撃破時スコア
                killPoints: 10,  // ボス出現に必要なゲージ蓄積量
                speed: 12.0,     // 基本移動速度
                hitRadius: 1.1,  // 当たり判定半径
                color: 0xeb3b5a, // ネオンレッド
            },
            B: {
                name: 'Zizgag',
                hp: 2,           // 耐久力
                score: 200,      // 撃破時スコア
                killPoints: 20,  // ボス出現に必要なゲージ蓄積量
                speed: 10.0,     // 基本移動速度
                hitRadius: 1.2,  // 当たり判定半径
                color: 0xfa8231, // ネオンオレンジ
                waveAmp: 5.0,    // 左右に蛇行する振幅
                waveFreq: 2.5,   // 蛇行する周期
            },
            C: {
                name: 'Charger',
                hp: 1,           // 耐久力
                score: 150,      // 撃破時スコア
                killPoints: 15,  // ボス出現に必要なゲージ蓄積量
                speed: 18.0,     // 基本移動速度 (特攻型のため高速)
                hitRadius: 1.0,  // 当たり判定半径
                color: 0xfd9644, // 蛍光ライトオレンジ
            },
            D: {
                name: 'Shooter',
                hp: 3,           // 耐久力
                score: 300,      // 撃破時スコア
                killPoints: 30,  // ボス出現に必要なゲージ蓄積量
                speed: 8.0,      // 基本移動速度
                hitRadius: 1.4,  // 当たり判定半径
                color: 0xff0055, // マゼンタ
                stopZOffset: 45.0, // プレイヤーの手前この距離で停止して撃つ
                fireInterval: 1.8, // 弾を発射する間隔 (秒)
            },
            E: {
                name: 'Sniper',
                hp: 2,           // 耐久力
                score: 400,      // 撃破時スコア
                killPoints: 40,  // ボス出現に必要なゲージ蓄積量
                speed: 9.0,      // 基本移動速度
                hitRadius: 1.2,  // 当たり判定半径
                color: 0x20bf6b, // ネオングリーン
                stopZOffset: 75.0, // プレイヤーの手前この距離で停止して狙撃
                fireInterval: 2.0, // 弾を発射する間隔 (秒)
                stayDuration: 4.0, // 停止射撃している時間 (秒)
            },
            F: {
                name: 'Helix',
                hp: 2,           // 耐久力
                score: 500,      // 撃破時スコア
                killPoints: 50,  // ボス出現に必要なゲージ蓄積量
                speed: 13.0,     // 基本移動速度
                hitRadius: 3.2,  // 当たり判定半径
                color: 0x0fbcf9, // ネオンシアン
                waveAmpX: 8.0,   // 横方向の螺旋振幅
                waveAmpY: 5.0,   // 縦方向の螺旋振幅
                waveFreqX: 2.8,  // 横方向の螺旋周期
                waveFreqY: 2.0,  // 縦方向の螺旋周期
            }
        }
    },
    
    // 敵弾関連設定
    enemyBullet: {
        /** 敵弾のスピード */
        speed: 11.0,
        /** 敵弾の当たり判定半径 */
        hitRadius: 0.3,
        /** 敵弾がプレイヤーに与えるダメージ */
        damage: 10,
    },
    
    // アイテム関連設定
    items: {
        /** 敵撃破時のアイテム出現確率 (0.0〜1.0) */
        dropChance: 0.3,
        /** アイテムの移動スピード (Zプラス方向。ゆっくり接近) */
        speed: 15.0,
        /** 当たり判定半径 */
        hitRadius: 2.2,
        /** 自機へのマグネット吸い寄せを開始する距離 (広範囲吸い寄せ) */
        magnetRange: 35.0,
        /** マグネット吸い寄せ時の最大速度 */
        magnetSpeed: 50.0,
        
        /** 空間上での出現判定間隔 (秒) */
        spawnInterval: 2.5,
        /** 空間上での出現確率 */
        spawnChance: {
            BULLET: 0.4,
            HEAL: 0.25,
            BARRIER: 0.15
        },
        
        /** 各アイテムタイプ別の効果値 */
        types: {
            BULLET: {
                bulletValues: [10, 30, 50],
                color: 0x00d2d3 // シアン
            },
            HEAL: {
                healValues: [10, 20, 30],
                color: 0xff2255 // 明るい赤
            },
            POWERUP: {
                color: 0xff00ff // ネオンマゼンタ
            },
            BARRIER: {
                duration: 10.0,  // 無敵時間 (秒)
                color: 0xfeca57 // イエロー
            }
        }
    },
    
    // カメラ関連設定 (見下ろし角度を浅く、前方視野をさらに確保)
    camera: {
        /** 自機に対するカメラの相対位置オフセット */
        offset: {
            x: 0,
            y: 2.5,    // 3.5 ➔ 2.5 (より真後ろに近い高さ)
            z: 6.5
        },
        /** カメラが注視する自機からのオフセット */
        lookAtOffset: {
            x: 0,
            y: 0.5,    // 0.0 ➔ 0.5 (自機の少し上を注視して前方視界を広げる)
            z: -20.0
        },
        /** カメラの自機追従の滑らかさ */
        lerpSpeed: 0.2,
    },
    
    // ステージ関連設定
    stages: [
        {
            number: 1,
            name: 'Grasslands',
            theme: {
                gridColor: 0x00ff88,
                gridColorCenter: 0x113311,
                fogColor: 0x020f08,
                fogDensity: 0.01, // 洞窟が見えるようフォグを少しだけ薄く
                ambientColor: 0xffffff,
                ambientIntensity: 1.1,
                wallColor: 0x00ff88,
                wallOpacity: 1.0
            },
            cave: {
                maxWidth: 100.0,
                maxHeight: 80.0,
                minWidth: 30.0,           // 最小幅
                minHeight: 48.0,          // 最小高さ (視認性向上のため高めに設定)
                baseCenterX: 0.0,
                baseCenterY: 6.0,
                seed: 1001,
                sizeChangeSpeed: 0.02,    // 狭くなる速度
                sizeNarrowThreshold: 0.3, // 狭くなる頻度（高＝頻度低）
                centerChangeSpeed: 0.01,  // 中心位置の変化速度
                centerChangeAmpX: 15.0,   // 左右の最大振れ幅
                centerChangeAmpY: 15.0    // 上下の最大振れ幅
            },
            obstacles: {
                spawnInterval: 3.5       // 障害物(岩)の出現間隔 (秒)
            },
            length: 1000.0, // ボス出現までの走行距離
            requiredKillPoints: 150, // ボス出現に必要な撃破ポイント
            clearBaseBonus: 3000,
            spawnInterval: 0.95,
            enemySpeedScale: 1.0,
            spawnWeights: {
                A: 0.45,
                B: 0.30,
                C: 0.15,
                D: 0.10,
                E: 0.00,
                F: 0.00
            }
        },
        {
            number: 2,
            name: 'Ocean',
            theme: {
                gridColor: 0x00aaff,
                gridColorCenter: 0x002244,
                fogColor: 0x000818,
                fogDensity: 0.01,
                ambientColor: 0xddf0ff,
                ambientIntensity: 1.1,
                wallColor: 0x00aaff,
                wallOpacity: 1.0
            },
            cave: {
                maxWidth: 80.0,
                maxHeight: 80.0,
                minWidth: 24.0,            // 最小幅
                minHeight: 48.0,           // 最小高さ (視認性向上のため高めに設定)
                baseCenterX: 0.0,
                baseCenterY: 6.0,
                seed: 2002,
                sizeChangeSpeed: 0.02,     // 狭くなる速度
                sizeNarrowThreshold: 0.2,  // 狭くなる頻度（中）
                centerChangeSpeed: 0.01,   // 中心位置の変化速度
                centerChangeAmpX: 15.0,    // 左右の最大振れ幅
                centerChangeAmpY: 15.0     // 上下の最大振れ幅
            },
            obstacles: {
                spawnInterval: 2.2       // 障害物(岩)の出現間隔 (秒)
            },
            length: 1200.0,
            requiredKillPoints: 250,
            clearBaseBonus: 5000,
            spawnInterval: 0.8,
            enemySpeedScale: 1.2,
            spawnWeights: {
                A: 0.30,
                B: 0.25,
                C: 0.20,
                D: 0.15,
                E: 0.10,
                F: 0.00
            }
        },
        {
            number: 3,
            name: 'Void Cave',
            theme: {
                gridColor: 0x9900ff,
                gridColorCenter: 0x3c1b5b,
                fogColor: 0x05010a,
                fogDensity: 0.01,
                ambientColor: 0xccbbff,
                ambientIntensity: 1.1,
                wallColor: 0x9900ff,
                wallOpacity: 1.0
            },
            cave: {
                maxWidth: 80.0,
                maxHeight: 80.0,
                minWidth: 16.0,            // 最小幅
                minHeight: 40.0,           // 最小高さ (視認性向上のため高めに設定)
                baseCenterX: 0.0,
                baseCenterY: 6.0,
                seed: 3003,
                sizeChangeSpeed: 0.02,     // 狭くなる速度
                sizeNarrowThreshold: 0.05, // 狭くなる頻度（低＝頻繁に狭くなる）
                centerChangeSpeed: 0.01,   // 中心位置の変化速度
                centerChangeAmpX: 20.0,    // 左右の最大振れ幅
                centerChangeAmpY: 20.0     // 上下の最大振れ幅
            },
            obstacles: {
                spawnInterval: 1.2       // 障害物(岩)の出現間隔 (秒)
            },
            length: 1500.0,
            requiredKillPoints: 450,
            clearBaseBonus: 8000,
            spawnInterval: 0.6,
            enemySpeedScale: 1.2,
            spawnWeights: {
                A: 0.18,
                B: 0.20,
                C: 0.18,
                D: 0.16,
                E: 0.18,
                F: 0.10
            }
        }
    ],

    // 障害物設定
    obstacles: {
        types: {
            ROCK: {
                name: 'Rock',
                damage: 35,      // 岩との激突ダメージを35に微調整
                color: 0x7f8c8d, // 岩石グレー
                hitRadius: 2.4
            }
        }
    },

    // ボス設定
    bosses: {
        types: [
            {
                name: 'GREEN TITAN',
                hp: 40,
                color: 0x00ff88,
                score: 5000,
                hitRadius: 6.0,
                moveSpeedX: 4.5,
                moveSpeedY: 2.5,
                bulletSpeed: 10.5,
                fireIntervalScale: 1.0,
                evadeProb: 0.1
            },
            {
                name: 'BLUE LEVIATHAN',
                hp: 75,
                color: 0x00aaff,
                score: 8000,
                hitRadius: 7.0,
                moveSpeedX: 6.5,
                moveSpeedY: 3.5,
                bulletSpeed: 12.0,
                fireIntervalScale: 0.8,
                evadeProb: 0.2
            },
            {
                name: 'VOID OVERLORD',
                hp: 120,
                color: 0x9900ff,
                score: 15000,
                hitRadius: 8.0,
                moveSpeedX: 8.5,
                moveSpeedY: 4.5,
                bulletSpeed: 13.5,
                fireIntervalScale: 0.6,
                evadeProb: 0.3
            }
        ]
    }
};
