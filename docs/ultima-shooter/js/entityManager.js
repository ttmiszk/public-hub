/**
 * @fileoverview entityManager.js
 * ゲーム内の全エンティティ（弾・敵・アイテム・障害物・ボス・洞窟壁・タイトルデモオブジェクト）の
 * プール管理、生成、フレーム更新、クリーンアップを担当する。
 */

/**
 * エンティティ統合管理クラス
 */
class EntityManager {
	/**
	 * @param {Game} game - ゲームメインクラスへの参照
	 */
	constructor(game) {
		/** @type {Game} */
		this.game = game;

		// オブジェクトプール
		/** @type {ObjectPool|null} */
		this.bulletPool = null;
		/** @type {ObjectPool|null} */
		this.itemPool = null;
		/** @type {Object<string, ObjectPool>} */
		this.obstaclePool = {};

		// アクティブなエンティティ配列
		/** @type {Bullet[]} */
		this.bullets = [];
		/** @type {Enemy[]} */
		this.enemies = [];
		/** @type {Item[]} */
		this.items = [];
		/** @type {Obstacle[]} */
		this.obstacles = [];
		/** @type {THREE.Object3D[]} */
		this.entities = [];

		// スポーンタイマー
		this.obstacleSpawnTimer = 0.0;
		this.itemSpawnTimer = 0.0;

		// ボス管理
		/** @type {Boss|null} */
		this.boss = null;
		this.bossActiveRatio = 0.0;
		this.lastBossActiveRatio = 0.0;
		this.bossDefeatedTimer = 0.0;

		// 洞窟壁・背景グリッド
		/** @type {THREE.GridHelper|null} */
		this.gridHelper = null;
		/** @type {Map<number, CaveSegment>} */
		this.caveWalls = new Map();
		this.caveWallMaterial = null;
		this.caveGridMaterial = null;

		// タイトルデモ用オブジェクト
		/** @type {THREE.Object3D[]} */
		this.demoEntities = [];
		/** @type {THREE.Mesh|null} */
		this.demoPlayer = null;
		/** @type {THREE.Mesh[]} */
		this.demoStars = [];
		/** @type {THREE.Mesh[]} */
		this.titleRocks = [];
	}

	/**
	 * 各種オブジェクトプールの初期化
	 */
	initPools() {
		const scene = this.game.renderer.scene;

		this.bulletPool = new ObjectPool(
			() => new Bullet(scene),
			(bullet, x, y, z, isEnemy, dirX, dirY, dirZ, customSpeed) =>
				bullet.init(x, y, z, isEnemy, dirX, dirY, dirZ, customSpeed),
			50
		);

		this.itemPool = new ObjectPool(
			() => new Item(scene),
			(item, x, y, z, type, customValue) => item.init(x, y, z, type, customValue),
			15
		);

		this.obstaclePool = {
			ROCK: new ObjectPool(
				() => new Obstacle(scene, 'ROCK'),
				(obs, x, y, z) => obs.init(x, y, z),
				12
			)
		};
	}

	/**
	 * タイトル画面用デモシーンの構築
	 */
	setupTitleDemo() {
		const scene = this.game.renderer.scene;

		// デモ用のダミー自機（カメラ追従用マーカー）
		const geo = new THREE.ConeGeometry(0.5, 2.0, 4);
		geo.rotateX(Math.PI / 2);
		const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
		this.demoPlayer = new THREE.Mesh(geo, mat);
		this.demoPlayer.position.set(0, 1, 0);
		this.demoPlayer.visible = false;
		scene.add(this.demoPlayer);
		this.demoEntities.push(this.demoPlayer);

		// 流れる星々
		const starGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
		const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
		for (let i = 0; i < 150; i++) {
			const star = new THREE.Mesh(starGeo, starMat);
			star.position.set(
				(Math.random() - 0.5) * 100,
				(Math.random() - 0.5) * 50,
				-Math.random() * 300
			);
			scene.add(star);
			this.demoEntities.push(star);
			this.demoStars.push(star);
		}

		// プロシージャルノイズテクスチャ（バンプマップ用）の生成
		this._ensureNoiseTextures();

		// デモ用の浮遊岩
		this.titleRocks = [];
		const rockGeomTypes = [
			new THREE.IcosahedronGeometry(1, 1),
			new THREE.IcosahedronGeometry(1, 2),
			new THREE.IcosahedronGeometry(1, 3)
		];

		for (let i = 0; i < 20; i++) {
			const rockMat = new THREE.MeshStandardMaterial({
				color: Math.random() < 0.5 ? 0x887766 : 0x666666,
				roughness: 0.9,
				metalness: 0.1,
				flatShading: true,
				bumpMap: window.rockNoiseTexture,
				bumpScale: 0.25
			});
			let rockGeo = rockGeomTypes[Math.floor(Math.random() * rockGeomTypes.length)].clone();
			rockGeo = rockGeo.toNonIndexed();
			const posAttr = rockGeo.attributes.position;
			const v = new THREE.Vector3();
			const noiseMap = new Map();

			for (let j = 0; j < posAttr.count; j++) {
				v.fromBufferAttribute(posAttr, j);
				const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
				let noise = noiseMap.get(key);
				if (noise === undefined) {
					noise = 0.9 + Math.random() * 0.2;
					noiseMap.set(key, noise);
				}
				v.multiplyScalar(noise);
				posAttr.setXYZ(j, v.x, v.y, v.z);
			}
			rockGeo.computeVertexNormals();

			const rock = new THREE.Mesh(rockGeo, rockMat);
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
			rock.userData = {
				rotX: (Math.random() - 0.5) * 2.0,
				rotY: (Math.random() - 0.5) * 2.0,
				rotZ: (Math.random() - 0.5) * 2.0,
				speedZ: 10 + Math.random() * 15
			};

			scene.add(rock);
			this.demoEntities.push(rock);
			this.titleRocks.push(rock);
		}
	}

	/**
	 * 岩および洞窟用の高精細バンプ・ラフネステクスチャを MaterialLibrary から取得する
	 */
	_ensureNoiseTextures() {
		if (typeof MaterialLibrary !== 'undefined') {
			window.rockNoiseTexture = MaterialLibrary.getRockBumpTexture();
			window.rockRoughnessTexture = MaterialLibrary.getRockRoughnessTexture();
			window.caveNoiseTexture = MaterialLibrary.getCaveBumpTexture();
			window.caveRoughnessTexture = MaterialLibrary.getCaveRoughnessTexture();
		}
	}

	/**
	 * タイトルデモシーンのフレーム更新
	 * @param {number} deltaTime
	 * @param {number} elapsedTime
	 */
	updateTitleDemo(deltaTime, elapsedTime) {
		if (!this.demoPlayer) return;

		const titleScrollSpeed = this.game.scrollSpeed * 1.5;

		this.demoPlayer.position.y = 1.0 + Math.sin(elapsedTime * 3) * 0.3;
		this.demoPlayer.position.x = Math.cos(elapsedTime * 1.5) * 0.5;
		this.demoPlayer.rotation.z = Math.cos(elapsedTime * 1.5) * 0.2;
		this.demoPlayer.position.z -= titleScrollSpeed * deltaTime;

		const cam = this.game.renderer.camera;
		cam.position.x = 0;
		cam.position.y = 5.0;
		cam.position.z = this.demoPlayer.position.z + 18.0;
		cam.lookAt(0, 1.0, this.demoPlayer.position.z - 20.0);

		for (const star of this.demoStars) {
			if (star.position.z > this.demoPlayer.position.z + 20) {
				star.position.z = this.demoPlayer.position.z - 200 - Math.random() * 100;
				star.position.x = (Math.random() - 0.5) * 100;
				star.position.y = (Math.random() - 0.5) * 50;
			}
		}

		for (const rock of this.titleRocks) {
			rock.rotation.x += rock.userData.rotX * deltaTime;
			rock.rotation.y += rock.userData.rotY * deltaTime;
			rock.rotation.z += rock.userData.rotZ * deltaTime;
			rock.position.z += rock.userData.speedZ * deltaTime;

			if (rock.position.z > this.demoPlayer.position.z + 20) {
				rock.position.z = this.demoPlayer.position.z - 200 - Math.random() * 100;
				rock.position.x = (Math.random() - 0.5) * 80;
				rock.position.y = (Math.random() - 0.5) * 40;
			}
		}
	}

	/**
	 * デモ用オブジェクトのクリーンアップ
	 */
	clearTitleDemo() {
		const scene = this.game.renderer.scene;
		for (const ent of this.demoEntities) {
			scene.remove(ent);
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
	 * プレイ中の全エンティティを一括更新する
	 * @param {number} deltaTime
	 * @param {number} gameDeltaTime
	 * @param {Object} activePlayer
	 * @param {THREE.Vector3} playerPos
	 * @param {number} playerZ
	 * @param {number} cameraZ
	 * @param {Object|null} currentStage
	 */
	updatePlayingEntities(deltaTime, gameDeltaTime, activePlayer, playerPos, playerZ, cameraZ, currentStage) {
		this.updateCaveWalls(playerZ);
		this._updateBossActiveRatio(deltaTime, currentStage);

		if (this.game.enemySpawner) {
			this.game.enemySpawner.update(gameDeltaTime, playerZ);
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
	}

	/**
	 * ボス戦時の洞窟拡張比率の更新
	 * @param {number} deltaTime
	 * @param {Object|null} currentStage
	 */
	_updateBossActiveRatio(deltaTime, currentStage) {
		const stageManager = this.game.stageManager;
		if ((this.boss && this.boss.active) || (stageManager && stageManager.state === 'TRANSITION')) {
			this.bossActiveRatio = Math.min(1.0, this.bossActiveRatio + deltaTime / 3.0);
		} else {
			this.bossActiveRatio = 0.0;
		}

		if (this.bossActiveRatio !== this.lastBossActiveRatio) {
			if (this.caveWalls instanceof Map) {
				for (const segment of this.caveWalls.values()) {
					segment.updatePositions(currentStage, this.bossActiveRatio);
				}
			}
			this.lastBossActiveRatio = this.bossActiveRatio;
		}
	}

	/**
	 * 敵機の更新と画面外回収
	 * @param {number} gameDeltaTime
	 * @param {Object} activePlayer
	 * @param {number} cameraZ
	 */
	_updateEnemies(gameDeltaTime, activePlayer, cameraZ) {
		for (let i = this.enemies.length - 1; i >= 0; i--) {
			const enemy = this.enemies[i];
			enemy.update(gameDeltaTime, activePlayer, this.game);

			// 更新中に破棄された敵を即座にプールへ戻す
			if (!enemy.mesh) {
				this.game.enemySpawner.releaseEnemy(enemy);
				const lastEnemy = this.enemies.pop();
				if (i < this.enemies.length) this.enemies[i] = lastEnemy;
				continue;
			}

			if (enemy.mesh.position.z > cameraZ + 5.0 || !enemy.active) {
				this.game.enemySpawner.releaseEnemy(enemy);
				const lastEnemy = this.enemies.pop();
				if (i < this.enemies.length) this.enemies[i] = lastEnemy;
			}
		}
	}

	/**
	 * 障害物のスポーンと更新
	 * @param {number} gameDeltaTime
	 * @param {number} playerZ
	 * @param {number} cameraZ
	 * @param {Object} currentStage
	 */
	_updateObstacles(gameDeltaTime, playerZ, cameraZ, currentStage) {
		if (this.game.stageManager && this.game.stageManager.state === 'PLAYING') {
			this.obstacleSpawnTimer += gameDeltaTime;
			const interval = (currentStage.obstacles && currentStage.obstacles.spawnInterval !== undefined)
				? currentStage.obstacles.spawnInterval
				: 2.5;
			if (this.obstacleSpawnTimer >= interval) {
				this.obstacleSpawnTimer = 0.0;
				this.spawnRandomObstacle();
			}
		}

		for (let i = this.obstacles.length - 1; i >= 0; i--) {
			const obs = this.obstacles[i];
			obs.update(gameDeltaTime, playerZ, this.game.scrollSpeed);

			if (obs.mesh.position.z > cameraZ + 5.0 || !obs.active) {
				obs.deactivate();
				this.obstaclePool[obs.type].release(obs);
				const lastObs = this.obstacles.pop();
				if (i < this.obstacles.length) this.obstacles[i] = lastObs;
			}
		}
	}

	/**
	 * 空間アイテムの定期スポーン制御
	 * @param {number} deltaTime
	 */
	_updateItemSpawning(deltaTime) {
		this.itemSpawnTimer += deltaTime;
		let itemInterval = GameConfig.items.spawnInterval;
		let shouldSpawn = true;

		if (this.game.stageManager && this.game.stageManager.state === 'TRANSITION') {
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

	/**
	 * ボスの更新と撃破演出パーティクル
	 * @param {number} gameDeltaTime
	 * @param {THREE.Vector3} playerPos
	 */
	_updateBoss(gameDeltaTime, playerPos) {
		this.boss.update(gameDeltaTime, playerPos, this.game);

		if (this.boss.state === 'DEFEATED' && Math.random() < 0.6) {
			const offset = new THREE.Vector3(
				(Math.random() - 0.5) * 12.0,
				(Math.random() - 0.5) * 8.0,
				(Math.random() - 0.5) * 6.0
			);
			const p = this.boss.mesh.position.clone().add(offset);
			const colors = [0xffffff, 0xffbb00, 0xff3333];
			if (this.boss.stageIndex !== 2) colors.push(this.boss.color);
			const randColor = colors[Math.floor(Math.random() * colors.length)];
			this.game.effectManager.spawnExplosion(p.x, p.y, p.z, randColor, 20, false);
		}
		this.game.updateBossHPBar();
	}

	/**
	 * アイテムの更新と画面外回収
	 * @param {number} deltaTime
	 * @param {THREE.Vector3} playerPos
	 * @param {number} cameraZ
	 */
	_updateItems(deltaTime, playerPos, cameraZ) {
		for (let i = this.items.length - 1; i >= 0; i--) {
			const item = this.items[i];
			item.update(deltaTime, playerPos);

			if (item.mesh.position.z > cameraZ + 5.0 || !item.active) {
				item.deactivate();
				this.itemPool.release(item);
				const lastItem = this.items.pop();
				if (i < this.items.length) this.items[i] = lastItem;
			}
		}
	}

	/**
	 * 弾の更新と射程外回収
	 * @param {number} deltaTime
	 * @param {number} cameraZ
	 */
	_updateBullets(deltaTime, cameraZ) {
		const maxDist = GameConfig.bullet.maxDistance;
		for (let i = this.bullets.length - 1; i >= 0; i--) {
			const bullet = this.bullets[i];
			if (!bullet) continue;
			bullet.update(deltaTime, this.game.scrollSpeed);

			const dist = Math.abs(bullet.mesh.position.z - cameraZ);
			if (dist > maxDist || !bullet.active) {
				bullet.deactivate();
				this.bulletPool.release(bullet);
				const lastBullet = this.bullets.pop();
				if (i < this.bullets.length) this.bullets[i] = lastBullet;
			}
		}
	}

	/**
	 * プレイヤー弾の生成
	 */
	spawnPlayerBullet(x, y, z, dirX = 0, dirY = 0, dirZ = -1, customSpeed = null) {
		if (!this.bulletPool) return;
		const bullet = this.bulletPool.obtain(x, y, z, false, dirX, dirY, dirZ, customSpeed);
		this.bullets.push(bullet);
	}

	/**
	 * 敵弾の生成
	 */
	spawnEnemyBullet(x, y, z, dirX = 0, dirY = 0, dirZ = 1, customSpeed = null) {
		if (!this.bulletPool) return;
		const bullet = this.bulletPool.obtain(x, y, z, true, dirX, dirY, dirZ, customSpeed);
		this.bullets.push(bullet);
	}

	/**
	 * 敵撃破ドロップ用アイテム（POWERUP）の生成
	 */
	spawnItem(x, y, z) {
		if (!this.itemPool) return;
		const item = this.itemPool.obtain(x, y, z, 'POWERUP');
		this.items.push(item);
	}

	/**
	 * 空間上へのランダムなアイテム（BULLET/HEAL/BARRIER）の生成
	 */
	spawnRandomItem() {
		const player = this.game.player;
		if (!player || !this.itemPool) return;

		const rand = Math.random();
		let type = null;

		let bulletChance = GameConfig.items.spawnChance.BULLET;
		let healChance = GameConfig.items.spawnChance.HEAL;

		// ボス撃破後のボーナスタイム中はアイテム出現率を100%にする
		if (this.game.stageManager && this.game.stageManager.state === 'TRANSITION') {
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
			const barrierChance = GameConfig.items.spawnChance.BARRIER;
			if (rand < bulletChance + healChance + barrierChance) {
				type = 'BARRIER';
			}
		}

		if (!type) return;

		const playerZ = player.mesh.position.z;
		const spawnZ = playerZ - 60.0;
		const stage = this.game.stageManager ? this.game.stageManager.getCurrentStage() : null;
		const bounds = getCaveBoundsAt(spawnZ, stage);

		const margin = GameConfig.items.hitRadius * 0.5;
		const a = Math.max(0.1, bounds.width / 2 - margin);
		const bH = Math.max(0.1, bounds.height / 2 - margin);

		let spawnX;
		let spawnY;
		if (a > 0.5 && bH > 0.5) {
			const angle = Math.random() * Math.PI * 2;
			const radius = Math.sqrt(Math.random());
			spawnX = bounds.centerX + a * radius * Math.cos(angle);
			spawnY = bounds.centerY + bH * radius * Math.sin(angle);
		} else {
			spawnX = bounds.centerX;
			spawnY = bounds.centerY;
		}

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
	 * ランダムな障害物（浮遊岩）の生成
	 */
	spawnRandomObstacle() {
		const player = this.game.player;
		if (!player || !this.obstaclePool) return;

		// フォグの奥深く（260ユニット前方）から出現させ、突然現れる違和感をなくす
		const spawnZ = player.mesh.position.z - 260.0;
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

		const playerZ = this.game.player ? this.game.player.mesh.position.z : 0;
		const spawnZ = playerZ - 250.0;
		const spawnY = GameConfig.player.limitYMin + 4.0;

		this.bossActiveRatio = 0.0;
		this.lastBossActiveRatio = 0.0;

		this.boss = new Boss(this.game.renderer.scene, stageIndex);
		this.boss.init(0, spawnY, spawnZ);

		// 周回難易度係数をボスパラメータに適用
		if (this.game.stageManager) {
			const scale = this.game.stageManager.getDifficultyScale();
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

		this.game.showBossHUD();
	}

	/**
	 * ボスへの被弾ダメージ適用
	 * @param {number} amount
	 */
	damageBoss(amount) {
		if (!this.boss || !this.boss.active) return;

		const isDefeated = this.boss.damage(amount);
		const bPos = this.boss.mesh.position;
		this.game.effectManager.spawnExplosion(bPos.x, bPos.y, bPos.z + 2.5, 0xffbb00, 4, false);

		this.game.updateBossHPBar();

		if (isDefeated) {
			if (window.audioManager) audioManager.play('bossExplode');
			this.triggerBossDefeated();
		} else {
			if (window.audioManager) audioManager.play('bossHit');
		}
	}

	/**
	 * ボス撃破時の処理
	 */
	triggerBossDefeated() {
		this.game.score += this.boss.score;
		this.game.updateUI();

		this.bossDefeatedTimer = 0.0;

		const bPos = this.boss.mesh.position;
		const expColor = (this.boss.stageIndex === 2) ? 0xffbb00 : this.boss.color;
		this.game.effectManager.spawnExplosion(bPos.x, bPos.y, bPos.z, expColor, 32, false);

		// 画面上の敵弾をすべて消去
		for (let i = this.bullets.length - 1; i >= 0; i--) {
			const bullet = this.bullets[i];
			if (!bullet || !bullet.isEnemy) continue;
			bullet.deactivate();
			this.bulletPool.release(bullet);
			const lastBullet = this.bullets.pop();
			if (i < this.bullets.length) this.bullets[i] = lastBullet;
		}

		// 画面上の雑魚敵をすべて消去
		for (let i = this.enemies.length - 1; i >= 0; i--) {
			const enemy = this.enemies[i];
			enemy.deactivate();
			this.game.enemySpawner.releaseEnemy(enemy);
			const lastEnemy = this.enemies.pop();
			if (i < this.enemies.length) this.enemies[i] = lastEnemy;
		}

		this.game.hideBossHUD();

		// 撃破後のスローモーション演出
		this.game.scrollSpeed = GameConfig.game.scrollSpeed * 0.12;

		if (this.game.stageManager) {
			this.game.stageManager.onBossDefeated();
		}
	}

	/**
	 * 背景グリッドヘルパーの完全削除
	 */
	clearGridHelper() {
		if (!this.gridHelper) return;

		this.game.renderer.scene.remove(this.gridHelper);
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

	/**
	 * 洞窟用壁セグメントの初期構築
	 */
	setupCaveWalls() {
		this.clearCaveWalls();

		const stage = this.game.stageManager ? this.game.stageManager.getCurrentStage() : null;
		if (!stage) return;

		this._createCaveMaterials(stage);

		const playerZ = this.game.player ? this.game.player.mesh.position.z : 0;
		this.updateCaveWalls(playerZ);
	}

	/**
	 * 洞窟用マテリアルの生成（高精細地層バンプ＆ラフネス＋IBL反射対応）
	 * @param {Object} stage
	 */
	_createCaveMaterials(stage) {
		this._ensureNoiseTextures();
		this.caveWallMaterial = new THREE.MeshStandardMaterial({
			color: stage.theme.wallColor,
			vertexColors: true,
			roughness: 0.78,
			metalness: 0.24,
			flatShading: true,
			side: THREE.DoubleSide,
			bumpMap: window.caveNoiseTexture,
			bumpScale: 0.45,
			roughnessMap: window.caveRoughnessTexture || null,
			envMapIntensity: 0.85
		});

		this.caveGridMaterial = new THREE.LineBasicMaterial({
			color: stage.theme.gridColor,
			transparent: true,
			opacity: 0.16
		});
	}

	/**
	 * 洞窟用壁セグメントの破棄
	 */
	clearCaveWalls() {
		if (this.caveWalls instanceof Map) {
			for (const segment of this.caveWalls.values()) {
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
		const stage = this.game.stageManager ? this.game.stageManager.getCurrentStage() : null;
		if (!stage) return;

		const segmentLength = 15.0;
		const currentIdx = Math.floor(Math.abs(playerZ) / segmentLength);
		const cameraZ = (this.game.renderer && this.game.renderer.camera)
			? this.game.renderer.camera.position.z
			: playerZ;
		const cameraIdx = Math.floor(Math.abs(cameraZ) / segmentLength);

		// カメラの後方 3 セグメント、プレイヤーの前方 22 セグメントを維持
		const startIdx = Math.max(0, cameraIdx - 3);
		const endIdx = currentIdx + 22;

		if (!(this.caveWalls instanceof Map)) {
			this.caveWalls = new Map();
		}

		if (!this.caveWallMaterial || !this.caveGridMaterial) {
			this._createCaveMaterials(stage);
		}

		// 範囲外のセグメントを削除
		for (const [idx, segment] of this.caveWalls.entries()) {
			if (idx < startIdx || idx > endIdx) {
				segment.destroy();
				this.caveWalls.delete(idx);
			}
		}

		// 必要なセグメントを追加
		for (let idx = startIdx; idx <= endIdx; idx++) {
			if (!this.caveWalls.has(idx)) {
				const segment = new CaveSegment(
					this.game.renderer.scene,
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
	 * 稼働中の敵・弾・アイテム・障害物・ボス・エフェクトの全クリーンアップ
	 */
	clearActiveEntities() {
		if (this.game.enemySpawner) {
			for (const enemy of this.enemies) {
				this.game.enemySpawner.releaseEnemy(enemy);
			}
		}
		this.enemies = [];

		if (this.bulletPool) {
			for (const bullet of this.bullets) {
				bullet.deactivate();
				this.bulletPool.release(bullet);
			}
		}
		this.bullets = [];

		if (this.itemPool) {
			for (const item of this.items) {
				item.deactivate();
				this.itemPool.release(item);
			}
		}
		this.items = [];

		if (this.obstaclePool) {
			for (const obs of this.obstacles) {
				obs.deactivate();
				this.obstaclePool[obs.type].release(obs);
			}
		}
		this.obstacles = [];
		this.obstacleSpawnTimer = 0.0;
		this.itemSpawnTimer = 0.0;

		if (this.boss) {
			this.boss.destroy();
			this.boss = null;
		}

		if (this.game.effectManager) {
			this.game.effectManager.clearAll();
		}
	}

	/**
	 * リソースの完全破棄
	 */
	destroy() {
		this.clearTitleDemo();
		this.clearActiveEntities();
		this.clearGridHelper();
		this.clearCaveWalls();

		if (this.bulletPool) {
			for (const b of this.bulletPool.pool) {
				b.destroy();
			}
			this.bulletPool = null;
		}

		if (this.itemPool) {
			for (const it of this.itemPool.pool) {
				it.destroy();
			}
			this.itemPool = null;
		}

		const scene = this.game.renderer.scene;
		for (const ent of this.entities) {
			scene.remove(ent);
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
}
