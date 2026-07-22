/**
 * @fileoverview audioData.js
 * 音声データ定義ファイル。Web Audio APIで生成するSE（効果音）やBGM（音楽）の
 * オシレータ設定、エンベロープ、MMLシーケンスデータを一元管理する。
 */

const AudioData = {
        /**
         * 効果音（SE）データの一元管理オブジェクト
         * 【編集・追加方法】
         * 新しい効果音を追加する場合は、以下にキーとノード定義を追加してください。
         */
        seDefinitions: {
            // 自機の弾を発射（サイバーパンク風でクールな電子音）
            // アタックの強い高音のピッチスイープと、丸みのある中音のピッチスイープをブレンド
            playerShoot: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'triangle',
                        frequency: { start: 1500, end: 120, duration: 0.12, ramp: 'exponential' },
                        gain: { start: 0.4, end: 0.001, duration: 0.12, ramp: 'exponential' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'sine',
                        frequency: { start: 3000, end: 600, duration: 0.06, ramp: 'exponential' },
                        gain: { start: 0.2, end: 0.001, duration: 0.06, ramp: 'exponential' }
                    }
                ]
            },
            // 自機弾が岩に当たった時の金属音（キン！）
            bulletHitRock: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'triangle',
                        frequency: { start: 2500, end: 1200, duration: 0.1, ramp: 'exponential' },
                        gain: { start: 0.6, end: 0.001, duration: 0.1, ramp: 'exponential' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'sine',
                        frequency: { start: 3500, end: 2000, duration: 0.05, ramp: 'exponential' },
                        gain: { start: 0.4, end: 0.001, duration: 0.05, ramp: 'exponential' }
                    }
                ]
            },
            // 自機が敵の弾を被弾（鋭く短いデジタル被弾音）
            playerHit: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'sine',
                        frequency: { start: 2000, end: 300, duration: 0.06, ramp: 'exponential' },
                        gain: { start: 0.3, end: 0.001, duration: 0.06, ramp: 'exponential' }
                    },
                    {
                        type: 'noise',
                        gain: { start: 0.2, end: 0.001, duration: 0.05, ramp: 'exponential' },
                        filter: {
                            type: 'bandpass',
                            frequency: { start: 2000, end: 800, duration: 0.05, ramp: 'linear' },
                            Q: 3.0
                        }
                    }
                ]
            },
            // 自機が敵／壁／岩に衝突（現在の爆発音をベースに、よりノイズを増強して短縮した重低音仕様）
            playerCollide: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'sine',
                        frequency: { start: 160, end: 40, duration: 0.4, ramp: 'exponential' },
                        gain: { start: 0.6, end: 0.001, duration: 0.4, ramp: 'exponential' }
                    },
                    {
                        type: 'noise',
                        gain: { start: 0.6, end: 0.001, duration: 0.35, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 400, end: 80, duration: 0.35, ramp: 'linear' },
                            Q: 1.0
                        }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        frequency: { start: 500, end: 80, duration: 0.25, ramp: 'exponential' },
                        gain: { start: 0.3, end: 0.001, duration: 0.25, ramp: 'exponential' }
                    }
                ]
            },
            // 自機がライフゼロになって爆発 (大爆発のあと、連続的に細かい爆破音が鳴って機体が消滅していく)
            playerExplode: {
                nodes: [
                    // --- 1. 初撃の大爆発 (t = 0) ---
                    // 重低音の爆風 (ローパスノイズを強調)
                    {
                        type: 'noise',
                        delay: 0,
                        gain: { start: 1.8, end: 0.001, duration: 1.8, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 500, end: 20, duration: 1.8, ramp: 'linear' },
                            Q: 1.5
                        }
                    },
                    // 中〜高音の破砕ノイズ (広帯域)
                    {
                        type: 'noise',
                        delay: 0,
                        gain: { start: 1.5, end: 0.001, duration: 1.2, ramp: 'exponential' },
                        filter: {
                            type: 'bandpass',
                            frequency: { start: 1500, end: 100, duration: 1.2, ramp: 'linear' },
                            Q: 1.0
                        }
                    },
                    // 鋭い衝撃音
                    {
                        type: 'noise',
                        delay: 0,
                        gain: { start: 1.2, end: 0.001, duration: 0.5, ramp: 'exponential' },
                        filter: {
                            type: 'highpass',
                            frequency: { start: 3000, end: 800, duration: 0.5, ramp: 'linear' },
                            Q: 1.0
                        }
                    },
                    
                    // --- 2. 連続する誘爆・小爆発 (乾いたノイズによる機体崩壊、時間を大幅に延長) ---
                    // 誘爆1 (t = 0.2)
                    {
                        type: 'noise', delay: 0.2, gain: { start: 1.0, end: 0.001, duration: 0.5, ramp: 'exponential' },
                        filter: { type: 'lowpass', frequency: { start: 1000, end: 100, duration: 0.5, ramp: 'linear' }, Q: 1.2 }
                    },
                    // 誘爆2 (t = 0.35)
                    {
                        type: 'noise', delay: 0.35, gain: { start: 1.2, end: 0.001, duration: 0.4, ramp: 'exponential' },
                        filter: { type: 'bandpass', frequency: { start: 1500, end: 200, duration: 0.4, ramp: 'linear' }, Q: 1.0 }
                    },
                    // 誘爆3 (t = 0.55) - 重めのノイズ
                    {
                        type: 'noise', delay: 0.55, gain: { start: 1.3, end: 0.001, duration: 0.6, ramp: 'exponential' },
                        filter: { type: 'lowpass', frequency: { start: 800, end: 50, duration: 0.6, ramp: 'linear' }, Q: 1.5 }
                    },
                    // 誘爆4 (t = 0.8)
                    {
                        type: 'noise', delay: 0.8, gain: { start: 1.0, end: 0.001, duration: 0.4, ramp: 'exponential' },
                        filter: { type: 'bandpass', frequency: { start: 1800, end: 300, duration: 0.4, ramp: 'linear' }, Q: 1.2 }
                    },
                    // 誘爆5 (t = 1.05)
                    {
                        type: 'noise', delay: 1.05, gain: { start: 1.2, end: 0.001, duration: 0.5, ramp: 'exponential' },
                        filter: { type: 'lowpass', frequency: { start: 900, end: 80, duration: 0.5, ramp: 'linear' }, Q: 1.0 }
                    },
                    // 誘爆6 (t = 1.3)
                    {
                        type: 'noise', delay: 1.3, gain: { start: 0.9, end: 0.001, duration: 0.4, ramp: 'exponential' },
                        filter: { type: 'bandpass', frequency: { start: 1200, end: 400, duration: 0.4, ramp: 'linear' }, Q: 1.0 }
                    },
                    // 誘爆7 (t = 1.6) - 断末魔のような引きずるノイズ
                    {
                        type: 'noise', delay: 1.6, gain: { start: 1.3, end: 0.001, duration: 0.8, ramp: 'exponential' },
                        filter: { type: 'lowpass', frequency: { start: 700, end: 40, duration: 0.8, ramp: 'linear' }, Q: 1.2 }
                    },
                    // 誘爆8 (t = 1.95)
                    {
                        type: 'noise', delay: 1.95, gain: { start: 1.0, end: 0.001, duration: 0.6, ramp: 'exponential' },
                        filter: { type: 'bandpass', frequency: { start: 1000, end: 200, duration: 0.6, ramp: 'linear' }, Q: 1.0 }
                    },
                    // 誘爆9 (t = 2.3)
                    {
                        type: 'noise', delay: 2.3, gain: { start: 0.8, end: 0.001, duration: 0.5, ramp: 'exponential' },
                        filter: { type: 'lowpass', frequency: { start: 500, end: 50, duration: 0.5, ramp: 'linear' }, Q: 1.0 }
                    },
                    // 誘爆10 (t = 2.7)
                    {
                        type: 'noise', delay: 2.7, gain: { start: 0.6, end: 0.001, duration: 0.6, ramp: 'exponential' },
                        filter: { type: 'lowpass', frequency: { start: 400, end: 30, duration: 0.6, ramp: 'linear' }, Q: 1.0 }
                    },
                    // 誘爆11 (t = 3.1)
                    {
                        type: 'noise', delay: 3.1, gain: { start: 0.5, end: 0.001, duration: 0.5, ramp: 'exponential' },
                        filter: { type: 'lowpass', frequency: { start: 300, end: 20, duration: 0.5, ramp: 'linear' }, Q: 1.0 }
                    },
                    // 誘爆12 (最終フェードアウト t = 3.5)
                    {
                        type: 'noise', delay: 3.5, gain: { start: 0.3, end: 0.001, duration: 0.8, ramp: 'exponential' },
                        filter: { type: 'lowpass', frequency: { start: 200, end: 10, duration: 0.8, ramp: 'linear' }, Q: 1.0 }
                    }
                ]
            },
            // 敵機が弾を発射（矩形波を使用したレトロ風の乾いた「ピピッ」という電子音）
            enemyShoot: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'square',
                        frequency: { start: 900, end: 300, duration: 0.08, ramp: 'exponential' },
                        gain: { start: 0.15, end: 0.001, duration: 0.08, ramp: 'exponential' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'sine',
                        frequency: { start: 1600, end: 600, duration: 0.04, ramp: 'exponential' },
                        gain: { start: 0.1, end: 0.001, duration: 0.04, ramp: 'exponential' }
                    }
                ]
            },
            // 敵機に弾が命中（ダメージを感じさせる「バシッ」「グシャッ」という被弾音）
            enemyHit: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'triangle',
                        frequency: { start: 800, end: 150, duration: 0.12, ramp: 'exponential' },
                        gain: { start: 0.4, end: 0.001, duration: 0.12, ramp: 'exponential' }
                    },
                    {
                        type: 'noise',
                        gain: { start: 0.5, end: 0.001, duration: 0.1, ramp: 'exponential' },
                        filter: {
                            type: 'bandpass',
                            frequency: { start: 1000, end: 300, duration: 0.1, ramp: 'linear' },
                            Q: 1.5
                        }
                    }
                ]
            },
            // 敵機が爆発・消滅（乾いたノイズ中心の爆発音）
            enemyExplode: {
                nodes: [
                    // 爆風メイン（ローパスノイズ）
                    {
                        type: 'noise',
                        gain: { start: 1.5, end: 0.001, duration: 0.45, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 1000, end: 50, duration: 0.45, ramp: 'linear' },
                            Q: 1.2
                        }
                    },
                    // 破砕するような乾いたノイズ（バンドパス）
                    {
                        type: 'noise',
                        gain: { start: 1.0, end: 0.001, duration: 0.3, ramp: 'exponential' },
                        filter: {
                            type: 'bandpass',
                            frequency: { start: 2000, end: 500, duration: 0.3, ramp: 'linear' },
                            Q: 1.0
                        }
                    }
                ]
            },
            // アイテム獲得 (きらびやかでデジタル感のある獲得音)
            itemPickup: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'sine',
                        frequency: { start: 1000, end: 2800, duration: 0.08, ramp: 'exponential' },
                        gain: { start: 0.3, end: 0.001, duration: 0.2, ramp: 'exponential' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'triangle',
                        delay: 0.04,
                        frequency: { start: 1500, end: 3200, duration: 0.06, ramp: 'exponential' },
                        gain: { start: 0.25, end: 0.001, duration: 0.18, ramp: 'exponential' }
                    },
                    {
                        type: 'noise',
                        delay: 0.02,
                        gain: { start: 0.15, end: 0.001, duration: 0.12, ramp: 'exponential' },
                        filter: {
                            type: 'bandpass',
                            frequency: { start: 4000, end: 2000, duration: 0.12, ramp: 'linear' },
                            Q: 4.0
                        }
                    }
                ]
            },
            // バリア獲得 (エネルギーが充填されるような力強い音)
            barrierGet: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'sine',
                        frequency: { start: 200, end: 1200, duration: 0.6, ramp: 'exponential' },
                        gain: { start: 0.5, end: 0.001, duration: 0.6, ramp: 'exponential' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'square',
                        frequency: { start: 300, end: 1500, duration: 0.5, ramp: 'exponential' },
                        gain: { start: 0.2, end: 0.001, duration: 0.5, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 500, end: 3000, duration: 0.4, ramp: 'linear' },
                            Q: 2.0
                        }
                    }
                ]
            },
            // バリア持続中の回転音（無敵感を強調するテンポの良いピロピロ音）
            barrierLoop: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'square',
                        frequency: { start: 800, end: 1600, duration: 0.05, ramp: 'exponential' },
                        gain: { start: 0.1, end: 0.001, duration: 0.08, ramp: 'exponential' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'square',
                        delay: 0.075,
                        frequency: { start: 1600, end: 3200, duration: 0.05, ramp: 'exponential' },
                        gain: { start: 0.1, end: 0.001, duration: 0.08, ramp: 'exponential' }
                    }
                ]
            },
            // ボスキャラ通常弾発射 (重厚で低い「ドシュッ」という射撃音)
            bossShoot: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'triangle',
                        frequency: { start: 500, end: 80, duration: 0.18, ramp: 'exponential' },
                        gain: { start: 0.6, end: 0.001, duration: 0.18, ramp: 'exponential' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        frequency: { start: 400, end: 100, duration: 0.12, ramp: 'exponential' },
                        gain: { start: 0.3, end: 0.001, duration: 0.12, ramp: 'exponential' }
                    },
                    {
                        type: 'noise',
                        gain: { start: 0.5, end: 0.001, duration: 0.18, ramp: 'exponential' },
                        filter: {
                            type: 'bandpass',
                            frequency: { start: 800, end: 100, duration: 0.18, ramp: 'linear' },
                            Q: 1.5
                        }
                    }
                ]
            },
            // ボスビーム予告 レーザーポインター照準音 (緊張感のある一定高音「ツー…」)
            bossBeamLockOn: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'sine',
                        frequency: { start: 2800, end: 2800, duration: 0.2, ramp: 'linear' },
                        gain: { start: 0.2, end: 0.3, duration: 0.2, ramp: 'linear' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'sine',
                        frequency: { start: 2815, end: 2815, duration: 0.2, ramp: 'linear' },
                        gain: { start: 0.15, end: 0.25, duration: 0.2, ramp: 'linear' }
                    },
                    {
                        type: 'noise',
                        gain: { start: 0.03, end: 1.8, duration: 1.6, ramp: 'linear' },
                        filter: {
                            type: 'bandpass',
                            frequency: { start: 3200, end: 3200, duration: 0.8, ramp: 'linear' },
                            Q: 8.0
                        }
                    }
                ]
            },
            // ボスビーム Stage 1: 単発ビーム (高音から低音へ迫力の「ビーーーーッ」)
            bossBeamSingle: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        frequency: { start: 800, end: 200, duration: 1.8, ramp: 'exponential' },
                        gain: { start: 0.5, end: 0.15, duration: 1.8, ramp: 'linear' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'square',
                        frequency: { start: 250, end: 80, duration: 1.8, ramp: 'exponential' },
                        gain: { start: 0.3, end: 0.1, duration: 1.8, ramp: 'linear' }
                    },
                    {
                        type: 'noise',
                        gain: { start: 0.4, end: 0.1, duration: 1.8, ramp: 'linear' },
                        filter: {
                            type: 'bandpass',
                            frequency: { start: 2500, end: 600, duration: 1.8, ramp: 'linear' },
                            Q: 2.0
                        }
                    }
                ]
            },
            // ボスビーム Stage 2: 左右2本同時ビーム (うねり下降「ギュイーーーン」)
            bossBeamDual: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        frequency: { start: 700, end: 180, duration: 1.8, ramp: 'exponential' },
                        gain: { start: 0.4, end: 0.12, duration: 1.8, ramp: 'linear' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        frequency: { start: 730, end: 195, duration: 1.8, ramp: 'exponential' },
                        gain: { start: 0.4, end: 0.12, duration: 1.8, ramp: 'linear' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'sine',
                        frequency: { start: 120, end: 50, duration: 1.8, ramp: 'exponential' },
                        gain: { start: 0.35, end: 0.1, duration: 1.8, ramp: 'linear' }
                    },
                    {
                        type: 'noise',
                        gain: { start: 0.35, end: 0.08, duration: 1.8, ramp: 'linear' },
                        filter: {
                            type: 'bandpass',
                            frequency: { start: 2000, end: 400, duration: 1.8, ramp: 'linear' },
                            Q: 2.5
                        }
                    }
                ]
            },
            // ボスビーム Stage 3: 極太追尾ビーム (圧力と重みの「ゴゴゴゴゴ…」)
            bossBeamHeavy: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        frequency: { start: 450, end: 100, duration: 2.0, ramp: 'exponential' },
                        gain: { start: 0.55, end: 0.2, duration: 2.0, ramp: 'linear' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'square',
                        frequency: { start: 90, end: 30, duration: 2.0, ramp: 'exponential' },
                        gain: { start: 0.45, end: 0.15, duration: 2.0, ramp: 'linear' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'sine',
                        frequency: { start: 480, end: 110, duration: 2.0, ramp: 'exponential' },
                        gain: { start: 0.3, end: 0.1, duration: 2.0, ramp: 'linear' }
                    },
                    {
                        type: 'noise',
                        gain: { start: 0.6, end: 0.2, duration: 2.0, ramp: 'linear' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 1500, end: 300, duration: 2.0, ramp: 'linear' },
                            Q: 1.5
                        }
                    }
                ]
            },
            // ボス被弾 (重い金属的なヒット音「ガキン」)
            bossHit: {
                nodes: [
                    {
                        type: 'oscillator',
                        oscType: 'triangle',
                        frequency: { start: 600, end: 100, duration: 0.15, ramp: 'exponential' },
                        gain: { start: 0.55, end: 0.001, duration: 0.15, ramp: 'exponential' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'square',
                        frequency: { start: 300, end: 60, duration: 0.12, ramp: 'exponential' },
                        gain: { start: 0.35, end: 0.001, duration: 0.12, ramp: 'exponential' }
                    },
                    {
                        type: 'noise',
                        gain: { start: 0.55, end: 0.001, duration: 0.15, ramp: 'exponential' },
                        filter: {
                            type: 'bandpass',
                            frequency: { start: 1200, end: 300, duration: 0.15, ramp: 'linear' },
                            Q: 2.0
                        }
                    }
                ]
            },
            // ボス撃破・大爆発 (派手な連続爆発「ドゴーーンッ！ボボボボ…ボボボボ…ボボボボ」)
            bossExplode: {
                nodes: [
                    // === 1. 最初の大爆発 (派手で重厚なドゴーン) ===
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        frequency: { start: 250, end: 15, duration: 2.2, ramp: 'exponential' },
                        gain: { start: 2.6, end: 0.1, duration: 1.2, ramp: 'exponential' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'triangle',
                        frequency: { start: 120, end: 10, duration: 2.2, ramp: 'exponential' },
                        gain: { start: 2.4, end: 0.1, duration: 1.2, ramp: 'exponential' }
                    },
                    {
                        type: 'noise',
                        gain: { start: 2.5, end: 0.1, duration: 2.5, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 2500, end: 100, duration: 2.5, ramp: 'linear' },
                            Q: 2.0
                        }
                    },

                    // === 2. 誘爆の連鎖 (ボボボボ…ボボボボ…が大きく長続き) ===
                    // 誘爆1 (0.2秒)
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        delay: 0.2,
                        frequency: { start: 180, end: 20, duration: 0.7, ramp: 'exponential' },
                        gain: { start: 2.0, end: 0.1, duration: 0.7, ramp: 'exponential' }
                    },
                    {
                        type: 'noise',
                        delay: 0.2,
                        gain: { start: 1.9, end: 0.1, duration: 0.7, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 800, end: 80, duration: 0.7, ramp: 'linear' },
                            Q: 1.5
                        }
                    },
                    // 誘爆2 (0.5秒)
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        delay: 0.5,
                        frequency: { start: 150, end: 20, duration: 0.6, ramp: 'exponential' },
                        gain: { start: 1.95, end: 0.1, duration: 0.6, ramp: 'exponential' }
                    },
                    {
                        type: 'noise',
                        delay: 0.5,
                        gain: { start: 1.85, end: 0.1, duration: 0.6, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 600, end: 70, duration: 0.6, ramp: 'linear' },
                            Q: 1.5
                        }
                    },
                    // 誘爆3 (0.8秒)
                    {
                        type: 'noise',
                        delay: 0.8,
                        gain: { start: 1.9, end: 0.1, duration: 0.6, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 500, end: 60, duration: 0.6, ramp: 'linear' },
                            Q: 1.0
                        }
                    },
                    // 誘爆4 (1.1秒)
                    {
                        type: 'noise',
                        delay: 1.1,
                        gain: { start: 1.85, end: 0.1, duration: 0.6, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 450, end: 50, duration: 0.6, ramp: 'linear' },
                            Q: 1.0
                        }
                    },
                    // 誘爆5 (1.4秒)
                    {
                        type: 'noise',
                        delay: 1.4,
                        gain: { start: 1.8, end: 0.001, duration: 0.6, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 400, end: 45, duration: 0.6, ramp: 'linear' },
                            Q: 1.0
                        }
                    },
                    // 誘爆6 (1.7秒)
                    {
                        type: 'noise',
                        delay: 1.7,
                        gain: { start: 1.75, end: 0.001, duration: 0.6, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 350, end: 40, duration: 0.6, ramp: 'linear' },
                            Q: 1.0
                        }
                    },
                    // 誘爆7 (2.0秒)
                    {
                        type: 'noise',
                        delay: 2.0,
                        gain: { start: 1.65, end: 0.001, duration: 0.6, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 300, end: 35, duration: 0.6, ramp: 'linear' },
                            Q: 1.0
                        }
                    },
                    // 誘爆8 (2.3秒)
                    {
                        type: 'noise',
                        delay: 2.3,
                        gain: { start: 2.5, end: 0.1, duration: 0.6, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 250, end: 30, duration: 0.6, ramp: 'linear' },
                            Q: 1.0
                        }
                    },
                    // 誘爆9 (2.6秒)
                    {
                        type: 'noise',
                        delay: 2.6,
                        gain: { start: 2.35, end: 0.1, duration: 0.6, ramp: 'exponential' },
                        filter: {
                            type: 'lowpass',
                            frequency: { start: 200, end: 25, duration: 0.6, ramp: 'linear' },
                            Q: 1.0
                        }
                    }
                ]
            },
            // ボス接近アラーム警告ブザー (SF映画風の低いエコー付きブザー「ブゥーーン…ブゥーーン…」、一定音量維持)
            bossWarningAlarm: {
                nodes: [
                    // --- 元音 (0.0s) ---
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        frequency: { start: 100, end: 98, duration: 0.45, ramp: 'linear' },
                        gain: { start: 0.35, end: 0.3, duration: 0.45, ramp: 'linear' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'triangle',
                        frequency: { start: 102, end: 100, duration: 0.45, ramp: 'linear' },
                        gain: { start: 0.28, end: 0.25, duration: 0.45, ramp: 'linear' }
                    },
                    // --- エコー1 (0.15s遅れ) ---
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        delay: 0.15,
                        frequency: { start: 100, end: 98, duration: 0.35, ramp: 'linear' },
                        gain: { start: 0.18, end: 0.15, duration: 0.35, ramp: 'linear' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'triangle',
                        delay: 0.15,
                        frequency: { start: 102, end: 100, duration: 0.35, ramp: 'linear' },
                        gain: { start: 0.13, end: 0.1, duration: 0.35, ramp: 'linear' }
                    },
                    // --- エコー2 (0.3s遅れ) ---
                    {
                        type: 'oscillator',
                        oscType: 'sawtooth',
                        delay: 0.3,
                        frequency: { start: 100, end: 98, duration: 0.25, ramp: 'linear' },
                        gain: { start: 0.08, end: 0.06, duration: 0.25, ramp: 'linear' }
                    },
                    {
                        type: 'oscillator',
                        oscType: 'triangle',
                        delay: 0.3,
                        frequency: { start: 102, end: 100, duration: 0.25, ramp: 'linear' },
                        gain: { start: 0.06, end: 0.04, duration: 0.25, ramp: 'linear' }
                    }
                ]
            }
        },

        /**
         * BGMデータの一元管理オブジェクト
         * 各BGMデータは 'file' (外部音声ファイル) または 'synth' (Web Audio合成音シーケンサー) で定義します。
         * 
         * 【形式1: 外部音声ファイル再生 (type: 'file')】
         *   {
         *     type: 'file',
         *     url: 'assets/bgm_stage1.mp3' // 音声ファイルURL (必須)
         *   }
         *   ※ type: 'file' かつ url が設定されている場合、同一オブジェクト内の patterns や tracks 等の
         *      合成音定義は無視され、URLの音声ファイル再生が優先されます。
         * 
         * 【形式2: プログラム合成音シーケンサー (type: 'synth')】
         *   {
         *     type: 'synth',
         *     bpm: 150,
         *     loop: true,
         *     patterns: { ... }, // スペース区切りの "音名:拍数" (休符: "-", "R")
         *     tracks: [ ... ]    // 発音タイプ・音量・シーケンス配列等
         *   }
         */
        bgmDefinitions: {
            stage1: {
                type: 'file',
                url: 'assets/bgm_stage1.mp3'
            },
            boss1: {
                type: 'file',
                url: 'assets/bgm_boss1.mp3'
            },
            stage2: {
                type: 'file',
                url: 'assets/bgm_stage2.mp3'
            },
            boss2: {
                type: 'file',
                url: 'assets/bgm_boss2.mp3'
            },
            stage3: {
                type: 'file',
                url: 'assets/bgm_stage3.mp3'
            },
            boss3: {
                type: 'file',
                url: 'assets/bgm_boss3.mp3'
            },
            stageClear: {
                type: 'synth',
                bpm: 155,
                loop: false,
                patterns: {
                    kick_clear: "x:1.0 -:0.5 x:0.5 x:1.0 x:1.0",
                    snare_roll: "x:0.25 x:0.25 x:0.25 x:0.25 x:0.5 x:0.5 x:0.5 x:0.5",
                    hat_clear:  "x:0.25 x:0.25 x:0.25 x:0.25 x:0.25 x:0.25 x:0.25 x:0.25 x:0.25 x:0.25 x:0.25 x:0.25 x:0.25 x:0.25 x:0.25 x:0.25",
                    
                    bass_clear_1: "C2:0.5 C2:0.5 C3:0.5 C2:0.5 D2:0.5 D2:0.5 D3:0.5 D2:0.5",
                    bass_clear_2: "E2:0.5 E2:0.5 E3:0.5 E2:0.5 G2:0.5 G2:0.5 G3:0.5 G2:0.5",
                    bass_clear_3: "F2:0.5 F2:0.5 F3:0.5 F2:0.5 G2:0.5 G2:0.5 G3:0.5 G2:0.5",
                    bass_clear_4: "C2:1.0 E2:1.0 G2:1.0 C3:1.0",
                    
                    melody_clear_1: "G4:0.5 G4:0.5 C5:1.5 E5:0.5 D5:0.5 E5:0.5 F5:1.0",
                    melody_clear_2: "E5:0.5 G5:0.5 C6:2.0 -:1.0", 
                    melody_clear_3: "G5:0.5 A5:0.5 B5:1.0 C6:1.0 G5:1.0", 
                    melody_clear_4: "F5:0.5 E5:0.5 D5:1.0 C5:2.0", 
                    
                    // 修正: Padの和音をトラックごとに分離
                    pad_root_1: "C3:4.0",
                    pad_third_1: "E3:4.0",
                    pad_fifth_1: "G3:4.0",

                    pad_root_2: "C3:4.0",
                    pad_third_2: "E3:4.0",
                    pad_fifth_2: "G3:4.0",

                    pad_root_3: "G2:4.0",
                    pad_third_3: "B2:4.0",
                    pad_fifth_3: "D3:4.0",

                    pad_root_4: "G2:2.0 C3:2.0",
                    pad_third_4: "B2:2.0 E3:2.0",
                    pad_fifth_4: "F3:2.0 G3:2.0",

                    arp_clear_1: "C4:0.25 E4:0.25 G4:0.25 C5:0.25 E4:0.25 G4:0.25 C5:0.25 E5:0.25 C4:0.25 E4:0.25 G4:0.25 C5:0.25 E4:0.25 G4:0.25 C5:0.25 E5:0.25",
                    arp_clear_2: "C4:0.25 E4:0.25 G4:0.25 C5:0.25 E4:0.25 G4:0.25 C5:0.25 E5:0.25 C4:0.25 E4:0.25 G4:0.25 C5:0.25 E4:0.25 G4:0.25 C5:0.25 E5:0.25",
                    arp_clear_3: "G3:0.25 B3:0.25 D4:0.25 G4:0.25 B3:0.25 D4:0.25 G4:0.25 B4:0.25 G3:0.25 B3:0.25 D4:0.25 G4:0.25 B3:0.25 D4:0.25 G4:0.25 B4:0.25",
                    arp_clear_4: "G3:0.25 B3:0.25 D4:0.25 F4:0.25 G3:0.25 B3:0.25 D4:0.25 F4:0.25 C4:0.5 E4:0.5 G4:0.5 C5:0.5",
                    
                    silent_4: "-:4"
                },
                tracks: [
                    { synthType: 'kick', volume: 0.6, sequence: ['kick_clear', 'kick_clear', 'kick_clear', 'kick_clear'] },
                    { synthType: 'snare', volume: 0.35, sequence: ['snare_roll', 'snare_roll', 'snare_roll', 'snare_roll'] },
                    { synthType: 'hat', volume: 0.15, pan: 0.2, sequence: ['hat_clear', 'hat_clear', 'hat_clear', 'hat_clear'] },
                    { instrument: 'bass', volume: 0.25, sequence: ['bass_clear_1', 'bass_clear_2', 'bass_clear_3', 'bass_clear_4'] },
                    { instrument: 'lead', volume: 0.22, sequence: ['melody_clear_1', 'melody_clear_2', 'melody_clear_3', 'melody_clear_4'] },
                    { instrument: 'pad', volume: 0.08, sequence: ['pad_root_1', 'pad_root_2', 'pad_root_3', 'pad_root_4'] },
                    { instrument: 'pad', volume: 0.08, sequence: ['pad_third_1', 'pad_third_2', 'pad_third_3', 'pad_third_4'] },
                    { instrument: 'pad', volume: 0.08, sequence: ['pad_fifth_1', 'pad_fifth_2', 'pad_fifth_3', 'pad_fifth_4'] },
                    { synthType: 'square', volume: 0.08, filter: { type: 'lowpass', frequency: 4000, Q: 1.0 }, sequence: ['arp_clear_1', 'arp_clear_2', 'arp_clear_3', 'arp_clear_4'] }
                ]
            },
            gameOver: {
                type: 'synth',
                bpm: 100,
                loop: false,
                patterns: {
                    bass_go_1: "A1:1.0 G1:1.0 F1:1.0 E1:1.0",
                    bass_go_2: "D1:1.0 C1:1.0 B0:1.0 E1:1.0",
                    bass_go_3: "A1:4.0",
                    
                    melody_go_1: "E4:1.0 D4:1.0 C4:1.0 B3:1.0",
                    melody_go_2: "A3:1.5 C4:0.5 B3:1.0 G#3:1.0",
                    melody_go_3: "A3:4.0",

                    // 修正: 悲壮感を煽る和音(Pad)を3音分離
                    pad_root_1: "A2:4.0",
                    pad_third_1: "C3:4.0",
                    pad_fifth_1: "E3:4.0",

                    pad_root_2: "G#2:4.0",
                    pad_third_2: "B2:4.0",
                    pad_fifth_2: "E3:4.0",

                    pad_root_3: "A2:4.0",
                    pad_third_3: "C3:4.0",
                    pad_fifth_3: "E3:4.0",

                    arp_go_1: "A3:0.25 C4:0.25 E4:0.25 C4:0.25 G3:0.25 B3:0.25 D4:0.25 B3:0.25 F3:0.25 A3:0.25 C4:0.25 A3:0.25 E3:0.25 G#3:0.25 B3:0.25 G#3:0.25",
                    arp_go_2: "D3:0.25 F3:0.25 A3:0.25 F3:0.25 C3:0.25 E3:0.25 G3:0.25 E3:0.25 B2:0.25 D3:0.25 G3:0.25 D3:0.25 E3:0.25 G#3:0.25 B3:0.25 G#3:0.25",
                    arp_go_3: "A2:0.25 C3:0.25 E3:0.25 A3:0.25 C4:0.25 E4:0.25 A4:2.5"
                },
                tracks: [
                    { instrument: 'bass', volume: 0.3, sequence: ['bass_go_1', 'bass_go_2', 'bass_go_3'] },
                    { synthType: 'sine', volume: 0.25, sequence: ['melody_go_1', 'melody_go_2', 'melody_go_3'] },
                    { instrument: 'pad', volume: 0.08, sequence: ['pad_root_1', 'pad_root_2', 'pad_root_3'] },
                    { instrument: 'pad', volume: 0.08, sequence: ['pad_third_1', 'pad_third_2', 'pad_third_3'] },
                    { instrument: 'pad', volume: 0.08, sequence: ['pad_fifth_1', 'pad_fifth_2', 'pad_fifth_3'] },
                    { synthType: 'square', volume: 0.05, filter: { type: 'lowpass', frequency: 1500, Q: 1.0 }, sequence: ['arp_go_1', 'arp_go_2', 'arp_go_3'] }
                ]
            }
        }
};
