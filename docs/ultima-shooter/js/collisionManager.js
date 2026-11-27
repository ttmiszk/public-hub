/**
 * @fileoverview collisionManager.js
 * コリジョン（当たり判定）管理クラス。
 * 自機弾・敵弾・ボスビーム・敵機・障害物・アイテム間の球体およびビーム判定を担当する。
 */

/**
 * 当たり判定管理クラス
 */
class CollisionManager {
	/**
	 * @param {Game} game - ゲームメインクラスへの参照
	 */
	constructor(game) {
		/** @type {Game} */
		this.game = game;
	}

	/**
	 * 全カテゴリの当たり判定を一括実行する
	 */
	checkCollisions() {
		const player = this.game.player;
		if (!player || player.state !== 'ALIVE') return;

		this._checkPlayerBulletsHits();
		this._checkEnemyBulletsHits();
		this._checkPlayerVsEnemies();
		this._checkPlayerVsObstacles();
		this._checkItemPickups();
	}

	/**
	 * 2点間の簡易球体当たり判定 (BoundingSphere)
	 * @param {THREE.Vector3} pos1
	 * @param {number} r1
	 * @param {THREE.Vector3} pos2
	 * @param {number} r2
	 * @returns {boolean}
	 */
	_checkSphereCollision(pos1, r1, pos2, r2) {
		const dx = pos1.x - pos2.x;
		const dy = pos1.y - pos2.y;
		const dz = pos1.z - pos2.z;
		const rSum = r1 + r2;
		return (dx * dx + dy * dy + dz * dz) < (rSum * rSum);
	}

	/**
	 * 球体とカプセル（線分＋半径）の当たり判定（洞窟巨大結晶障害物用・GCゼロ）
	 * @param {THREE.Vector3} spherePos
	 * @param {number} sphereR
	 * @param {THREE.Vector3} segA
	 * @param {THREE.Vector3} segB
	 * @param {number} segR
	 * @returns {boolean}
	 */
	_checkSphereVsCapsule(spherePos, sphereR, segA, segB, segR) {
		const abx = segB.x - segA.x;
		const aby = segB.y - segA.y;
		const abz = segB.z - segA.z;
		const abLenSq = abx * abx + aby * aby + abz * abz;

		let t = 0.0;
		if (abLenSq > 0.0001) {
			t = ((spherePos.x - segA.x) * abx + (spherePos.y - segA.y) * aby + (spherePos.z - segA.z) * abz) / abLenSq;
			if (t < 0.0) t = 0.0;
			else if (t > 1.0) t = 1.0;
		}

		const cx = segA.x + abx * t;
		const cy = segA.y + aby * t;
		const cz = segA.z + abz * t;
		const dx = spherePos.x - cx;
		const dy = spherePos.y - cy;
		const dz = spherePos.z - cz;
		const rSum = sphereR + segR;
		return (dx * dx + dy * dy + dz * dz) < (rSum * rSum);
	}

	/**
	 * 指定した球体が洞窟の巨大結晶障害物に衝突しているか判定する
	 * @param {THREE.Vector3} pos
	 * @param {number} radius
	 * @returns {{damage: number}|null}
	 */
	_findHitCaveCrystal(pos, radius) {
		const caveWalls = this.game.caveWalls;
		if (!(caveWalls instanceof Map) || this.game.bossActiveRatio >= 0.05) return null;

		for (const seg of caveWalls.values()) {
			if (!seg.crystalColliders || seg.crystalColliders.length === 0) continue;
			if (seg.decorGroup && !seg.decorGroup.visible) continue;
			// Z範囲で高速カリング
			if (pos.z > seg.z1 + 12.0 || pos.z < seg.z2 - 12.0) continue;

			for (let k = 0; k < seg.crystalColliders.length; k++) {
				const col = seg.crystalColliders[k];
				if (this._checkSphereVsCapsule(pos, radius, col.start, col.end, col.radius)) {
					return col;
				}
			}
		}
		return null;
	}

	/**
	 * 自機弾と敵・ボス・障害物の当たり判定
	 */
	_checkPlayerBulletsHits() {
		const game = this.game;
		const bullets = game.bullets;
		const enemies = game.enemies;
		const obstacles = game.obstacles;
		const boss = game.boss;
		const bossActive = !!(boss && boss.active && boss.state === 'BATTLE');

		for (let i = bullets.length - 1; i >= 0; i--) {
			const bullet = bullets[i];
			if (!bullet || bullet.isEnemy || !bullet.active) continue;

			const bulletPos = bullet.mesh.position;
			let hit = false;

			// vs 敵機
			for (let j = enemies.length - 1; j >= 0; j--) {
				const enemy = enemies[j];
				if (!enemy.active) continue;

				if (this._checkSphereCollision(bulletPos, bullet.hitRadius, enemy.mesh.position, enemy.hitRadius)) {
					hit = true;
					this._handleEnemyDestroyed(enemy, j, bulletPos);
					break;
				}
			}

			// vs ボス
			if (!hit && bossActive) {
				if (this._checkSphereCollision(bulletPos, bullet.hitRadius, boss.mesh.position, boss.hitRadius)) {
					hit = true;
					game.damageBoss(1);
				}
			}

			// vs 障害物（浮遊岩）
			if (!hit) {
				for (const obs of obstacles) {
					if (!obs.active) continue;

					if (this._checkSphereCollision(bulletPos, bullet.hitRadius, obs.mesh.position, obs.hitRadius)) {
						hit = true;
						const bulletColor = bullet.mesh.material.color.getHex();
						game.effectManager.spawnExplosion(bulletPos.x, bulletPos.y, bulletPos.z, bulletColor, 8, false);
						if (window.audioManager) audioManager.play('bulletHitRock');
						break;
					}
				}
			}

			// vs 洞窟の巨大結晶障害物
			if (!hit && this._findHitCaveCrystal(bulletPos, bullet.hitRadius)) {
				hit = true;
				const bulletColor = bullet.mesh.material.color.getHex();
				game.effectManager.spawnExplosion(bulletPos.x, bulletPos.y, bulletPos.z, bulletColor, 8, false);
				if (window.audioManager) audioManager.play('bulletHitRock');
			}

			if (hit) {
				bullet.deactivate();
				game.bulletPool.release(bullet);
				const lastBullet = bullets.pop();
				if (i < bullets.length) bullets[i] = lastBullet;
			}
		}
	}

	/**
	 * 敵へのダメージ適用と撃破時の処理
	 * @param {Enemy} enemy
	 * @param {number} enemyIndex
	 * @param {THREE.Vector3} hitPos
	 */
	_handleEnemyDestroyed(enemy, enemyIndex, hitPos) {
		const game = this.game;
		const isDestroyed = enemy.damage(1);

		if (isDestroyed) {
			if (window.audioManager) audioManager.play('enemyExplode');
			game.effectManager.spawnExplosion(
				enemy.mesh.position.x,
				enemy.mesh.position.y,
				enemy.mesh.position.z,
				enemy.color,
				12,
				false
			);
			game.score += enemy.score;
			if (game.stageManager) game.stageManager.addEnemyKill(enemy.type);

			if (Math.random() < GameConfig.items.dropChance) {
				game.spawnItem(enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z);
			}

			game.enemySpawner.releaseEnemy(enemy);
			const lastEnemy = game.enemies.pop();
			if (enemyIndex < game.enemies.length) game.enemies[enemyIndex] = lastEnemy;

			game.updateUI();
		} else {
			if (window.audioManager) audioManager.play('enemyHit');
			game.effectManager.spawnExplosion(hitPos.x, hitPos.y, hitPos.z, 0xffaa00, 3, false);
		}
	}

	/**
	 * 敵弾・ボス極太ビームと自機の当たり判定
	 */
	_checkEnemyBulletsHits() {
		const game = this.game;
		const player = game.player;
		if (player.isInvincible) return;

		const playerPos = player.mesh.position;
		const playerRadius = GameConfig.player.hitRadius;
		const bullets = game.bullets;

		for (let i = bullets.length - 1; i >= 0; i--) {
			const bullet = bullets[i];
			if (!bullet || !bullet.isEnemy || !bullet.active) continue;

			if (this._checkSphereCollision(bullet.mesh.position, bullet.hitRadius, playerPos, playerRadius)) {
				bullet.deactivate();
				game.bulletPool.release(bullet);
				const lastBullet = bullets.pop();
				if (i < bullets.length) bullets[i] = lastBullet;

				player.damage(GameConfig.enemyBullet.damage, 'hit');
				game.effectManager.spawnExplosion(playerPos.x, playerPos.y, playerPos.z, 0xff3300, 8, false);
				game.triggerHUDFlash('life-val', 'hud-flash-score');
				break;
			}
		}

		// ボス極太ビーム判定
		const boss = game.boss;
		if (!boss || !boss.active || !boss.isFiringBeam) return;

		const bossPos = boss.mesh.position;
		if (playerPos.z <= bossPos.z || playerPos.z >= bossPos.z + 180.0) return;

		let hit = false;
		const ratio = Math.min(1.0, Math.max(0.0, (playerPos.z - bossPos.z) / 75.0));
		const currentCenterX = bossPos.x + (boss.beamTargetX - bossPos.x) * ratio;
		const currentCenterY = bossPos.y + (boss.beamTargetY - bossPos.y) * ratio;

		if (boss.stageIndex === 0) {
			const dx = playerPos.x - currentCenterX;
			const dy = playerPos.y - currentCenterY;
			if (dx * dx + dy * dy < 3.5 * 3.5) hit = true;
		} else if (boss.stageIndex === 1) {
			const theta = boss.mesh.rotation.z;
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

			if (dxLeft * dxLeft + dyLeft * dyLeft < 9.0 || dxRight * dxRight + dyRight * dyRight < 9.0) {
				hit = true;
			}
		} else if (boss.stageIndex === 2) {
			const dx = playerPos.x - currentCenterX;
			const dy = playerPos.y - currentCenterY;
			if (dx * dx + dy * dy < 4.8 * 4.8) hit = true;
		}

		if (hit) {
			player.damage(30, 'hit');
			game.triggerHUDFlash('life-val', 'hud-flash-score');
		}
	}

	/**
	 * 自機と敵機の接触判定（バリア展開中は体当たり撃破）
	 */
	_checkPlayerVsEnemies() {
		const game = this.game;
		const player = game.player;
		// バリアを持たない無敵状態（被弾後の点滅）は当たり判定をスキップ
		if (player.isInvincible && !player.hasBarrier) return;

		const playerPos = player.mesh.position;
		// バリア展開中は球体バリアの見た目に合わせて判定半径を拡大
		const playerRadius = player.hasBarrier ? 2.5 : GameConfig.player.hitRadius;
		const enemies = game.enemies;

		for (let i = enemies.length - 1; i >= 0; i--) {
			const enemy = enemies[i];
			if (!enemy.active) continue;

			if (this._checkSphereCollision(enemy.mesh.position, enemy.hitRadius, playerPos, playerRadius)) {
				// バリア展開中は敵を体当たりで撃破し、自機は無傷
				if (player.hasBarrier) {
					this._handleEnemyDestroyed(enemy, i, enemy.mesh.position);
					continue;
				}

				game.effectManager.spawnExplosion(
					enemy.mesh.position.x,
					enemy.mesh.position.y,
					enemy.mesh.position.z,
					enemy.color,
					12,
					false
				);
				game.score += enemy.score;
				game.enemySpawner.releaseEnemy(enemy);
				const lastEnemy = enemies.pop();
				if (i < enemies.length) enemies[i] = lastEnemy;

				player.damage(GameConfig.player.collisionDamage, 'collision');
				game.effectManager.spawnExplosion(playerPos.x, playerPos.y, playerPos.z, 0xff5500, 10, false);
				game.triggerHUDFlash('life-val', 'hud-flash-score');

				game.updateUI();
				break;
			}
		}
	}

	/**
	 * 自機と障害物（岩）の接触判定
	 */
	_checkPlayerVsObstacles() {
		const game = this.game;
		const player = game.player;
		// 無敵状態およびバリア展開中は障害物判定をスキップ
		if (player.isInvincible) return;

		const playerPos = player.mesh.position;
		const playerRadius = GameConfig.player.hitRadius;

		for (const obs of game.obstacles) {
			if (!obs.active) continue;

			if (this._checkSphereCollision(obs.mesh.position, obs.hitRadius, playerPos, playerRadius)) {
				player.damage(obs.damage, 'collision');
				game.effectManager.spawnExplosion(playerPos.x, playerPos.y, playerPos.z, 0xff5500, 12, false);
				game.triggerHUDFlash('life-val', 'hud-flash-score');
				return;
			}
		}

		// vs 洞窟の巨大結晶障害物
		const hitCrystal = this._findHitCaveCrystal(playerPos, playerRadius);
		if (hitCrystal) {
			player.damage(hitCrystal.damage, 'collision');
			game.effectManager.spawnExplosion(playerPos.x, playerPos.y, playerPos.z, 0x00ffaa, 14, false);
			game.triggerHUDFlash('life-val', 'hud-flash-score');
		}
	}

	/**
	 * 自機とアイテムの取得判定
	 */
	_checkItemPickups() {
		const game = this.game;
		const player = game.player;
		const playerPos = player.mesh.position;
		const playerRadius = GameConfig.player.hitRadius;
		const items = game.items;

		for (let i = items.length - 1; i >= 0; i--) {
			const item = items[i];
			if (!item.active) continue;

			if (this._checkSphereCollision(item.mesh.position, item.hitRadius, playerPos, playerRadius)) {
				const config = GameConfig.items.types[item.type];

				if (window.audioManager) audioManager.play('itemPickup');
				player.flash(config.color);

				if (item.type === 'BULLET') {
					player.addAmmo(item.value);
					game.updateUI();
					game.triggerHUDFlash('ammo-val', 'hud-flash-ammo');
				} else if (item.type === 'HEAL') {
					player.heal(item.value);
					game.updateUI();
					game.triggerHUDFlash('life-val', 'hud-flash-life');
				} else if (item.type === 'POWERUP') {
					player.powerUp();
					game.updateUI();
					game.triggerHUDFlash('power-val', 'hud-flash-power');
				} else if (item.type === 'BARRIER') {
					const duration = config.duration || 5.0;
					player.activateBarrier(duration);
				}

				game.effectManager.spawnExplosion(
					item.mesh.position.x,
					item.mesh.position.y,
					item.mesh.position.z,
					config.color,
					15,
					true
				);

				item.deactivate();
				game.itemPool.release(item);
				const lastItem = items.pop();
				if (i < items.length) items[i] = lastItem;
			}
		}
	}
}
