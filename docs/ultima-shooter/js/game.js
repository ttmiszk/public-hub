/**
 * @fileoverview game.js
 * メインゲームループ、状態管理(タイトル/プレイ/ポーズ/クリア)、
 * オブジェクト(自機・敵・弾・アイテム・エフェクト)の全体更新・進行管理を行う。
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
 * ゲーム全体の制御・状態管理クラス
 */
class Game {
    constructor() {
        /** @type {GameState} */
        this.state = GameState.TITLE;
        
        /** @type {Renderer} */
        this.renderer = null;
        /** @type {InputManager} */
        this.input = null;
        /** @type {CameraController} */
        this.cameraController = null;
        
        /** @type {number|null} requestAnimationFrameのID */
        this.animationFrameId = null;
        /** @type {THREE.Clock} 時間管理 */
        this.clock = new THREE.Clock();
        
        // 設定オブジェクト(GameConfig)からスクロール速度を取得
        /** @type {number} */
        this.scrollSpeed = GameConfig.game.scrollSpeed;
        
        // オブジェクトプール
        /** @type {ObjectPool|null} */
        this.bulletPool = null;
        /** @type {ObjectPool|null} */
        this.itemPool = null;
        
        // スポーナー & エフェクト管理
        /** @type {EnemySpawner|null} */
        this.enemySpawner = null;
        /** @type {EffectManager|null} */
        this.effectManager = null;
        
        // エンティティ管理
        /** @type {THREE.Object3D[]} */
        this.entities = [];
        /** @type {THREE.Object3D[]} */
        this.demoEntities = [];
        
        // 無限スクロール用背景グリッド
        /** @type {THREE.GridHelper|null} */
        this.gridHelper = null;
        
        // アクティブな弾（プレイヤー弾・敵弾共通）
        /** @type {Bullet[]} */
        this.bullets = [];
        
        // アクティブな敵機
        /** @type {Enemy[]} */
        this.enemies = [];

        // アクティブなアイテム
        /** @type {Item[]} */
        this.items = [];
        
        // プレイヤーオブジェクト
        /** @type {Player|null} */
        this.player = null;
        // デモ用ダミープレイヤー機
        /** @type {THREE.Mesh|null} */
        this.demoPlayer = null;
        
        // 動作検証用：デモ中の障害物などの流れる星々
        /** @type {THREE.Mesh[]} */
        this.demoStars = [];
        
        // ステージ管理
        /** @type {StageManager|null} */
        this.stageManager = null;
        /** @type {THREE.GridHelper[]} 洞窟の左右・天井の壁グリッド */
        this.caveWalls = [];
        /** @type {Obstacle[]} アクティブな障害物 */
        this.obstacles = [];
        /** @type {Object<string, ObjectPool>} 障害物用プール */
        this.obstaclePool = {};
        /** @type {number} 障害物スポーンタイマー */
        this.obstacleSpawnTimer = 0.0;
        /** @type {number} 空間上アイテムスポーンタイマー */
        this.itemSpawnTimer = 0.0;
        
        // ボス
        /** @type {Boss|null} */
        this.boss = null;
        this.bossActiveRatio = 0.0;
        this.lastBossActiveRatio = 0.0;
        
        // ゲームプレイ情報
        this.score = 0;
        this.highScore = 0;
        this.highScores = []; // 上位10件の配列
        this.isNewHighScore = false;
        try {
            const savedArray = localStorage.getItem('ultima_highscores');
            if (savedArray) {
                this.highScores = JSON.parse(savedArray);
            } else {
                // 旧形式からのマイグレーション
                const saved = localStorage.getItem('ultima_highscore');
                if (saved) {
                    if (saved.startsWith('{')) {
                        const data = JSON.parse(saved);
                        if (!data.name) data.name = 'NO NAME';
                        this.highScores.push(data);
                    } else {
                        this.highScores.push({
                            score: parseInt(saved, 10) || 0,
                            name: 'NO NAME',
                            date: 'UNKNOWN',
                            stage: 1,
                            loop: 1
                        });
                    }
                }
            }
            if (this.highScores.length > 0) {
                this.highScores.sort((a, b) => b.score - a.score);
                this.highScore = this.highScores[0].score;
            }
        } catch (e) {
            console.warn('Failed to load high scores from localStorage', e);
        }

        // デバッグ設定 (隠し開発パネル用)
        this.debugSettings = {
            startStage: 0,
            startLoop: 1,
            seedOverride: null,
            invincible: false,
            maxPower: false,
            instantBoss: false,
            bossKillKey: false,
            enableGamepad: true, // デフォルトは有効
            showFps: false
        };
        this.isDebugMenuOpen = false;

        // FPS計測用
        this.fpsTimer = 0.0;
        this.fpsFrameCount = 0;

        // デバッグメニュー用ゲームパッド操作状態
        this.debugFocusIndex = 0;
        this.prevDebugGamepadButtons = [];
        this.prevDebugAxes = [0, 0]; // [X, Y]

        // ポーズメニュー用ゲームパッド操作状態
        this.pauseFocusIndex = 0;
        this.prevPauseGamepadButtons = [];
        this.prevPauseAxes = [0, 0]; // [X, Y]
    }

    /**
     * ゲームの初期化
     */
    init() {
        const container = document.getElementById('game-container');
        if (!container) {
            console.error('Game container not found');
            return;
        }

        // 各種マネージャーの初期化
        this.renderer = new Renderer(container);
        this.input = new InputManager();
        this.cameraController = new CameraController(this.renderer.camera);
        
        // 弾オブジェクトプールの構築
        this.bulletPool = new ObjectPool(
            () => new Bullet(this.renderer.scene),
            (bullet, x, y, z, isEnemy, dirX, dirY, dirZ, customSpeed) => bullet.init(x, y, z, isEnemy, dirX, dirY, dirZ, customSpeed),
            50
        );

        // アイテムオブジェクトプールの構築
        this.itemPool = new ObjectPool(
            () => new Item(this.renderer.scene),
            (item, x, y, z, type, customValue) => item.init(x, y, z, type, customValue),
            15
        );

        // 敵スポーナー & エフェクト管理の初期化
        this.enemySpawner = new EnemySpawner(this);
        this.effectManager = new EffectManager(this);
        
        // ステージ管理の初期化
        this.stageManager = new StageManager(this);
        
        // 障害物プールの初期化
        const scene = this.renderer.scene;
        this.obstaclePool = {
            ROCK: new ObjectPool(
                () => new Obstacle(scene, 'ROCK'),
                (obs, x, y, z) => obs.init(x, y, z),
                12
            )
        };

        // 初期状態の設定
        this.state = GameState.TITLE;
        
        // タイトル画面用のデモシーンを構築
        this.setupTitleDemo();
        
        // UIを描画
        this.updateUI();
        
        // UIのイベント（フォーカストラップ等）を初期化
        this.initUIEvents();
        
        // デバッグメニューの初期化
        this.initDebugMenu();
        


        // メインループ開始
        this.start();
    }

    /**
     * タイトル画面用デモシーンの構築
     */
    setupTitleDemo() {
        // デモ用のダミー自機（カメラ追従用マーカーとして残すが非表示にする）
        const geo = new THREE.ConeGeometry(0.5, 2.0, 4);
        geo.rotateX(Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.demoPlayer = new THREE.Mesh(geo, mat);
        this.demoPlayer.position.set(0, 1, 0);
        this.demoPlayer.visible = false;
        this.renderer.scene.add(this.demoPlayer);
        this.demoEntities.push(this.demoPlayer);

        // デモ用の飾り：流れる星々
        const starGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (let i = 0; i < 150; i++) {
            const star = new THREE.Mesh(starGeo, starMat);
            star.position.set(
                (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * 50,
                -Math.random() * 300
            );
            this.renderer.scene.add(star);
            this.demoEntities.push(star);
            this.demoStars.push(star);
        }

        // デモ用の飾り：ゲーム中に現れる岩
        this.titleRocks = [];
        const rockGeomTypes = [
            new THREE.IcosahedronGeometry(1, 1), // 80面
            new THREE.IcosahedronGeometry(1, 2), // 320面
            new THREE.IcosahedronGeometry(1, 3)  // 1280面
        ];
        
        // プロシージャルノイズテクスチャ（バンプマップ用）の生成
        if (!window.rockNoiseTexture || !window.caveNoiseTexture) {
            const createNoise = (size, repeat) => {
                const canvas = document.createElement('canvas');
                canvas.width = size; canvas.height = size;
                const ctx = canvas.getContext('2d');
                const imgData = ctx.createImageData(size, size);
                for (let i = 0; i < imgData.data.length; i += 4) {
                    const val = Math.random() * 255;
                    imgData.data[i] = val; imgData.data[i+1] = val; imgData.data[i+2] = val;
                    imgData.data[i+3] = 255;
                }
                ctx.putImageData(imgData, 0, 0);
                const tex = new THREE.CanvasTexture(canvas);
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(repeat, repeat);
                return tex;
            };
            // 解像度を下げて引き延ばすことで、ホワイトノイズではなく「なだらかな大きな凹凸」を作る
            window.rockNoiseTexture = createNoise(32, 2); 
            window.caveNoiseTexture = createNoise(32, 4); // 岩のデコボコ感に近づけるため、解像度とリピートを下げる
        }

        for (let i = 0; i < 20; i++) {
            const rockMat = new THREE.MeshStandardMaterial({
                color: Math.random() < 0.5 ? 0x887766 : 0x666666,
                roughness: 0.9,
                metalness: 0.1,
                flatShading: true,
                bumpMap: window.rockNoiseTexture,
                bumpScale: 0.25 // 強めに設定して遠くからでも凹凸が見えるように
            });
            let rockGeo = rockGeomTypes[Math.floor(Math.random() * rockGeomTypes.length)].clone(); // cloneして変形
            
            // フラットシェーディングと頂点変形
            rockGeo = rockGeo.toNonIndexed();
            const posAttr = rockGeo.attributes.position;
            const v = new THREE.Vector3();
            const noiseMap = new Map(); // 共有頂点の割れを防ぐ
            
            for (let j = 0; j < posAttr.count; j++) {
                v.fromBufferAttribute(posAttr, j);
                const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
                let noise = noiseMap.get(key);
                if (noise === undefined) {
                    noise = 0.9 + Math.random() * 0.2; // 0.8~1.2 から 0.9~1.1 に変更して滑らかに
                    noiseMap.set(key, noise);
                }
                v.multiplyScalar(noise);
                posAttr.setXYZ(j, v.x, v.y, v.z);
            }
            rockGeo.computeVertexNormals();
            
            const rock = new THREE.Mesh(rockGeo, rockMat);
            
            // 大きさをランダムに変化させる
            const scale = 1.0 + Math.random() * 5.0;
            rock.scale.set(
                scale * (0.8 + Math.random() * 0.4),
                scale * (0.8 + Math.random() * 0.4),
                scale * (0.8 + Math.random() * 0.4)
            );
            
            rock.position.set(
                (Math.random() - 0.5) * 60,
                (Math.random() - 0.5) * 30,
                -Math.random() * 200
            );
            
            // ランダムな回転速度と岩の固有の接近速度
            rock.userData = {
                rotX: (Math.random() - 0.5) * 2.0,
                rotY: (Math.random() - 0.5) * 2.0,
                rotZ: (Math.random() - 0.5) * 2.0,
                speedZ: 10 + Math.random() * 15 // 岩はカメラ速度に加えて自前で近づく
            };
            
            this.renderer.scene.add(rock);
            this.demoEntities.push(rock);
            this.titleRocks.push(rock);
        }
    }

    /**
     * ゲームループの開始
     */
    start() {
        this.clock.getDelta(); // クロックリセット
        const loop = () => {
            this.animationFrameId = requestAnimationFrame(loop);
            this.update();
            this.render();
        };
        loop();
    }

    update() {
        let deltaTime = this.clock.getDelta();
        
        // 可変FPSの安全対策: タブがバックグラウンドに回った際などにdeltaTimeが巨大になり、
        // 衝突判定をすり抜ける（トンネリング）現象を防ぐためのキャップ処理（最大 10fps 分の遅延まで許容）
        deltaTime = Math.min(deltaTime, 0.1);
        this.lastDeltaTime = deltaTime;

        // FPS計測と表示の更新
        if (this.debugSettings.showFps) {
            this.fpsTimer += deltaTime;
            this.fpsFrameCount++;
            if (this.fpsTimer >= 0.5) {
                const fps = Math.round(this.fpsFrameCount / this.fpsTimer);
                const fpsCounter = document.getElementById('fps-counter');
                if (fpsCounter) {
                    fpsCounter.innerText = `${fps} FPS`;
                }
                this.fpsTimer = 0.0;
                this.fpsFrameCount = 0;
            }
        }

        // 入力の更新（キーボード平滑化処理等）
        if (this.input) {
            this.input.update(deltaTime);
        }

        // デバッグメニュー表示中のゲームパッド入力処理
        if (this.isDebugMenuOpen && this.input) {
            const gp = this.input.getGamepad();
            if (gp) {
                this.updateDebugMenuGamepad(gp);
            }
        }

        // ポーズメニュー表示中のゲームパッド入力処理
        if (this.state === GameState.PAUSE && this.input) {
            const gp = this.input.getGamepad();
            if (gp) {
                this.updatePauseMenuGamepad(gp);
            }
        }

        // ESCキーまたはゲームパッドのSELECTボタン押下時の挙動
        const isPausePressed = this.input && this.input.isPauseJustPressed();
        const isSelectPressed = this.input && this.input.isSelectJustPressed();
        const isEscapeJustPressed = this.input && this.input.isKeyJustPressed('Escape');

        if (this.state === GameState.TITLE) {
            // モーダルが開いている場合のESCキー等のキャンセル処理
            if (isEscapeJustPressed || isPausePressed || (this.input && this.input.isKeyJustPressed('Escape'))) {
                // Confirmモーダルが開いていればNOを押した扱いにする
                if (this.isConfirmModalOpen) {
                    const noBtn = document.getElementById('confirm-no-btn');
                    if (noBtn) noBtn.click();
                } else if (this.isRankingModalOpen) {
                    const closeBtn = document.getElementById('ranking-close-btn');
                    if (closeBtn) closeBtn.click();
                }
            }
        } else {
            if (isPausePressed) {
                if (this.state === GameState.PLAYING) {
                    // プレイ中のポーズは Escape または STARTボタンのみ (SELECTボタンは除外)
                    this.state = GameState.PAUSE;
                    if (window.audioManager) audioManager.pauseBGM();
                    this.pauseFocusIndex = 0;
                    this.prevPauseGamepadButtons = [];
                    this.prevPauseAxes = [0, 0];
                    this.updateUI();

                    // RESUMEボタンに初期フォーカスを当てる
                    setTimeout(() => {
                        const resumeBtn = document.getElementById('pause-resume-btn');
                        if (resumeBtn) resumeBtn.focus();
                    }, 50);
                } else if (this.state === GameState.PAUSE) {
                    this.state = GameState.PLAYING;
                    if (window.audioManager) audioManager.resumeBGM();
                    this.updateUI();
                }
            }
        }

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

        // 入力マネージャーのフレーム終了処理
        if (this.input) {
            this.input.postUpdate();
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
        
        // リスタート入力監視
        if (this.input.isStartJustPressed()) {
            this.startGame();
        }
    }

    /**
     * タイトル画面状態の更新
     * @param {number} deltaTime
     */
    updateTitle(deltaTime) {
        const elapsedTime = this.clock.getElapsedTime();
        
        // 星の基準速度 (カメラの移動速度)。全体を少し遅めにする
        const titleScrollSpeed = this.scrollSpeed * 1.5;

        // ダミープレイヤーの飛行アニメーション
        if (this.demoPlayer) {
            this.demoPlayer.position.y = 1.0 + Math.sin(elapsedTime * 3) * 0.3;
            this.demoPlayer.position.x = Math.cos(elapsedTime * 1.5) * 0.5;
            this.demoPlayer.rotation.z = Math.cos(elapsedTime * 1.5) * 0.2;
            
            // 自動前進スクロール (星の接近速度になる)
            this.demoPlayer.position.z -= titleScrollSpeed * deltaTime;

            // カメラ追従
            this.renderer.camera.position.x = 0;
            this.renderer.camera.position.y = 5.0;
            this.renderer.camera.position.z = this.demoPlayer.position.z + 18.0;
            this.renderer.camera.lookAt(0, 1.0, this.demoPlayer.position.z - 20.0);
        }

        // 流れる星々・岩の再配置と更新
        if (this.demoPlayer) {
            for (let star of this.demoStars) {
                if (star.position.z > this.demoPlayer.position.z + 20) {
                    star.position.z = this.demoPlayer.position.z - 200 - Math.random() * 100;
                    star.position.x = (Math.random() - 0.5) * 100;
                    star.position.y = (Math.random() - 0.5) * 50;
                }
            }
            
            if (this.titleRocks) {
                for (let rock of this.titleRocks) {
                    // 回転
                    rock.rotation.x += rock.userData.rotX * deltaTime;
                    rock.rotation.y += rock.userData.rotY * deltaTime;
                    rock.rotation.z += rock.userData.rotZ * deltaTime;
                    
                    // 岩自体もカメラに向かって前進させる (星よりも速く近づく)
                    rock.position.z += rock.userData.speedZ * deltaTime;
                    
                    if (rock.position.z > this.demoPlayer.position.z + 20) {
                        rock.position.z = this.demoPlayer.position.z - 200 - Math.random() * 100;
                        rock.position.x = (Math.random() - 0.5) * 80;
                        rock.position.y = (Math.random() - 0.5) * 40;
                    }
                }
            }
        }

        // ゲームパッドのSTART(9)ボタンでのみゲーム開始を許可 (デバッグメニュー非表示時)
        const gp = this.input.getGamepad();
        const gpStartJust = gp && gp.buttons[9]?.pressed && !this.input.prevGamepadButtons[9];
        
        if (gpStartJust && !this.isDebugMenuOpen) {
            this.startGame();
        }

        // タイトル画面用のゲームパッドフォーカス処理
        if (this.input && !this.isDebugMenuOpen) {
            this.updateTitleMenuGamepad(gp);
        }
    }

    /**
     * タイトル画面のゲームパッド操作 (フォーカス移動)
     * @param {Gamepad} gp 
     */
    updateTitleMenuGamepad(gp) {
        if (!gp) return;
        const buttons = gp.buttons.map(b => b.pressed);
        const axes = [gp.axes[0], gp.axes[1]];
        
        let goUp = (buttons[12] && (!this.prevTitleGamepadButtons || !this.prevTitleGamepadButtons[12])) || 
                   (axes[1] < -0.5 && (!this.prevTitleAxes || this.prevTitleAxes[1] >= -0.5));
        let goDown = (buttons[13] && (!this.prevTitleGamepadButtons || !this.prevTitleGamepadButtons[13])) || 
                     (axes[1] > 0.5 && (!this.prevTitleAxes || this.prevTitleAxes[1] <= 0.5));
        let goLeft = (buttons[14] && (!this.prevTitleGamepadButtons || !this.prevTitleGamepadButtons[14])) ||
                     (axes[0] < -0.5 && (!this.prevTitleAxes || this.prevTitleAxes[0] >= -0.5));
        let goRight = (buttons[15] && (!this.prevTitleGamepadButtons || !this.prevTitleGamepadButtons[15])) ||
                      (axes[0] > 0.5 && (!this.prevTitleAxes || this.prevTitleAxes[0] <= 0.5));

        let moveFocus = goUp || goDown || goLeft || goRight;
        
        let aJust = buttons[0] && (!this.prevTitleGamepadButtons || !this.prevTitleGamepadButtons[0]);
        let bJust = buttons[1] && (!this.prevTitleGamepadButtons || !this.prevTitleGamepadButtons[1]);

        if (this.isConfirmModalOpen) {
            const yesBtn = document.getElementById('confirm-yes-btn');
            const noBtn = document.getElementById('confirm-no-btn');
            const focusable = [yesBtn, noBtn].filter(b => b);
            
            if (moveFocus && focusable.length > 0) {
                const idx = focusable.indexOf(document.activeElement);
                if (idx !== -1) {
                    focusable[(idx + 1) % focusable.length].focus();
                } else {
                    noBtn.focus();
                }
            }
            if (aJust && document.activeElement) {
                if (focusable.includes(document.activeElement)) document.activeElement.click();
            } else if (bJust && noBtn) {
                noBtn.click();
            }
        } else if (this.isRankingModalOpen) {
            const closeBtn = document.getElementById('ranking-close-btn');
            const clearBtn = document.getElementById('ranking-clear-btn');
            const focusable = [closeBtn, clearBtn].filter(b => b);

            if (moveFocus && focusable.length > 0) {
                const idx = focusable.indexOf(document.activeElement);
                if (idx !== -1) {
                    focusable[(idx + 1) % focusable.length].focus();
                } else {
                    closeBtn.focus();
                }
            }
            if (aJust && document.activeElement) {
                if (focusable.includes(document.activeElement)) document.activeElement.click();
            } else if (bJust && closeBtn) {
                closeBtn.click();
            }
        } else {
            // 通常のタイトル画面
            const startBtn = document.getElementById('title-start-btn');
            const rankingBtn = document.getElementById('title-ranking-btn');
            const debugBtn = document.getElementById('title-debug-btn');
            const focusable = [startBtn, rankingBtn, debugBtn].filter(b => b);

            if (moveFocus && focusable.length > 0) {
                const idx = focusable.indexOf(document.activeElement);
                if (idx !== -1) {
                    const step = (goUp || goLeft) ? -1 : 1;
                    const nextIdx = (idx + step + focusable.length) % focusable.length;
                    focusable[nextIdx].focus();
                } else {
                    focusable[0].focus();
                }
            }
            if (aJust && document.activeElement) {
                if (focusable.includes(document.activeElement)) {
                    document.activeElement.click();
                } else if (startBtn) {
                    startBtn.click();
                }
            }
        }
        
        this.prevTitleGamepadButtons = buttons;
        this.prevTitleAxes = axes;
    }

    /**
     * ゲームオーバー状態の更新
     * @param {number} deltaTime
     */
    updateGameOver(deltaTime) {
        // ゲームオーバー中も洞窟、敵、障害物、アイテム、弾、カメラの更新を裏で維持する
        this.updatePlaying(deltaTime);

        // ゲームパッド入力処理
        if (this.input) {
            const gp = this.input.getGamepad();
            if (gp) {
                this.updateGameOverMenuGamepad(gp);
            }
        }
    }

    /**
     * ゲーム開始処理
     */
    startGame() {
        
        // BGMの停止（実際の再生はstageManagerのapplyStageThemeが行う）
        if (window.audioManager) {
            audioManager.stopBGM();
        }
        
        // デバッグ設定の適用（シード値上書き）
        if (this.debugSettings.seedOverride !== null) {
            const targetStageIdx = this.debugSettings.startStage;
            const targetStage = GameConfig.stages[targetStageIdx];
            if (targetStage && targetStage.cave) {
                targetStage.cave.seed = this.debugSettings.seedOverride;
            }
        }
        
        // 既存の敵や弾、アイテムを即時クリーンアップ
        this.clearActiveEntities();
        
        // 画面フェードを外す
        const fadeEl = document.getElementById('screen-fade');
        if (fadeEl) {
            fadeEl.classList.remove('active');
        }

        this.state = GameState.PLAYING;
        this.score = 0; 
        this.isNewHighScore = false;
        this.scrollSpeed = GameConfig.game.scrollSpeed; 
        
        // クロックのリセット
        this.clock.start();
        
        this.clearTitleDemo();
        this.setupGameScene();
        
        // ステージ管理の初期化（テーマ適用およびステージタイトルの表示）
        if (this.stageManager) {
            this.stageManager.init();
        }
        
        this.updateUI();
    }

    /**
     * 稼働中の敵・弾・アイテム・障害物・ボスの全クリーンアップ
     */
    clearActiveEntities() {
        // 敵
        if (this.enemySpawner) {
            for (let enemy of this.enemies) {
                this.enemySpawner.releaseEnemy(enemy);
            }
        }
        this.enemies = [];

        // 弾
        if (this.bulletPool) {
            for (let bullet of this.bullets) {
                bullet.deactivate();
                this.bulletPool.release(bullet);
            }
        }
        this.bullets = [];

        // アイテム
        if (this.itemPool) {
            for (let item of this.items) {
                item.deactivate();
                this.itemPool.release(item);
            }
        }
        this.items = [];
        
        // 障害物
        if (this.obstaclePool) {
            for (let obs of this.obstacles) {
                obs.deactivate();
                this.obstaclePool[obs.type].release(obs);
            }
        }
        this.obstacles = [];
        this.obstacleSpawnTimer = 0.0;
        this.itemSpawnTimer = 0.0;
        
        // ボス
        if (this.boss) {
            this.boss.destroy();
            this.boss = null;
        }

        // エフェクト
        if (this.effectManager) {
            this.effectManager.clearAll();
        }
    }

    /**
     * デモ用オブジェクトのクリーンアップ
     */
    clearTitleDemo() {
        for (let ent of this.demoEntities) {
            this.renderer.scene.remove(ent);
            if (ent.geometry) ent.geometry.dispose();
            if (ent.material) {
                if (Array.isArray(ent.material)) {
                    ent.material.forEach(m => m.dispose());
                } else {
                    ent.material.dispose();
                }
            }
        }
        this.demoEntities = [];
        this.demoPlayer = null;
        this.demoStars = [];
        this.titleRocks = [];
    }

    /**
     * ゲームプレイ用シーンの構築
     */
    setupGameScene() {
        this.clearGridHelper();
        this.clearCaveWalls();

        // プレイヤー機を生成
        if (this.player) {
            this.player.destroy();
        }
        this.player = new Player(this);

        // デバッグ設定の適用（プレイヤー側）
        if (this.debugSettings.invincible) {
            this.player.isDebugInvincible = true;
        }
        if (this.debugSettings.maxPower) {
            this.player.powerLevel = GameConfig.player.maxPowerLevel;
        }

        // カメラターゲット登録
        if (this.cameraController) {
            this.cameraController.isDyingMode = false;
        }
        this.cameraController.setTarget(this.player.mesh);

        // ゲーム開始時の進行速度を確実に設定する
        this.scrollSpeed = GameConfig.game.scrollSpeed;
    }

    /**
     * プレイヤーの弾（ショット）を生成する
     * @param {number} x - 発生位置のX座標
     * @param {number} y - 発生位置のY座標
     * @param {number} z - 発生位置のZ座標
     * @param {number} [dirX=0] - 進行方向のX成分
     * @param {number} [dirY=0] - 進行方向のY成分
     * @param {number} [dirZ=-1] - 進行方向のZ成分
     * @param {number|null} [customSpeed=null] - カスタム速度（nullの場合は設定値を使用）
     */
    spawnPlayerBullet(x, y, z, dirX = 0, dirY = 0, dirZ = -1, customSpeed = null) {
        if (!this.bulletPool) return;
        const bullet = this.bulletPool.obtain(x, y, z, false, dirX, dirY, dirZ, customSpeed);
        this.bullets.push(bullet);
    }

    /**
     * 敵の弾を生成する
     * @param {number} x - 発生位置のX座標
     * @param {number} y - 発生位置のY座標
     * @param {number} z - 発生位置のZ座標
     * @param {number} [dirX=0] - 進行方向のX成分
     * @param {number} [dirY=0] - 進行方向のY成分
     * @param {number} [dirZ=1] - 進行方向のZ成分
     * @param {number|null} [customSpeed=null] - カスタム速度（nullの場合は設定値を使用）
     */
    spawnEnemyBullet(x, y, z, dirX = 0, dirY = 0, dirZ = 1, customSpeed = null) {
        if (!this.bulletPool) return;
        const bullet = this.bulletPool.obtain(x, y, z, true, dirX, dirY, dirZ, customSpeed);
        this.bullets.push(bullet);
    }

    /**
     * アイテムを生成する (敵撃破ドロップ用: POWERUPのみ)
     * @param {number} x - 発生位置のX座標
     * @param {number} y - 発生位置のY座標
     * @param {number} z - 発生位置のZ座標
     */
    spawnItem(x, y, z) {
        if (!this.itemPool) return;
        const item = this.itemPool.obtain(x, y, z, 'POWERUP');
        this.items.push(item);
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

        let playerX = 0.0, playerY = 1.0, playerZ = 0.0;
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
        const cameraZ = (this.renderer && this.renderer.camera) ? this.renderer.camera.position.z : (playerZ + 13.0);
        
        const activePlayer = (this.player && this.player.mesh) ? this.player :
            { mesh: { position: playerPos }, life: 0, ammo: 0, powerLevel: 1, state: 'DEAD' };

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
                this.bossDefeatedTimer = (this.bossDefeatedTimer || 0.0) + deltaTime;
            }
        }

        if (this.player && this.player.mesh) {
            this.player.update(deltaTime, gameDeltaTime);
        }

        this.updateCaveWalls(playerZ);

        const currentStage = this.stageManager ? this.stageManager.getCurrentStage() : null;
        this._updateBossActiveRatio(deltaTime, currentStage);

        if (this.enemySpawner) {
            this.enemySpawner.update(gameDeltaTime, playerZ);
        }

        this._updateEnemies(gameDeltaTime, activePlayer, cameraZ);

        if (currentStage) {
            this._updateObstacles(gameDeltaTime, playerZ, cameraZ, currentStage);
            this._updateItemSpawning(deltaTime);
        }

        if (this.boss && this.boss.active) {
            this._updateBoss(gameDeltaTime, playerPos);
        }

        this._updateItems(deltaTime, playerPos, cameraZ);
        this._updateBullets(deltaTime, cameraZ);
        this._checkDebugShortcuts();

        if (this.player && this.player.mesh && this.player.state === 'ALIVE') {
            this.checkCollisions();
        }

        if (this.effectManager) {
            this.effectManager.update(deltaTime, playerPos);
        }

        this.cameraController.update(gameDeltaTime, this.scrollSpeed, currentStage, this.bossActiveRatio);

        if (this.renderer) {
            this.renderer.followPlayerZ(playerZ);
        }
    }

    _updateBossActiveRatio(deltaTime, currentStage) {
        if ((this.boss && this.boss.active) || (this.stageManager && this.stageManager.state === 'TRANSITION')) {
            this.bossActiveRatio = Math.min(1.0, this.bossActiveRatio + deltaTime / 3.0);
        } else {
            this.bossActiveRatio = 0.0;
        }

        if (this.bossActiveRatio !== this.lastBossActiveRatio) {
            if (this.caveWalls instanceof Map) {
                for (let segment of this.caveWalls.values()) {
                    segment.updatePositions(currentStage, this.bossActiveRatio);
                }
            }
            this.lastBossActiveRatio = this.bossActiveRatio;
        }
    }

    _updateEnemies(gameDeltaTime, activePlayer, cameraZ) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(gameDeltaTime, activePlayer, this);

            // 更新中に破棄された敵を即座にプールへ戻す。
            if (!enemy.mesh) {
                this.enemySpawner.releaseEnemy(enemy);
                const lastEnemy = this.enemies.pop();
                if (i < this.enemies.length) this.enemies[i] = lastEnemy;
                continue;
            }
            
            if (enemy.mesh.position.z > cameraZ + 5.0 || !enemy.active) {
                this.enemySpawner.releaseEnemy(enemy);
                const last_enemies = this.enemies.pop();
                if (i < this.enemies.length) this.enemies[i] = last_enemies;
            }
        }
    }

    _updateObstacles(gameDeltaTime, playerZ, cameraZ, currentStage) {
        if (this.stageManager.state === 'PLAYING') {
            this.obstacleSpawnTimer += gameDeltaTime;
            const interval = (currentStage.obstacles && currentStage.obstacles.spawnInterval) !== undefined ?
                             currentStage.obstacles.spawnInterval : 2.5;
            if (this.obstacleSpawnTimer >= interval) {
                this.obstacleSpawnTimer = 0.0;
                this.spawnRandomObstacle();
            }
        }

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.update(gameDeltaTime, playerZ, this.scrollSpeed);
            
            if (obs.mesh.position.z > cameraZ + 5.0 || !obs.active) {
                obs.deactivate();
                this.obstaclePool[obs.type].release(obs);
                const last_obstacles = this.obstacles.pop();
                if (i < this.obstacles.length) this.obstacles[i] = last_obstacles;
            }
        }
    }

    _updateItemSpawning(deltaTime) {
        this.itemSpawnTimer += deltaTime;
        let itemInterval = GameConfig.items.spawnInterval;
        let shouldSpawn = true;
        
        if (this.stageManager && this.stageManager.state === 'TRANSITION') {
            const timeSinceDefeat = this.bossDefeatedTimer || 0.0;
            if (timeSinceDefeat < 3.0) {
                shouldSpawn = false;
            } else if (timeSinceDefeat < 8.0) {
                itemInterval = 0.4;
            } else {
                shouldSpawn = false;
            }
        }
        
        if (shouldSpawn && this.itemSpawnTimer >= itemInterval) {
            this.itemSpawnTimer = 0.0;
            this.spawnRandomItem();
        }
    }

    _updateBoss(gameDeltaTime, playerPos) {
        this.boss.update(gameDeltaTime, playerPos, this);
            
        if (this.boss.state === 'DEFEATED') {
            if (Math.random() < 0.6) {
                const offset = new THREE.Vector3(
                    (Math.random() - 0.5) * 12.0,
                    (Math.random() - 0.5) * 8.0,
                    (Math.random() - 0.5) * 6.0
                );
                const p = this.boss.mesh.position.clone().add(offset);
                const colors = [0xffffff, 0xffbb00, 0xff3333];
                if (this.boss.stageIndex !== 2) colors.push(this.boss.color);
                const randColor = colors[Math.floor(Math.random() * colors.length)];
                this.effectManager.spawnExplosion(p.x, p.y, p.z, randColor, 20, false);
            }
        }
        this.updateBossHPBar();
    }

    _updateItems(deltaTime, playerPos, cameraZ) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            item.update(deltaTime, playerPos);
            
            if (item.mesh.position.z > cameraZ + 5.0 || !item.active) {
                item.deactivate();
                this.itemPool.release(item);
                const last_items = this.items.pop();
                if (i < this.items.length) this.items[i] = last_items;
            }
        }
    }

    _updateBullets(deltaTime, cameraZ) {
        const maxDist = GameConfig.bullet.maxDistance;
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (!bullet) continue;
            bullet.update(deltaTime, this.scrollSpeed);
            
            const dist = Math.abs(bullet.mesh.position.z - cameraZ);
            if (dist > maxDist || !bullet.active) {
                bullet.deactivate();
                this.bulletPool.release(bullet);
                const last_bullets = this.bullets.pop();
                if (i < this.bullets.length) this.bullets[i] = last_bullets;
            }
        }
    }

    _checkDebugShortcuts() {
        if (this.player) {
            if (this.input.isKeyJustPressed && this.input.isKeyJustPressed('KeyL')) {
                if (this.stageManager) this.stageManager.clearStage();
            }
            if (this.debugSettings.bossKillKey && this.input.isKeyJustPressed && this.input.isKeyJustPressed('KeyK')) {
                if (this.boss && this.boss.active && this.boss.state === 'BATTLE') {
                    this.damageBoss(this.boss.hp);
                }
            }
        }
    }

    /**
     * 簡易球当たり判定 (BoundingSphere)
     */
    checkCollisions() {
        if (!this.player || this.player.state !== 'ALIVE') return;

        this._checkPlayerBulletsHits();
        this._checkEnemyBulletsHits();
        this._checkPlayerVsEnemies();
        this._checkPlayerVsObstacles();
        this._checkItemPickups();
    }

    _checkSphereCollision(pos1, r1, pos2, r2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        const rSum = r1 + r2;
        return (dx * dx + dy * dy + dz * dz) < (rSum * rSum);
    }

    _checkPlayerBulletsHits() {
        const bossActive = (this.boss && this.boss.active && this.boss.state === 'BATTLE');
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (!bullet || bullet.isEnemy || !bullet.active) continue; 
            
            const bulletPos = bullet.mesh.position;
            let hit = false;

            // vs 敵機
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                if (!enemy.active) continue;

                if (this._checkSphereCollision(bulletPos, bullet.hitRadius, enemy.mesh.position, enemy.hitRadius)) {
                    hit = true;
                    this._handleEnemyDestroyed(enemy, j, bulletPos);
                    break; 
                }
            }

            // vs ボス
            if (!hit && bossActive) {
                if (this._checkSphereCollision(bulletPos, bullet.hitRadius, this.boss.mesh.position, this.boss.hitRadius)) {
                    hit = true;
                    this.damageBoss(1);
                }
            }

            // vs 障害物
            if (!hit) {
                for (let obs of this.obstacles) {
                    if (!obs.active) continue;

                    if (this._checkSphereCollision(bulletPos, bullet.hitRadius, obs.mesh.position, obs.hitRadius)) {
                        hit = true;
                        const bulletColor = bullet.mesh.material.color.getHex();
                        this.effectManager.spawnExplosion(bulletPos.x, bulletPos.y, bulletPos.z, bulletColor, 8, false);
                        if (window.audioManager) audioManager.play('bulletHitRock');
                        break;
                    }
                }
            }

            if (hit) {
                bullet.deactivate();
                this.bulletPool.release(bullet);
                const last_bullets = this.bullets.pop();
                if (i < this.bullets.length) this.bullets[i] = last_bullets;
            }
        }
    }

    _handleEnemyDestroyed(enemy, enemyIndex, bulletPos) {
        const isDestroyed = enemy.damage(1);
        if (isDestroyed) {
            if (window.audioManager) audioManager.play('enemyExplode');
            this.effectManager.spawnExplosion(enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z, enemy.color, 12, false);
            this.score += enemy.score;
            if (this.stageManager) this.stageManager.addEnemyKill(enemy.type);
            
            if (Math.random() < GameConfig.items.dropChance) {
                this.spawnItem(enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z);
            }

            this.enemySpawner.releaseEnemy(enemy);
            const last_enemies = this.enemies.pop();
            if (enemyIndex < this.enemies.length) this.enemies[enemyIndex] = last_enemies;
            
            this.updateUI();
        } else {
            if (window.audioManager) audioManager.play('enemyHit');
            this.effectManager.spawnExplosion(bulletPos.x, bulletPos.y, bulletPos.z, 0xffaa00, 3, false);
        }
    }

    _checkEnemyBulletsHits() {
        const player = this.player;
        if (player.isInvincible) return;

        const playerPos = player.mesh.position;
        const playerRadius = GameConfig.player.hitRadius;

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (!bullet || !bullet.isEnemy || !bullet.active) continue; 
            
            if (this._checkSphereCollision(bullet.mesh.position, bullet.hitRadius, playerPos, playerRadius)) {
                bullet.deactivate();
                this.bulletPool.release(bullet);
                const last_bullets = this.bullets.pop();
                if (i < this.bullets.length) this.bullets[i] = last_bullets;

                player.damage(GameConfig.enemyBullet.damage, 'hit');
                this.effectManager.spawnExplosion(playerPos.x, playerPos.y, playerPos.z, 0xff3300, 8, false);
                this.triggerHUDFlash('life-val', 'hud-flash-score'); 
                break; 
            }
        }

        // ボス極太ビーム
        if (this.boss && this.boss.active && this.boss.isFiringBeam) {
            const bossPos = this.boss.mesh.position;
            if (playerPos.z > bossPos.z && playerPos.z < bossPos.z + 180.0) {
                let hit = false;
                const ratio = Math.min(1.0, Math.max(0.0, (playerPos.z - bossPos.z) / 75.0));
                const currentCenterX = bossPos.x + (this.boss.beamTargetX - bossPos.x) * ratio;
                const currentCenterY = bossPos.y + (this.boss.beamTargetY - bossPos.y) * ratio;

                if (this.boss.stageIndex === 0) {
                    const dx = playerPos.x - currentCenterX;
                    const dy = playerPos.y - currentCenterY;
                    if (dx * dx + dy * dy < 3.5 * 3.5) hit = true;
                }
                else if (this.boss.stageIndex === 1) {
                    const theta = this.boss.mesh.rotation.z;
                    const cosT = Math.cos(theta);
                    const sinT = Math.sin(theta);
                    
                    const leftBeamX = currentCenterX + (-5.5 * cosT);
                    const leftBeamY = currentCenterY + (-5.5 * sinT);
                    const rightBeamX = currentCenterX + (5.5 * cosT);
                    const rightBeamY = currentCenterY + (5.5 * sinT);
                    
                    const dxLeft = playerPos.x - leftBeamX;
                    const dyLeft = playerPos.y - leftBeamY;
                    const dxRight = playerPos.x - rightBeamX;
                    const dyRight = playerPos.y - rightBeamY;
                    
                    if (dxLeft * dxLeft + dyLeft * dyLeft < 9.0 || dxRight * dxRight + dyRight * dyRight < 9.0) hit = true;
                }
                else if (this.boss.stageIndex === 2) {
                    const dx = playerPos.x - currentCenterX;
                    const dy = playerPos.y - currentCenterY;
                    if (dx * dx + dy * dy < 4.8 * 4.8) hit = true;
                }

                if (hit) {
                    player.damage(30, 'hit');
                    this.triggerHUDFlash('life-val', 'hud-flash-score');
                }
            }
        }
    }

    _checkPlayerVsEnemies() {
        const player = this.player;
        // バリアを持たない無敵状態（被弾後の点滅）は当たり判定をスキップ
        if (player.isInvincible && !player.hasBarrier) return;

        const playerPos = player.mesh.position;
        // バリア展開中は当たり判定を少し広くする（球体バリアに合わせて半径2.5とする）
        const playerRadius = player.hasBarrier ? 2.5 : GameConfig.player.hitRadius;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (!enemy.active) continue;

            if (this._checkSphereCollision(enemy.mesh.position, enemy.hitRadius, playerPos, playerRadius)) {
                // バリア展開中の場合は、敵を体当たりで撃破
                if (player.hasBarrier) {
                    this._handleEnemyDestroyed(enemy, i, enemy.mesh.position);
                    continue; // プレイヤーはダメージを受けない
                }

                // 通常の被弾処理
                this.effectManager.spawnExplosion(enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z, enemy.color, 12, false);
                this.score += enemy.score;
                this.enemySpawner.releaseEnemy(enemy);
                const last_enemies = this.enemies.pop();
                if (i < this.enemies.length) this.enemies[i] = last_enemies;

                player.damage(GameConfig.player.collisionDamage, 'collision');
                this.effectManager.spawnExplosion(playerPos.x, playerPos.y, playerPos.z, 0xff5500, 10, false);
                this.triggerHUDFlash('life-val', 'hud-flash-score'); 

                this.updateUI();
                break;
            }
        }
    }

    _checkPlayerVsObstacles() {
        const player = this.player;
        // バリアを持たない無敵状態、またはバリア展開中は障害物判定をスキップ（すり抜ける）
        if (player.isInvincible) return;

        const playerPos = player.mesh.position;
        const playerRadius = GameConfig.player.hitRadius;

        for (let obs of this.obstacles) {
            if (!obs.active) continue;

            if (this._checkSphereCollision(obs.mesh.position, obs.hitRadius, playerPos, playerRadius)) {
                player.damage(obs.damage, 'collision');
                this.effectManager.spawnExplosion(playerPos.x, playerPos.y, playerPos.z, 0xff5500, 12, false);
                this.triggerHUDFlash('life-val', 'hud-flash-score');
                break;
            }
        }
    }

    _checkItemPickups() {
        const player = this.player;
        const playerPos = player.mesh.position;
        const playerRadius = GameConfig.player.hitRadius;

        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            if (!item.active) continue;

            if (this._checkSphereCollision(item.mesh.position, item.hitRadius, playerPos, playerRadius)) {
                const config = GameConfig.items.types[item.type];
                
                if (window.audioManager) audioManager.play('itemPickup');
                player.flash(config.color);

                if (item.type === 'BULLET') {
                    player.addAmmo(item.value);
                    this.updateUI();
                    this.triggerHUDFlash('ammo-val', 'hud-flash-ammo');
                } else if (item.type === 'HEAL') {
                    player.heal(item.value);
                    this.updateUI();
                    this.triggerHUDFlash('life-val', 'hud-flash-life');
                } else if (item.type === 'POWERUP') {
                    player.powerUp();
                    this.updateUI();
                    this.triggerHUDFlash('power-val', 'hud-flash-power');
                } else if (item.type === 'BARRIER') {
                    const duration = config.duration || 5.0;
                    player.activateBarrier(duration);
                    // UIがないので自機のフラッシュ演出だけで対応するが、効果音は既存のものを使用
                }

                this.effectManager.spawnExplosion(item.mesh.position.x, item.mesh.position.y, item.mesh.position.z, config.color, 15, true);

                item.deactivate();
                this.itemPool.release(item);
                const last_items = this.items.pop();
                if (i < this.items.length) this.items[i] = last_items;
            }
        }
    }

    /**
     * アイテム獲得時にHUD数値をフラッシュ・拡大表示させる演出
     * @param {string} elementId - 対象のHTML ID
     * @param {string} className - 付与するCSSクラス名
     */
    triggerHUDFlash(elementId, className) {
        const el = document.getElementById(elementId);
        if (!el) return;
        
        el.classList.remove(className);
        void el.offsetWidth; // リフロー
        
        el.classList.add(className);
        
        setTimeout(() => {
            if (el) el.classList.remove(className);
        }, 200);
    }

    /**
     * ゲームオーバー移行処理
     */
    handleGameOver() {
        
        // プレイ中BGMの停止＆ゲームオーバージングルの再生
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

        // ランキング入り判定
        this.isEnteringName = this.isScoreInTop10();
        this.isNewHighScore = this.score > this.highScore && this.isScoreRecordable();
        if (this.isNewHighScore) {
            this.highScore = this.score; // メモリ上の最高スコア表示用のみ更新
        }

        this.updateUI();

        // ゲームオーバー画面での操作状態の初期化
        this.gameoverFocusIndex = 0;
        this.prevGameoverGamepadButtons = [];
        this.prevGameoverAxes = [0, 0];

        // 初期フォーカス設定
        setTimeout(() => {
            if (this.isEnteringName) {
                const inputEl = document.getElementById('highscore-name-input');
                if (inputEl) inputEl.focus();
            } else {
                const restartBtn = document.getElementById('gameover-restart-btn');
                if (restartBtn) restartBtn.focus();
            }
        }, 50);
    }

    /**
     * 現在のスコアがトップ10にランクインするかどうか判定
     */
    isScoreInTop10() {
        if (!this.isScoreRecordable()) return false;
        if (this.score <= 0) return false;
        if (this.highScores.length < 10) return true;
        return this.score > this.highScores[this.highScores.length - 1].score;
    }

    /**
     * 描画処理
     * @param {number} [deltaTime]
     */
    render(deltaTime) {
        if (this.renderer) {
            const dt = deltaTime !== undefined ? deltaTime : (this.lastDeltaTime || 0.016);
            this.renderer.render(dt);
        }
    }

    /**
     * UI（HUD・タイトル・ポーズ・ゲームオーバーオーバーレイ）の更新
     */
    updateUI() {
        // プレイ中の現在のスコアが過去のトップスコアを超えた場合のメモリ上の表示更新用
        if (this.score > this.highScore && this.isScoreRecordable()) {
            this.highScore = this.score;
        }

        const uiContainer = document.getElementById('ui-container');
        if (!uiContainer) return;

        // アクティブ要素を記録
        const activeId = document.activeElement ? document.activeElement.id : null;

        if (this.state === GameState.TITLE) {
            let highscoreHtml = `HI-SCORE <span>${this.padZero(this.highScore, 6)}</span>`;
            uiContainer.innerHTML = `
                <div id="title-overlay" class="ui-overlay">
                    <div class="title-logo">ULTIMA SHOOTER</div>
                    <div class="title-version"></div>
                    <div class="title-highscore">${highscoreHtml}</div>
                    <div class="title-buttons">
                        <button id="title-start-btn" class="title-btn focused">START</button>
                        <button id="title-ranking-btn" class="title-btn">RANKING</button>
                    </div>
                    <div class="title-footer">
                        <div class="title-copyright"></div>
                        <button id="title-debug-btn" class="debug-btn" style="min-width: 120px; padding: 8px;">⚙ DEBUG PANEL</button>
                    </div>
                </div>
            `;
            // タイトル画面用のイベントとフォーカス処理を登録
            this.bindTitleUIEvents();
        } 
        else if (this.state === GameState.PLAYING || this.state === GameState.GAMEOVER || this.state === GameState.PAUSE) {
            // PLAYING, GAMEOVER, または PAUSE 時は、プレイ中のHUD情報を生成して表示
            const life = this.player ? this.player.life : 0;
            const maxLife = this.player ? (this.player.maxLife || 100) : 100;
            const lifePct = Math.max(0, Math.min(100, (life / maxLife) * 100));

            const ammo = this.player ? this.player.ammo : 0;
            const maxAmmo = 999; // 弾数の最大値
            const ammoPct = Math.max(0, Math.min(100, (ammo / maxAmmo) * 100));

            const power = this.player ? this.player.powerLevel : 1;
            const stageNum = this.stageManager ? this.stageManager.getCurrentStage().number : 1;
            const killPoints = this.stageManager ? this.stageManager.stageKillPoints : 0;
            const reqPoints = this.stageManager ? this.stageManager.getScaledRequiredKillPoints() : 150;
            const loopCount = this.stageManager ? this.stageManager.loopCount : 1;
            // 2周目以降は STAGE ラベルに (LOOP N) を追加し、高さを固定する
            const stageLabel = loopCount > 1 ? `STAGE (LOOP ${loopCount})` : 'STAGE';
            
            let html = `
                <div class="game-hud">
                    <div class="hud-item">${stageLabel} <span class="hud-value" style="color:#00f0ff; font-weight:900;">0${stageNum}</span></div>
                    <div class="hud-item">POINT <span class="hud-value" id="point-val" style="color:#ffd700; font-weight:900;">${killPoints} / ${reqPoints}</span></div>
                    <div class="hud-item">SCORE <span class="hud-value" id="score-val">${this.padZero(this.score, 6)}</span></div>
                    
                    <div class="hud-item bar-type">
                        <div class="hud-label-row">
                            <span>LIFE</span>
                            <span class="hud-value" id="life-val">${life}</span>
                        </div>
                        <div class="hud-bar-bg">
                            <div id="life-bar" class="hud-bar-fill life" style="width: ${lifePct}%;"></div>
                        </div>
                    </div>
                    
                    <div class="hud-item bar-type">
                        <div class="hud-label-row">
                            <span>AMMO</span>
                            <span class="hud-value" id="ammo-val">${ammo}</span>
                        </div>
                        <div class="hud-bar-bg">
                            <div id="ammo-bar" class="hud-bar-fill ammo" style="width: ${ammoPct}%;"></div>
                        </div>
                    </div>
                    
                    <div class="hud-item">POWER <span class="hud-value" id="power-val">Lv.${power}</span></div>
            `;
            
            if (this.boss && this.bossHUDVisible) {
                const bossHpPct = Math.max(0, (this.boss.hp / this.boss.maxHp) * 100);
                html += `
                    <div class="hud-item bar-type" style="margin-top: 10px; border-top: 1px solid rgba(255,50,50,0.3); padding-top: 10px;">
                        <div class="hud-label-row">
                            <span style="color: #ff3333; text-shadow: 0 0 5px red;">BOSS</span>
                            <span class="hud-value" style="color: #ff3333;">${this.boss.name}</span>
                        </div>
                        <div class="hud-bar-bg" style="border-color: rgba(255,50,50,0.5); box-shadow: 0 0 10px rgba(255,0,0,0.3);">
                            <div id="boss-hp-bar" class="hud-bar-fill" style="width: ${bossHpPct}%; background: linear-gradient(90deg, #ff0000, #ff8800); box-shadow: 0 0 10px #ff0000;"></div>
                        </div>
                    </div>
                `;
            }

            html += `
                </div>
            `;
            
            // PAUSE の場合はさらにオーバーレイを重ねる
            if (this.state === GameState.PAUSE) {
                html += `
                    <div class="ui-overlay">
                        <div class="glass-panel" style="width: 320px; display: flex; flex-direction: column; align-items: center; gap: 20px;">
                            <div class="panel-title pause" style="margin-bottom: 0;">PAUSE</div>
                            <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
                                <button id="pause-resume-btn" class="pause-btn">RESUME</button>
                                <button id="pause-exit-btn" class="pause-btn">EXIT</button>
                            </div>
                        </div>
                    </div>
                `;
            }

            // GAMEOVER の場合もオーバーレイを重ねる
            if (this.state === GameState.GAMEOVER) {
                let innerContent = '';
                if (this.isEnteringName) {
                    innerContent = `
                        <div class="highscore-name-input-container">
                            <div class="highscore-congrats">RANK IN TOP 10!</div>
                            <input type="text" id="highscore-name-input" class="highscore-name-input" maxlength="10" placeholder="YOUR NAME">
                            <button id="highscore-submit-btn" class="highscore-submit-btn">REGISTER</button>
                        </div>
                    `;
                } else {
                    innerContent = `
                        <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
                            <button id="gameover-restart-btn" class="gameover-btn">RESTART</button>
                            <button id="gameover-exit-btn" class="gameover-btn">EXIT</button>
                        </div>
                    `;
                }

                html += `
                    <div class="ui-overlay">
                        <div class="glass-panel" style="width: 320px; display: flex; flex-direction: column; align-items: center; gap: 20px;">
                            <div class="panel-title gameover" style="margin-bottom: 0;">GAME OVER</div>
                            <div class="panel-score" style="margin-bottom: 10px;">FINAL SCORE: ${this.padZero(this.score, 6)}</div>
                            ${this.isNewHighScore ? `<div class="panel-score blinking" style="margin-bottom: 0; font-size: 24px; color: #ffd700;">NEW HIGH SCORE!</div>` : ''}
                            ${innerContent}
                        </div>
                    </div>
                `;
            }

            uiContainer.innerHTML = html;

            // アクティブだった要素のフォーカスを復元
            if (activeId && (!this.isEnteringName || activeId !== 'gameover-restart-btn')) {
                const el = document.getElementById(activeId);
                if (el) el.focus();
            }

            // PAUSE状態の場合はボタンにイベントリスナーを登録
            if (this.state === GameState.PAUSE) {
                const resumeBtn = document.getElementById('pause-resume-btn');
                const exitBtn = document.getElementById('pause-exit-btn');

                if (resumeBtn) {
                    resumeBtn.addEventListener('click', () => {
                        this.state = GameState.PLAYING;
                        if (window.audioManager) audioManager.resumeBGM();
                        this.updateUI();
                    });
                }
                if (exitBtn) {
                    exitBtn.addEventListener('click', () => {
                        this.exitToTitle();
                    });
                }
            }

            // GAMEOVER状態の場合はボタンにイベントリスナーを登録
            if (this.state === GameState.GAMEOVER) {
                if (this.isEnteringName) {
                    const submitBtn = document.getElementById('highscore-submit-btn');
                    const inputEl = document.getElementById('highscore-name-input');
                    if (submitBtn && inputEl) {
                        const registerScore = () => {
                            let name = inputEl.value.trim().toUpperCase();
                            if (!name) name = 'NO NAME';
                            
                            const now = new Date();
                            const year = now.getFullYear();
                            const month = this.padZero(now.getMonth() + 1, 2);
                            const day = this.padZero(now.getDate(), 2);
                            const hours = this.padZero(now.getHours(), 2);
                            const minutes = this.padZero(now.getMinutes(), 2);
                            const seconds = this.padZero(now.getSeconds(), 2);
                            const dateStr = `${year}.${month}.${day} - ${hours}:${minutes}:${seconds}`;
                            const stageNum = this.stageManager ? this.stageManager.getCurrentStage().number : 1;
                            const loopCount = this.stageManager ? this.stageManager.loopCount : 1;
                            
                            this.highScores.push({
                                score: this.score,
                                name: name,
                                date: dateStr,
                                stage: stageNum,
                                loop: loopCount
                            });
                            
                            // ソートして10件に切り詰め
                            this.highScores.sort((a, b) => b.score - a.score);
                            if (this.highScores.length > 10) {
                                this.highScores = this.highScores.slice(0, 10);
                            }
                            
                            try {
                                localStorage.setItem('ultima_highscores', JSON.stringify(this.highScores));
                            } catch (e) {}

                            this.isEnteringName = false;
                            this.updateUI();
                            
                            // 登録後はRESTARTへフォーカス
                            setTimeout(() => {
                                const restartBtn = document.getElementById('gameover-restart-btn');
                                if (restartBtn) restartBtn.focus();
                            }, 50);
                        };
                        
                        submitBtn.addEventListener('click', registerScore);
                        inputEl.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                registerScore();
                            }
                        });
                    }
                } else {
                    const restartBtn = document.getElementById('gameover-restart-btn');
                    const exitBtn = document.getElementById('gameover-exit-btn');

                    if (restartBtn) {
                        restartBtn.addEventListener('click', () => {
                            this.startGame();
                        });
                    }
                    if (exitBtn) {
                        exitBtn.addEventListener('click', () => {
                            this.exitToTitle();
                        });
                    }
                }
            }
        }
        else if (this.state === GameState.CLEAR) {
            // 周回継続中は stageManager の _showLoopContinuePanel() が UI を務めるため、
            // ここでは何も表示しない。GAMEOVERと同様のリスタート指示も不要。
            uiContainer.innerHTML = '';
        }
    }

    /**
     * スコアなどの桁合わせ用ヘルパー
     */
    padZero(num, size) {
        let s = num + "";
        while (s.length < size) s = "0" + s;
        return s;
    }

    /**
     * 背景グリッドヘルパーの完全削除
     */
    clearGridHelper() {
        if (this.gridHelper) {
            this.renderer.scene.remove(this.gridHelper);
            if (this.gridHelper.geometry) this.gridHelper.geometry.dispose();
            if (this.gridHelper.material) {
                if (Array.isArray(this.gridHelper.material)) {
                    this.gridHelper.material.forEach(m => m.dispose());
                } else {
                    this.gridHelper.material.dispose();
                }
            }
            this.gridHelper = null;
        }
    }

    /**
     * 洞窟用壁セグメントの初期構築
     */
    setupCaveWalls() {
        this.clearCaveWalls();
        
        const stage = this.stageManager ? this.stageManager.getCurrentStage() : null;
        if (!stage) return;
        
        this.caveWallMaterial = new THREE.MeshStandardMaterial({
            color: stage.theme.wallColor,
            vertexColors: true,
            roughness: 0.9,
            metalness: 0.1,
            flatShading: true,
            side: THREE.DoubleSide,
            bumpMap: window.caveNoiseTexture,
            bumpScale: 0.35
        });
        
        this.caveGridMaterial = new THREE.LineBasicMaterial({
            color: stage.theme.gridColor,
            transparent: true,
            opacity: 0.15 // 立体感が見えるようになったのでグリッドは控えめに
        });
        
        const playerZ = this.player ? this.player.mesh.position.z : 0;
        this.updateCaveWalls(playerZ);
    }

    /**
     * 洞窟用壁セグメントの破棄
     */
    clearCaveWalls() {
        if (this.caveWalls instanceof Map) {
            for (let segment of this.caveWalls.values()) {
                segment.destroy();
            }
            this.caveWalls.clear();
        } else {
            this.caveWalls = new Map();
        }
        
        if (this.caveWallMaterial) {
            this.caveWallMaterial.dispose();
            this.caveWallMaterial = null;
        }
        if (this.caveGridMaterial) {
            this.caveGridMaterial.dispose();
            this.caveGridMaterial = null;
        }
    }

    /**
     * 洞窟壁セグメントの動的生成・更新
     * @param {number} playerZ - 自機のZ座標
     */
    updateCaveWalls(playerZ) {
        const stage = this.stageManager ? this.stageManager.getCurrentStage() : null;
        if (!stage) return;
        
        const segmentLength = 15.0;
        const currentIdx = Math.floor(Math.abs(playerZ) / segmentLength);
        const cameraZ = (this.renderer && this.renderer.camera) ? this.renderer.camera.position.z : playerZ;
        const cameraIdx = Math.floor(Math.abs(cameraZ) / segmentLength);
        
        // カメラの後方 3 セグメント、プレイヤーの前方 22 セグメントを表示
        const startIdx = Math.max(0, cameraIdx - 3);
        const endIdx = currentIdx + 22;
        
        if (!(this.caveWalls instanceof Map)) {
            this.caveWalls = new Map();
        }
        
        // マテリアルが未作成なら復旧
        if (!this.caveWallMaterial) {
            this.caveWallMaterial = new THREE.MeshStandardMaterial({
                color: stage.theme.wallColor,
                vertexColors: true,
                roughness: 0.9,
                metalness: 0.1,
                flatShading: true,
                side: THREE.DoubleSide,
                bumpMap: window.caveNoiseTexture,
                bumpScale: 0.35
            });
        }
        if (!this.caveGridMaterial) {
            this.caveGridMaterial = new THREE.LineBasicMaterial({
                color: stage.theme.gridColor,
                transparent: true,
                opacity: 0.15
            });
        }
        
        // 範囲外のセグメントを削除
        for (let [idx, segment] of this.caveWalls.entries()) {
            if (idx < startIdx || idx > endIdx) {
                segment.destroy();
                this.caveWalls.delete(idx);
            }
        }
        
        // 必要なセグメントを追加
        for (let idx = startIdx; idx <= endIdx; idx++) {
            if (!this.caveWalls.has(idx)) {
                const segment = new CaveSegment(
                    this.renderer.scene,
                    idx,
                    stage,
                    this.caveWallMaterial,
                    this.caveGridMaterial,
                    this.bossActiveRatio
                );
                this.caveWalls.set(idx, segment);
            }
        }
    }

    /**
     * ゲームの破棄・クリーンアップ
     */
    destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        this.clearTitleDemo();
        this.clearActiveEntities();
        this.clearGridHelper();
        
        if (this.enemySpawner) {
            this.enemySpawner.destroy();
            this.enemySpawner = null;
        }

        if (this.bulletPool) {
            for (let b of this.bulletPool.pool) {
                b.destroy();
            }
            this.bulletPool = null;
        }

        if (this.itemPool) {
            for (let it of this.itemPool.pool) {
                it.destroy();
            }
            this.itemPool = null;
        }

        if (this.effectManager) {
            this.effectManager.destroy();
            this.effectManager = null;
        }

        if (this.player) {
            this.player.destroy();
            this.player = null;
        }

        for (let ent of this.entities) {
            this.renderer.scene.remove(ent);
            if (ent.geometry) ent.geometry.dispose();
            if (ent.material) {
                if (Array.isArray(ent.material)) {
                    ent.material.forEach(m => m.dispose());
                } else {
                    ent.material.dispose();
                }
            }
        }
        this.entities = [];
    }

    /**
     * 空間上へのランダムなアイテム（HEAL/BULLET）の生成
     */
    spawnRandomItem() {
        if (!this.player || !this.itemPool) return;
        
        // 空間上の出現判定
        const rand = Math.random();
        let type = null;
        
        let bulletChance = GameConfig.items.spawnChance.BULLET;
        let healChance = GameConfig.items.spawnChance.HEAL;
        
        // ボス撃破後のボーナスタイム中（演出終了後の5秒間）はアイテム出現率を100%にする（BULLET: 0.6, HEAL: 0.4）
        if (this.stageManager && this.stageManager.state === 'TRANSITION') {
            const timeSinceDefeat = this.bossDefeatedTimer || 0.0;
            if (timeSinceDefeat >= 3.0 && timeSinceDefeat < 8.0) {
                bulletChance = 0.6;
                healChance = 0.4;
            }
        }
        
        if (rand < bulletChance) {
            type = 'BULLET';
        } else if (rand < bulletChance + healChance) {
            type = 'HEAL';
        } else {
            // BULLET と HEAL に漏れた場合（残り5%の確率で BARRIER）
            const barrierChance = GameConfig.items.spawnChance.BARRIER;
            if (rand < bulletChance + healChance + barrierChance) {
                type = 'BARRIER';
            }
        }
        
        // 出現なしの場合は何もしない
        if (!type) return;
        
        const playerZ = this.player.mesh.position.z;
        // プレイヤーの前方から出現（目の前にすぐ現れるよう調整）
        const spawnZ = playerZ - 60.0;
        
        // 洞窟の境界内でめり込まないランダム座標を計算
        const stage = this.stageManager ? this.stageManager.getCurrentStage() : null;
        const bounds = getCaveBoundsAt(spawnZ, stage);
        
        // マージン考慮
        const margin = GameConfig.items.hitRadius * 0.5;
        const a = Math.max(0.1, bounds.width / 2 - margin);
        const b_h = Math.max(0.1, bounds.height / 2 - margin);
        
        let spawnX, spawnY;
        
        // 洞窟の十分な広さがある場合はランダムに配置、狭すぎる場合は洞窟の中心に直接生成してスキップを防ぐ
        if (a > 0.5 && b_h > 0.5) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.sqrt(Math.random());
            spawnX = bounds.centerX + a * radius * Math.cos(angle);
            spawnY = bounds.centerY + b_h * radius * Math.sin(angle);
        } else {
            spawnX = bounds.centerX;
            spawnY = bounds.centerY;
        }
        
        // BULLET/HEALの場合は個別値をランダム選択
        let itemValue = null;
        if (type === 'BULLET') {
            const values = GameConfig.items.types.BULLET.bulletValues;
            itemValue = values[Math.floor(Math.random() * values.length)];
        } else if (type === 'HEAL') {
            const values = GameConfig.items.types.HEAL.healValues;
            itemValue = values[Math.floor(Math.random() * values.length)];
        }
        
        const item = this.itemPool.obtain(spawnX, spawnY, spawnZ, type, itemValue);
        this.items.push(item);
    }

    /**
     * 弾切れ時の「NO AMMO」警告表示処理
     */
    triggerNoAmmoWarning() {
        // すでに警告が表示中なら重複させない
        if (document.getElementById('no-ammo-warning')) return;

        const warning = document.createElement('div');
        warning.id = 'no-ammo-warning';
        warning.className = 'no-ammo-warning';
        warning.innerText = 'NO AMMO';
        
        const uiContainer = document.getElementById('ui-container');
        if (uiContainer) {
            uiContainer.appendChild(warning);
            
            // アニメーション終了（1.0秒）後に自動で削除
            setTimeout(() => {
                if (warning.parentNode) {
                    warning.parentNode.removeChild(warning);
                }
            }, 1000);
        }
    }

    /**
     * ランダムな障害物（浮遊岩）の生成
     */
    spawnRandomObstacle() {
        if (!this.player || !this.obstaclePool) return;
        const playerZ = this.player.mesh.position.z;
        // プレイヤーの視界外前方（敵の120マスよりもさらに遠くの180マス前方から出現させる）
        const spawnZ = playerZ - 180.0;
        
        const pool = this.obstaclePool.ROCK;
        if (pool) {
            const obs = pool.obtain(0, 0, spawnZ);
            this.obstacles.push(obs);
        }
    }



    /**
     * ボス敵の出現処理
     * @param {number} stageIndex
     */
    spawnBoss(stageIndex) {
        if (this.boss) {
            this.boss.destroy();
        }

        const playerZ = this.player ? this.player.mesh.position.z : 0;
        const spawnZ = playerZ - 250.0; // プレイヤーの遥か前方（フォグの奥深く）に出現
        const spawnY = GameConfig.player.limitYMin + 4.0;

        this.bossActiveRatio = 0.0;
        this.lastBossActiveRatio = 0.0;

        this.boss = new Boss(this.renderer.scene, stageIndex);
        this.boss.init(0, spawnY, spawnZ);

        // 周回難易度係数をボスパラメータに適用（1周目は全て係数=1.0）
        if (this.stageManager) {
            const scale = this.stageManager.getDifficultyScale();
            const ls = GameConfig.loopSystem;
            if (ls.applyBossHp && scale !== 1.0) {
                this.boss.maxHp = Math.round(this.boss.maxHp * scale);
                this.boss.hp = this.boss.maxHp;
            }
            if (ls.applyBossMoveSpeed && scale !== 1.0) {
                this.boss.moveSpeedX = (GameConfig.bosses.types[stageIndex].moveSpeedX || 4.5) * scale;
                this.boss.moveSpeedY = (GameConfig.bosses.types[stageIndex].moveSpeedY || 2.5) * scale;
            }
            if (ls.applyBossBulletSpeed && scale !== 1.0) {
                this.boss.bulletSpeed = (GameConfig.bosses.types[stageIndex].bulletSpeed || 10.5) * scale;
            }
        }

        this.showBossHUD();
    }

    /**
     * ボスへの被弾ダメージ適用
     * @param {number} amount
     */
    damageBoss(amount) {
        if (!this.boss || !this.boss.active) return;

        const isDefeated = this.boss.damage(amount);

        // 火花エフェクト
        const bPos = this.boss.mesh.position;
        this.effectManager.spawnExplosion(bPos.x, bPos.y, bPos.z + 2.5, 0xffbb00, 4, false);

        this.updateBossHPBar();

        if (isDefeated) {
            // ボス撃破・大爆発効果音
            if (window.audioManager) {
                audioManager.play('bossExplode');
            }
            this.triggerBossDefeated();
        } else {
            // ボス被弾効果音
            if (window.audioManager) {
                audioManager.play('bossHit');
            }
        }
    }

    /**
     * ボス撃破時の処理
     */
    triggerBossDefeated() {
        this.score += this.boss.score;
        this.updateUI();
        
        // ボス撃破後のタイマーを初期化
        this.bossDefeatedTimer = 0.0;

        const bPos = this.boss.mesh.position;
        
        // 大爆発エフェクト (ステージ3ボスの場合は紫の代わりにオレンジを使用)
        const expColor = (this.boss.stageIndex === 2) ? 0xffbb00 : this.boss.color;
        this.effectManager.spawnExplosion(bPos.x, bPos.y, bPos.z, expColor, 32, false);

        // ボス撃破の瞬間に、画面上にあるすべての敵の弾を消去する
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (!bullet) continue;
            if (bullet.isEnemy) {
                bullet.deactivate();
                this.bulletPool.release(bullet);
                const last_bullets = this.bullets.pop();
                if (i < this.bullets.length) this.bullets[i] = last_bullets;
            }
        }

        // ボス撃破の瞬間に、画面上にあるすべての雑魚敵（enemies）も消去する
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.deactivate();
            this.enemySpawner.releaseEnemy(enemy);
            const last_enemies = this.enemies.pop();
            if (i < this.enemies.length) this.enemies[i] = last_enemies;
        }

        // ボスHUDの隠蔽
        this.hideBossHUD();

        // 撃破後のスローモーション演出（スクロール速度を大幅に一時低下）
        this.scrollSpeed = GameConfig.game.scrollSpeed * 0.12;

        if (this.stageManager) {
            this.stageManager.onBossDefeated();
        }
    }

    /**
     * ボスHPゲージHUDの表示
     * ボス戦中は常に画面上部中央に表示。
     * boss-hudはHTMLに静的配置済みなので、クラスの付け外しだけで制御する。
     */
    showBossHUD() {
        if (!this.boss) return;
        this.bossHUDVisible = true;
        this.updateUI();
    }

    /**
     * ボスHPゲージHUDの非表示（ボス擃滅時）
     */
    hideBossHUD() {
        this.bossHUDVisible = false;
        this.updateUI();
    }

    /**
     * ボスHPバーの割合更新
     */
    updateBossHPBar() {
        if (!this.boss) return;
        const pct = Math.max(0, (this.boss.hp / this.boss.maxHp) * 100);
        const bar = document.getElementById('boss-hp-bar');
        if (bar) {
            bar.style.width = `${pct}%`;
        }
    }

    /**
     * UIコンテナ向けのイベント初期化 (フォーカストラップ等)
     */
    initUIEvents() {
        const uiContainer = document.getElementById('ui-container');
        if (!uiContainer) return;

        // キーボード操作のフォーカストラップ (Tabループ)
        uiContainer.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                let focusableElements = [];
                if (this.state === GameState.PAUSE) {
                    focusableElements = [
                        document.getElementById('pause-resume-btn'),
                        document.getElementById('pause-exit-btn')
                    ].filter(el => el !== null);
                } else if (this.state === GameState.GAMEOVER) {
                    focusableElements = [
                        document.getElementById('gameover-restart-btn'),
                        document.getElementById('gameover-exit-btn')
                    ].filter(el => el !== null);
                }

                if (focusableElements.length === 0) return;

                const firstEl = focusableElements[0];
                const lastEl = focusableElements[focusableElements.length - 1];

                if (e.shiftKey) {
                    // Shift + Tab のとき、最初の要素から最後の要素へループ
                    if (document.activeElement === firstEl) {
                        lastEl.focus();
                        e.preventDefault();
                    }
                } else {
                    // Tab のとき、最後の要素から最初の要素へループ
                    if (document.activeElement === lastEl) {
                        firstEl.focus();
                        e.preventDefault();
                    }
                }
            }
        });
    }

    /**
     * 隠しデバッグメニューの初期化
     */
    initDebugMenu() {
        const debugMenu = document.getElementById('debug-menu');
        const closeBtn = document.getElementById('debug-close-btn');
        const resetBtn = document.getElementById('debug-reset-btn');
        const clearHighScoreBtn = document.getElementById('debug-clear-highscore-btn');
        
        if (!debugMenu || !closeBtn || !resetBtn) return;
        
        // 閉じるボタンのイベント
        closeBtn.addEventListener('click', () => {
            this.toggleDebugMenu(false);
        });

        // リセットボタンのイベント
        resetBtn.addEventListener('click', () => {
            this.resetDebugSettings();
        });

        // ハイスコアクリアボタンのイベント
        if (clearHighScoreBtn) {
            clearHighScoreBtn.addEventListener('click', () => {
                localStorage.removeItem('ultima_highscore');
                this.highScore = 0;
                this.highScoreData = null;
                if (this.state === GameState.TITLE) {
                    this.updateUI();
                }
            });
        }

        // プレースホルダーの初期値設定
        const seedInput = document.getElementById('debug-seed');
        if (this.stageManager && seedInput) {
            const currentStage = this.stageManager.getCurrentStage();
            if (currentStage && currentStage.cave) {
                seedInput.placeholder = `Default (${currentStage.cave.seed})`;
            }
        }

        // 初期設定をUIに反映
        const stageSelect = document.getElementById('debug-stage');
        if (stageSelect) {
            stageSelect.value = this.debugSettings.startStage.toString();
        }
        
        // ステージ切り替え時にデフォルトシードのプレースホルダーを更新する
        if (stageSelect && seedInput) {
            stageSelect.addEventListener('change', () => {
                const stageIdx = parseInt(stageSelect.value, 10);
                const stageConfig = GameConfig.stages[stageIdx];
                if (stageConfig && stageConfig.cave) {
                    seedInput.placeholder = `Default (${stageConfig.cave.seed})`;
                }
            });
        }

        // 各項目のリアルタイム反映用イベントリスナーの登録
        const inputs = [
            'debug-stage',
            'debug-loop',
            'debug-seed',
            'debug-invincible',
            'debug-maxpower',
            'debug-instantboss',
            'debug-bosskill-key',
            'debug-gamepad',
            'debug-fps'
        ];

        inputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                const eventType = (element.tagName === 'INPUT' && (element.type === 'number' || element.type === 'text')) ? 'input' : 'change';
                element.addEventListener(eventType, () => {
                    this.applyDebugSettings();
                });
            }
        });

        // キーボード操作のフォーカストラップ (Tabループ)
        debugMenu.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                const focusableElements = [
                    document.getElementById('debug-stage'),
                    document.getElementById('debug-loop'),
                    document.getElementById('debug-seed'),
                    document.getElementById('debug-invincible'),
                    document.getElementById('debug-maxpower'),
                    document.getElementById('debug-instantboss'),
                    document.getElementById('debug-bosskill-key'),
                    document.getElementById('debug-gamepad'),
                    document.getElementById('debug-fps'),
                    document.getElementById('debug-reset-btn'),
                    document.getElementById('debug-close-btn')
                ].filter(el => el !== null);

                if (focusableElements.length === 0) return;

                const firstEl = focusableElements[0];
                const lastEl = focusableElements[focusableElements.length - 1];

                if (e.shiftKey) {
                    // Shift + Tab のとき、最初の要素から最後の要素へループ
                    if (document.activeElement === firstEl) {
                        lastEl.focus();
                        e.preventDefault();
                    }
                } else {
                    // Tab のとき、最後の要素から最初の要素へループ
                    if (document.activeElement === lastEl) {
                        firstEl.focus();
                        e.preventDefault();
                    }
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.toggleDebugMenu(false);
            }
        });
    }

    /**
     * デバッグ設定を初期状態にリセットする
     */
    resetDebugSettings() {
        this.debugSettings = {
            startStage: 0,
            startLoop: 1,
            seedOverride: null,
            invincible: false,
            maxPower: false,
            instantBoss: false,
            bossKillKey: false,
            enableGamepad: true,
            showFps: false
        };

        // UIに再同期
        const stageSelect = document.getElementById('debug-stage');
        const loopInput = document.getElementById('debug-loop');
        const seedInput = document.getElementById('debug-seed');
        const invincibleChk = document.getElementById('debug-invincible');
        const maxpowerChk = document.getElementById('debug-maxpower');
        const instantbossChk = document.getElementById('debug-instantboss');
        const bosskillkeyChk = document.getElementById('debug-bosskill-key');
        const gamepadChk = document.getElementById('debug-gamepad');
        const fpsChk = document.getElementById('debug-fps');

        if (stageSelect) stageSelect.value = this.debugSettings.startStage.toString();
        if (loopInput) loopInput.value = this.debugSettings.startLoop.toString();
        if (seedInput) seedInput.value = '';
        if (invincibleChk) invincibleChk.checked = this.debugSettings.invincible;
        if (maxpowerChk) maxpowerChk.checked = this.debugSettings.maxPower;
        if (instantbossChk) instantbossChk.checked = this.debugSettings.instantBoss;
        if (bosskillkeyChk) bosskillkeyChk.checked = this.debugSettings.bossKillKey;
        if (gamepadChk) gamepadChk.checked = true;
        if (fpsChk) fpsChk.checked = false;

        this.updateDebugWarning();

        // プレースホルダーの更新
        if (seedInput) {
            const stageIdx = this.debugSettings.startStage;
            const stageConfig = GameConfig.stages[stageIdx];
            if (stageConfig && stageConfig.cave) {
                seedInput.placeholder = `Default (${stageConfig.cave.seed})`;
            }
        }

        // ゲーム側に適用
        this.applyDebugSettings();
    }

    /**
     * デバッグメニューの表示・非表示トグル
     * @param {boolean|null} forceState - 強制する状態
     */
    toggleDebugMenu(forceState = null) {
        const debugMenu = document.getElementById('debug-menu');
        if (!debugMenu) return;

        if (forceState !== null) {
            this.isDebugMenuOpen = forceState;
        } else {
            this.isDebugMenuOpen = !this.isDebugMenuOpen;
        }

        if (this.isDebugMenuOpen) {
            debugMenu.classList.remove('hidden');
            
            // 開いたときにゲームパッド操作用のフォーカスインデックスを初期化
            this.debugFocusIndex = 0;
            this.prevDebugGamepadButtons = [];
            this.prevDebugAxes = [0, 0];

            // 開いたときに現在の設定値をUIに再同期
            const stageSelect = document.getElementById('debug-stage');
            const loopInput = document.getElementById('debug-loop');
            const seedInput = document.getElementById('debug-seed');
            const invincibleChk = document.getElementById('debug-invincible');
            const maxpowerChk = document.getElementById('debug-maxpower');
            const instantbossChk = document.getElementById('debug-instantboss');
            const bosskillkeyChk = document.getElementById('debug-bosskill-key');
            const gamepadChk = document.getElementById('debug-gamepad');
            const fpsChk = document.getElementById('debug-fps');

            if (stageSelect) stageSelect.value = this.debugSettings.startStage.toString();
            if (loopInput) loopInput.value = this.debugSettings.startLoop.toString();
            if (seedInput) seedInput.value = this.debugSettings.seedOverride !== null ? this.debugSettings.seedOverride.toString() : '';
            if (invincibleChk) invincibleChk.checked = this.debugSettings.invincible;
            if (maxpowerChk) maxpowerChk.checked = this.debugSettings.maxPower;
            if (instantbossChk) instantbossChk.checked = this.debugSettings.instantBoss;
            if (bosskillkeyChk) bosskillkeyChk.checked = this.debugSettings.bossKillKey;
            if (gamepadChk) gamepadChk.checked = this.debugSettings.enableGamepad;
            if (fpsChk) fpsChk.checked = this.debugSettings.showFps;

            this.updateDebugWarning();

            // 最初の要素にフォーカスをあてる
            if (stageSelect) {
                stageSelect.focus();
            }
        } else {
            debugMenu.classList.add('hidden');
        }
    }

    /**
     * UIの入力値をゲーム内のデバッグ設定に適用する
     */
    applyDebugSettings() {
        const stageSelect = document.getElementById('debug-stage');
        const loopInput = document.getElementById('debug-loop');
        const seedInput = document.getElementById('debug-seed');
        const invincibleChk = document.getElementById('debug-invincible');
        const maxpowerChk = document.getElementById('debug-maxpower');
        const instantbossChk = document.getElementById('debug-instantboss');
        const bosskillkeyChk = document.getElementById('debug-bosskill-key');
        const gamepadChk = document.getElementById('debug-gamepad');
        const fpsChk = document.getElementById('debug-fps');

        if (stageSelect) {
            this.debugSettings.startStage = parseInt(stageSelect.value, 10);
        }
        if (loopInput && loopInput.value !== '') {
            this.debugSettings.startLoop = Math.max(1, parseInt(loopInput.value, 10));
        }
        if (seedInput && seedInput.value !== '') {
            this.debugSettings.seedOverride = parseInt(seedInput.value, 10);
        } else {
            this.debugSettings.seedOverride = null;
        }
        if (invincibleChk) {
            this.debugSettings.invincible = invincibleChk.checked;
        }
        if (maxpowerChk) {
            this.debugSettings.maxPower = maxpowerChk.checked;
        }
        if (instantbossChk) {
            this.debugSettings.instantBoss = instantbossChk.checked;
        }
        if (bosskillkeyChk) {
            this.debugSettings.bossKillKey = bosskillkeyChk.checked;
        }
        if (gamepadChk) {
            this.debugSettings.enableGamepad = gamepadChk.checked;
        }
        if (fpsChk) {
            this.debugSettings.showFps = fpsChk.checked;
            const fpsCounter = document.getElementById('fps-counter');
            if (fpsCounter) {
                if (this.debugSettings.showFps) {
                    fpsCounter.classList.remove('hidden');
                } else {
                    fpsCounter.classList.add('hidden');
                    fpsCounter.innerText = '';
                }
            }
        }

        
        // プレイ中の場合は即座にフラグや周回数を適用
        if (this.stageManager) {
            this.stageManager.loopCount = this.debugSettings.startLoop;
        }
        if (this.state === GameState.PLAYING && this.player) {
            this.player.isDebugInvincible = this.debugSettings.invincible;
            if (this.debugSettings.maxPower) {
                this.player.powerLevel = GameConfig.player.maxPowerLevel;
            }
        }
        
        this.updateDebugWarning();
        
        this.updateUI();
    }

    /**
     * ハイスコアが記録可能かどうか（チート無効状態か）を判定する
     */
    isScoreRecordable() {
        return !(this.debugSettings.invincible || 
                 this.debugSettings.maxPower || 
                 this.debugSettings.instantBoss || 
                 this.debugSettings.bossKillKey);
    }

    /**
     * デバッグ設定に応じて警告メッセージの表示を更新する
     */
    updateDebugWarning() {
        const warningEl = document.getElementById('debug-score-warning');
        if (warningEl) {
            if (!this.isScoreRecordable()) {
                warningEl.style.display = 'inline';
            } else {
                warningEl.style.display = 'none';
            }
        }
    }

    bindTitleUIEvents() {
        // キーボードのTab移動でもfocusedクラスを同期させるため、
        // 実際のフォーカス移動時にクラスをつけかえる
        const startBtn = document.getElementById('title-start-btn');
        const rankingBtn = document.getElementById('title-ranking-btn');
        
        const updateFocusClass = (focusedId) => {
            if (startBtn) startBtn.classList.toggle('focused', startBtn.id === focusedId);
            if (rankingBtn) rankingBtn.classList.toggle('focused', rankingBtn.id === focusedId);
            const debugBtn = document.getElementById('title-debug-btn');
            if (debugBtn) debugBtn.classList.toggle('focused', debugBtn.id === focusedId);
        };

        if (startBtn) {
            startBtn.addEventListener('focus', () => updateFocusClass('title-start-btn'));
            startBtn.addEventListener('click', () => {
                if (!this.isDebugMenuOpen && !this.isRankingModalOpen && !this.isConfirmModalOpen) this.startGame();
            });
            // 初期フォーカス設定
            setTimeout(() => {
                if (this.state === GameState.TITLE && !this.isDebugMenuOpen && !this.isRankingModalOpen && !this.isConfirmModalOpen) {
                    startBtn.focus();
                }
            }, 50);
        }
        if (rankingBtn) {
            rankingBtn.addEventListener('focus', () => updateFocusClass('title-ranking-btn'));
            rankingBtn.addEventListener('click', () => {
                if (!this.isDebugMenuOpen && !this.isRankingModalOpen && !this.isConfirmModalOpen) this.openRankingModal();
            });
        }
        
        const debugBtn = document.getElementById('title-debug-btn');
        if (debugBtn) {
            debugBtn.addEventListener('focus', () => updateFocusClass('title-debug-btn'));
            debugBtn.addEventListener('click', () => {
                if (!this.isRankingModalOpen && !this.isConfirmModalOpen) this.toggleDebugMenu();
            });
        }

        // キーボード操作でのループ移動フック
        const titleButtonsContainer = document.querySelector('.ui-overlay');
        if (titleButtonsContainer) {
            titleButtonsContainer.addEventListener('keydown', (e) => {
                if (this.isDebugMenuOpen || this.isRankingModalOpen || this.isConfirmModalOpen) return;

                if (e.key === 'Tab') {
                    e.preventDefault(); // デフォルトのタブ移動を無効化
                    
                    const focusable = [startBtn, rankingBtn, debugBtn].filter(b => b);
                    const idx = focusable.indexOf(document.activeElement);
                    if (idx !== -1) {
                        const nextIdx = e.shiftKey ? (idx - 1 + focusable.length) % focusable.length : (idx + 1) % focusable.length;
                        focusable[nextIdx].focus();
                    } else if (focusable.length > 0) {
                        focusable[0].focus();
                    }
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const focusable = [startBtn, rankingBtn, debugBtn].filter(b => b);
                    const idx = focusable.indexOf(document.activeElement);
                    if (idx !== -1) {
                        const nextIdx = e.key === 'ArrowUp' ? (idx - 1 + focusable.length) % focusable.length : (idx + 1) % focusable.length;
                        focusable[nextIdx].focus();
                    } else if (focusable.length > 0) {
                        focusable[0].focus();
                    }
                }
            });
        }

    }

    openRankingModal() {
        const modal = document.getElementById('ranking-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        this.isRankingModalOpen = true;
        this.updateRankingTable();
        
        const closeBtn = document.getElementById('ranking-close-btn');
        const clearBtn = document.getElementById('ranking-clear-btn');
        
        // CLOSEボタンに初期フォーカス
        setTimeout(() => {
            if (closeBtn) closeBtn.focus();
        }, 50);
        
        // Tab移動のループ対応
        const handleRankingKeydown = (e) => {
            if (this.isConfirmModalOpen) return;
            if (e.key === 'Tab') {
                e.preventDefault();
                if (document.activeElement === closeBtn) {
                    if (clearBtn) clearBtn.focus();
                } else {
                    if (closeBtn) closeBtn.focus();
                }
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                if (document.activeElement === closeBtn) {
                    if (clearBtn) clearBtn.focus();
                } else {
                    if (closeBtn) closeBtn.focus();
                }
            }
        };
        
        modal.addEventListener('keydown', handleRankingKeydown);

        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.classList.add('hidden');
                modal.removeEventListener('keydown', handleRankingKeydown);
                this.isRankingModalOpen = false;
                const startBtn = document.getElementById('title-start-btn');
                if (startBtn) startBtn.focus();
            };
        }
        if (clearBtn) {
            clearBtn.onclick = () => {
                this.showConfirm(
                    "Are you sure you want to clear all high scores?",
                    () => {
                        this.highScores = [];
                        this.highScore = 0;
                        localStorage.removeItem('ultima_highscores');
                        localStorage.removeItem('ultima_highscore');
                        this.updateRankingTable();
                        this.updateUI(); // メモリ上の最高スコア表示等を更新
                        if (closeBtn) closeBtn.focus();
                    },
                    () => {
                        // NOの場合はクリアボタンにフォーカスを戻す
                        if (clearBtn) clearBtn.focus();
                    }
                );
            };
        }
    }

    /**
     * 汎用確認モーダルの表示
     * @param {string} message - 確認メッセージ
     * @param {function} onYes - YESが押された時のコールバック
     * @param {function} onNo - NOが押された時のコールバック
     */
    showConfirm(message, onYes, onNo) {
        const modal = document.getElementById('confirm-modal');
        const msgEl = document.getElementById('confirm-message');
        const yesBtn = document.getElementById('confirm-yes-btn');
        const noBtn = document.getElementById('confirm-no-btn');
        
        if (!modal || !msgEl || !yesBtn || !noBtn) return;
        
        msgEl.innerText = message;
        modal.classList.remove('hidden');
        this.isConfirmModalOpen = true;
        
        setTimeout(() => {
            noBtn.focus(); // デフォルトはNO
        }, 50);
        
        const closeConfirm = () => {
            modal.classList.add('hidden');
            modal.removeEventListener('keydown', handleConfirmKeydown);
            this.isConfirmModalOpen = false;
        };

        const handleConfirmKeydown = (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                if (document.activeElement === yesBtn) noBtn.focus();
                else yesBtn.focus();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                if (document.activeElement === yesBtn) noBtn.focus();
                else yesBtn.focus();
            }
        };
        modal.addEventListener('keydown', handleConfirmKeydown);

        yesBtn.onclick = () => {
            closeConfirm();
            if (onYes) onYes();
        };
        
        noBtn.onclick = () => {
            closeConfirm();
            if (onNo) onNo();
        };
    }

    formatDateDisplay(dateStr) {
        if (!dateStr || dateStr === 'UNKNOWN') return 'UNKNOWN';
        const match = dateStr.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s*[-]?\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (match) {
            const y = match[1];
            const m = this.padZero(parseInt(match[2], 10), 2);
            const d = this.padZero(parseInt(match[3], 10), 2);
            const hh = match[4] !== undefined ? this.padZero(parseInt(match[4], 10), 2) : '00';
            const mm = match[5] !== undefined ? this.padZero(parseInt(match[5], 10), 2) : '00';
            const ss = match[6] !== undefined ? this.padZero(parseInt(match[6], 10), 2) : '00';
            return `${y}.${m}.${d} - ${hh}:${mm}:${ss}`;
        }
        return dateStr;
    }

    updateRankingTable() {
        const tbody = document.getElementById('ranking-tbody');
        if (!tbody) return;
        
        if (this.highScores.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="ranking-no-data">NO DATA</td></tr>';
            return;
        }
        
        let html = '';
        this.highScores.forEach((data, index) => {
            const loopVal = (data.loop !== undefined) ? data.loop : 1;
            const stageVal = (data.stage !== undefined) ? data.stage : 1;
            const formattedDate = this.formatDateDisplay(data.date);
            html += `
                <tr>
                    <td class="ranking-num">${index + 1}</td>
                    <td class="ranking-score">${this.padZero(data.score, 6)}</td>
                    <td class="ranking-name">${data.name}</td>
                    <td class="ranking-loop">${loopVal}</td>
                    <td class="ranking-stage">${stageVal}</td>
                    <td class="ranking-date">${formattedDate}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }


    /**
     * デバッグメニュー内のゲームパッド操作をアップデートする
     * @param {Gamepad} gp 
     */
    updateDebugMenuGamepad(gp) {
        // ボタン状態の取得
        const buttons = gp.buttons.map(b => b.pressed);
        const axes = [gp.axes[0], gp.axes[1]];
        
        // 十字キーまたはスティックによる上下移動 (Just Pressed)
        let goUp = (buttons[12] && !this.prevDebugGamepadButtons[12]) || 
                   (axes[1] < -0.5 && this.prevDebugAxes[1] >= -0.5);
        let goDown = (buttons[13] && !this.prevDebugGamepadButtons[13]) || 
                     (axes[1] > 0.5 && this.prevDebugAxes[1] <= 0.5);
                     
        // 左右移動 (Just Pressed)
        let goLeft = (buttons[14] && !this.prevDebugGamepadButtons[14]) || 
                     (axes[0] < -0.5 && this.prevDebugAxes[0] >= -0.5);
        let goRight = (buttons[15] && !this.prevDebugGamepadButtons[15]) || 
                      (axes[0] > 0.5 && this.prevDebugAxes[0] <= 0.5);
                      
        // Aボタン (Just Released - 押しっぱなしによるタイトル画面でのゲーム開始誤爆を防ぐため)
        let releaseA = !buttons[0] && this.prevDebugGamepadButtons[0];
        
        // 状態保存
        this.prevDebugGamepadButtons = [...buttons];
        this.prevDebugAxes = [...axes];

        // 対象HTML要素を取得
        const debugElements = [
            document.getElementById('debug-stage'),
            document.getElementById('debug-loop'),
            document.getElementById('debug-seed'),
            document.getElementById('debug-invincible'),
            document.getElementById('debug-maxpower'),
            document.getElementById('debug-instantboss'),
            document.getElementById('debug-bosskill-key'),
            document.getElementById('debug-gamepad'),
            document.getElementById('debug-fps'),
            document.getElementById('debug-reset-btn'),
            document.getElementById('debug-close-btn')
        ].filter(el => el !== null); // 存在する要素のみ

        if (debugElements.length === 0) return;

        // --- 修正: キーボード等による実際のフォーカス移動があった場合のみ同期 ---
        if (this.lastDebugActiveElement !== document.activeElement) {
            this.lastDebugActiveElement = document.activeElement;
            const activeIdx = debugElements.indexOf(document.activeElement);
            if (activeIdx !== -1) {
                this.debugFocusIndex = activeIdx;
            }
        }

        // 上下移動によるフォーカス変更
        if (goUp) {
            this.debugFocusIndex = (this.debugFocusIndex - 1 + debugElements.length) % debugElements.length;
            debugElements[this.debugFocusIndex].focus();
        } else if (goDown) {
            this.debugFocusIndex = (this.debugFocusIndex + 1) % debugElements.length;
            debugElements[this.debugFocusIndex].focus();
        }

        // 現在フォーカスされている要素
        const focusedEl = debugElements[this.debugFocusIndex];
        if (!focusedEl) return;

        // フォーカス状態を視覚的に強調するため、アクティブ要素にfocusを当てる
        if (document.activeElement !== focusedEl) {
            focusedEl.focus();
        }

        // 左右移動による値の変更
        if (goLeft || goRight) {
            const isIncrease = goRight;
            if (focusedEl.tagName === 'SELECT') {
                // セレクトボックスの切り替え
                const nextIdx = focusedEl.selectedIndex + (isIncrease ? 1 : -1);
                if (nextIdx >= 0 && nextIdx < focusedEl.options.length) {
                    focusedEl.selectedIndex = nextIdx;
                    // changeイベントを発火させてプレースホルダーの更新などをトリガーする
                    focusedEl.dispatchEvent(new Event('change'));
                }
            } else if (focusedEl.tagName === 'INPUT') {
                if (focusedEl.type === 'number') {
                    // 数値入力の増減 (シードは100単位、他は1単位)
                    const isSeed = focusedEl.id === 'debug-seed';
                    const step = isSeed ? 100 : 1;
                    
                    // 現在値が空の場合はプレースホルダー値またはデフォルト値を使用
                    let val = parseFloat(focusedEl.value);
                    if (isNaN(val)) {
                        val = isSeed ? 1000 : 1;
                    }
                    
                    const min = focusedEl.min !== "" ? parseFloat(focusedEl.min) : -Infinity;
                    const max = focusedEl.max !== "" ? parseFloat(focusedEl.max) : Infinity;
                    const newVal = val + (isIncrease ? step : -step);
                    focusedEl.value = Math.max(min, Math.min(max, newVal));
                    focusedEl.dispatchEvent(new Event('input')); // リアルタイム反映のためにイベントを発火
                } else if (focusedEl.type === 'checkbox') {
                    // チェックボックスのトグル
                    focusedEl.checked = !focusedEl.checked;
                    focusedEl.dispatchEvent(new Event('change')); // リアルタイム反映のためにイベントを発火
                }
            }
        }

        // Aボタンでの決定操作 (離した瞬間に処理)
        if (releaseA) {
            if (focusedEl.tagName === 'BUTTON') {
                focusedEl.click();
            } else if (focusedEl.tagName === 'INPUT' && focusedEl.type === 'checkbox') {
                focusedEl.checked = !focusedEl.checked;
                focusedEl.dispatchEvent(new Event('change')); // リアルタイム反映のためにイベントを発火
            }
        }
    }

    /**
     * ゲームを終了してタイトル画面に戻る
     */
    exitToTitle() {
        
        // 1. 状態をTITLEに設定
        this.state = GameState.TITLE;
        this.scrollSpeed = GameConfig.game.scrollSpeed;
        
        // 2. 稼働中のエンティティ（敵、弾、アイテム、障害物など）をクリーンアップ
        this.clearActiveEntities();
        
        // 3. プレイヤーとボスの破棄
        if (this.player) {
            this.player.destroy();
            this.player = null;
        }
        if (this.boss) {
            this.boss.destroy();
            this.boss = null;
        }
        
        // 4. ボスHUDの非表示
        const bossHUD = document.getElementById('boss-hud');
        if (bossHUD) {
            bossHUD.classList.add('boss-hud--hidden');
        }
        
        // 5. 洞窟の壁とスクロールグリッドのクリア
        this.clearGridHelper();
        this.clearCaveWalls();
        
        // 6. タイトル画面用のデモシーン再構築
        this.setupTitleDemo();
        
        // 7. カメラをタイトル位置へリセット
        if (this.cameraController) {
            this.cameraController.isDyingMode = false;
        }
        this.renderer.camera.position.set(0, 5.0, 18.0);
        this.renderer.camera.lookAt(0, 1.0, -20.0);
        
        // 8. UI更新
        this.updateUI();
        
        // BGMの停止
        if (window.audioManager) {
            audioManager.stopBGM();
            audioManager.resumeBGM(); // ポーズ状態からの復帰を考慮 (停止後に再開することで一瞬鳴るのを防ぐ)
        }
    }

    /**
     * ポーズメニュー内のゲームパッド操作をアップデートする
     * @param {Gamepad} gp 
     */
    updatePauseMenuGamepad(gp) {
        // ボタン状態の取得
        const buttons = gp.buttons.map(b => b.pressed);
        const axes = [gp.axes[0], gp.axes[1]];
        
        // 十字キーまたはスティックによる上下移動 (Just Pressed)
        let goUp = (buttons[12] && !this.prevPauseGamepadButtons[12]) || 
                   (axes[1] < -0.5 && this.prevPauseAxes[1] >= -0.5);
        let goDown = (buttons[13] && !this.prevPauseGamepadButtons[13]) || 
                     (axes[1] > 0.5 && this.prevPauseAxes[1] <= 0.5);
                     
        // Aボタン (Just Released)
        let releaseA = !buttons[0] && this.prevPauseGamepadButtons[0];
        
        // 状態保存
        this.prevPauseGamepadButtons = [...buttons];
        this.prevPauseAxes = [...axes];

        // 対象HTML要素を取得
        const pauseElements = [
            document.getElementById('pause-resume-btn'),
            document.getElementById('pause-exit-btn')
        ].filter(el => el !== null); // 存在する要素のみ

        if (pauseElements.length === 0) return;

        // --- 修正: キーボード等による実際のフォーカス移動があった場合のみ同期 ---
        if (this.lastPauseActiveElement !== document.activeElement) {
            this.lastPauseActiveElement = document.activeElement;
            const activeIdx = pauseElements.indexOf(document.activeElement);
            if (activeIdx !== -1) {
                this.pauseFocusIndex = activeIdx;
            }
        }

        // 上下移動によるフォーカス変更
        if (goUp) {
            this.pauseFocusIndex = (this.pauseFocusIndex - 1 + pauseElements.length) % pauseElements.length;
            pauseElements[this.pauseFocusIndex].focus();
        } else if (goDown) {
            this.pauseFocusIndex = (this.pauseFocusIndex + 1) % pauseElements.length;
            pauseElements[this.pauseFocusIndex].focus();
        }

        // 現在フォーカスされている要素
        const focusedEl = pauseElements[this.pauseFocusIndex];
        if (!focusedEl) return;

        // フォーカス状態を視覚的に強調するため、アクティブ要素にfocusを当てる
        if (document.activeElement !== focusedEl) {
            focusedEl.focus();
        }

        // Aボタンでの決定操作 (離した瞬間に処理)
        if (releaseA) {
            focusedEl.click();
        }
    }

    /**
     * ゲームオーバーメニュー内のゲームパッド操作をアップデートする
     * @param {Gamepad} gp 
     */
    updateGameOverMenuGamepad(gp) {
        // ボタン状態の取得
        const buttons = gp.buttons.map(b => b.pressed);
        const axes = [gp.axes[0], gp.axes[1]];
        
        // 十字キーまたはスティックによる上下移動 (Just Pressed)
        let goUp = (buttons[12] && !this.prevGameoverGamepadButtons[12]) || 
                   (axes[1] < -0.5 && this.prevGameoverAxes[1] >= -0.5);
        let goDown = (buttons[13] && !this.prevGameoverGamepadButtons[13]) || 
                     (axes[1] > 0.5 && this.prevGameoverAxes[1] <= 0.5);
                     
        // Aボタン (Just Released)
        let releaseA = !buttons[0] && this.prevGameoverGamepadButtons[0];
        
        // 状態保存
        this.prevGameoverGamepadButtons = [...buttons];
        this.prevGameoverAxes = [...axes];

        // 対象HTML要素を取得
        const gameoverElements = [
            document.getElementById('gameover-restart-btn'),
            document.getElementById('gameover-exit-btn')
        ].filter(el => el !== null); // 存在する要素のみ

        if (gameoverElements.length === 0) return;

        // --- 修正: キーボード等による実際のフォーカス移動があった場合のみ同期 ---
        if (this.lastGameoverActiveElement !== document.activeElement) {
            this.lastGameoverActiveElement = document.activeElement;
            const activeIdx = gameoverElements.indexOf(document.activeElement);
            if (activeIdx !== -1) {
                this.gameoverFocusIndex = activeIdx;
            }
        }

        // 上下移動によるフォーカス変更
        if (goUp) {
            this.gameoverFocusIndex = (this.gameoverFocusIndex - 1 + gameoverElements.length) % gameoverElements.length;
            gameoverElements[this.gameoverFocusIndex].focus();
        } else if (goDown) {
            this.gameoverFocusIndex = (this.gameoverFocusIndex + 1) % gameoverElements.length;
            gameoverElements[this.gameoverFocusIndex].focus();
        }

        // 現在フォーカスされている要素
        const focusedEl = gameoverElements[this.gameoverFocusIndex];
        if (!focusedEl) return;

        // フォーカス状態を視覚的に強調するため、アクティブ要素にfocusを当てる
        if (document.activeElement !== focusedEl) {
            focusedEl.focus();
        }

        // Aボタンでの決定操作 (離した瞬間に処理)
        if (releaseA) {
            focusedEl.click();
        }
    }
}
