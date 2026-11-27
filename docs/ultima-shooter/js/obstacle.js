/**
 * @fileoverview obstacle.js
 * 障害物クラス（浮遊岩・鉱石小惑星）。
 * 多層 FBM ノイズ＋クレーター変形、頂点カラーによる擬似 AO、
 * 高精細 PBR 岩石テクスチャ、およびステージ色と連動する結晶鉱脈ディテールを担当する。
 */

class Obstacle {
	/**
	 * @param {THREE.Scene} scene - シーンオブジェクト
	 * @param {string} type - 障害物のタイプ ('ROCK')
	 */
	constructor(scene, type) {
		/** @type {THREE.Scene} */
		this.scene = scene;
		/** @type {string} */
		this.type = type;

		/** @type {THREE.Group} */
		this.mesh = null;
		/** @type {THREE.Mesh|null} 岩本体メッシュ */
		this.rockMesh = null;
		/** @type {boolean} アクティブ状態か */
		this.active = false;

		const config = GameConfig.obstacles.types[type];
		this.name = config.name;
		this.damage = config.damage;
		this.color = config.color;

		this.baseHitRadius = config.hitRadius;
		this.hitRadius = this.baseHitRadius;

		// バリエーション種別 (0〜3)
		this.geometryType = 0;

		// 3軸自転速度
		this.rotationSpeed = new THREE.Vector3();

		this.initMesh();
	}

	/**
	 * 多層 FBM＋クレーター凹み変形と頂点カラー AO を焼き込んだ小惑星ジオメトリを生成
	 * @param {number} radius
	 * @param {number} detail
	 * @param {number} seed
	 * @returns {THREE.BufferGeometry}
	 */
	_createAsteroidGeometry(radius, detail, seed) {
		let geo = new THREE.IcosahedronGeometry(radius, detail);
		if (geo.index) geo = geo.toNonIndexed();

		// クレーター中心（正規化方向ベクトル + 半径 + 深さ）を 3 箇所決定論的に生成
		const craters = [];
		for (let c = 0; c < 3; c++) {
			const a = seed * 1.7 + c * 2.13;
			const b = seed * 0.9 + c * 1.57;
			const dir = new THREE.Vector3(
				Math.cos(a) * Math.cos(b),
				Math.sin(b),
				Math.sin(a) * Math.cos(b)
			).normalize();
			craters.push({
				dir,
				angle: 0.42 + (c % 2) * 0.16,
				depth: 0.14 + (c % 3) * 0.03
			});
		}

		const posAttr = geo.attributes.position;
		const colors = new Float32Array(posAttr.count * 3);
		const v = new THREE.Vector3();
		const dirNorm = new THREE.Vector3();

		for (let i = 0; i < posAttr.count; i++) {
			v.fromBufferAttribute(posAttr, i);
			dirNorm.copy(v).normalize();

			// 3オクターブ三角関数 FBM（共有頂点が同一方向なので面割れゼロ）
			const nx = dirNorm.x;
			const ny = dirNorm.y;
			const nz = dirNorm.z;
			const f1 = Math.sin(nx * 2.8 + seed) * Math.cos(ny * 2.5 - seed * 0.7) * Math.sin(nz * 2.9 + seed * 1.3);
			const f2 = Math.sin(nx * 6.2 - ny * 5.4 + seed * 2.1) * Math.cos(nz * 5.8 + nx * 4.1);
			const f3 = Math.cos(nx * 11.5 + nz * 10.2 - ny * 9.8 + seed);

			let disp = 1.0 + f1 * 0.16 + f2 * 0.08 + f3 * 0.035;

			// クレーター凹み＋縁のリム盛り上がり
			let craterShade = 0.0;
			for (let c = 0; c < craters.length; c++) {
				const cr = craters[c];
				const dot = dirNorm.dot(cr.dir);
				const ang = Math.acos(Math.max(-1.0, Math.min(1.0, dot)));
				if (ang < cr.angle) {
					const t = ang / cr.angle;
					// 内側は凹み、外縁 (t ≈ 0.85) はわずかに隆起
					const bowl = Math.cos(t * Math.PI * 0.5);
					disp -= bowl * bowl * cr.depth;
					craterShade -= bowl * 0.25;
				} else if (ang < cr.angle * 1.25) {
					const rimT = 1.0 - (ang - cr.angle) / (cr.angle * 0.25);
					disp += rimT * 0.035;
					craterShade += rimT * 0.08;
				}
			}

			v.copy(dirNorm).multiplyScalar(radius * disp);
			posAttr.setXYZ(i, v.x, v.y, v.z);

			// 頂点カラーによる擬似 AO（凹みは暗く、稜線は明るく風化）
			const shade = Math.max(0.45, Math.min(1.22, 0.86 + (disp - 1.0) * 1.55 + craterShade));
			colors[i * 3] = shade;
			colors[i * 3 + 1] = shade * 0.98;
			colors[i * 3 + 2] = shade * 0.96;
		}

		geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		geo.computeVertexNormals();
		return geo;
	}

	/**
	 * 障害物（岩＋結晶鉱脈）メッシュの初期生成
	 */
	initMesh() {
		this.mesh = new THREE.Group();

		const bumpMap = (typeof MaterialLibrary !== 'undefined') ? MaterialLibrary.getRockBumpTexture() : null;
		const roughnessMap = (typeof MaterialLibrary !== 'undefined') ? MaterialLibrary.getRockRoughnessTexture() : null;

		const mat = new THREE.MeshStandardMaterial({
			color: this.color,
			vertexColors: true,
			roughness: 0.86,
			metalness: 0.16,
			flatShading: true,
			bumpMap: bumpMap,
			bumpScale: 0.28,
			roughnessMap: roughnessMap,
			envMapIntensity: 0.95
		});

		// ポリゴン数を適正化しつつ 4 パターンの岩塊を作成（従来の 5120 面は廃止し最大 1280 面へ最適化）
		const geomType = Math.floor(Math.random() * 4);
		this.geometryType = geomType;
		const detailTable = [1, 2, 2, 3];
		const seed = 10 + Math.random() * 500;
		const geo = this._createAsteroidGeometry(this.baseHitRadius, detailTable[geomType], seed);

		const rock = new THREE.Mesh(geo, mat);
		rock.name = 'rock';
		rock.castShadow = true;
		rock.receiveShadow = true;
		this.rockMesh = rock;
		this.mesh.add(rock);

		this.mesh.visible = false;
		this.scene.add(this.mesh);
	}

	/**
	 * オブジェクトプールからの再利用時初期化
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 */
	init(x, y, z) {
		this.mesh.position.set(x, y, z);
		this.mesh.rotation.set(0, 0, 0);

		this.active = true;
		this.mesh.visible = true;

		const game = window.game;
		const stage = game && game.stageManager ? game.stageManager.getCurrentStage() : null;
		const bounds = getCaveBoundsAt(z, stage);

		// 1. 岩のサイズ（Scale）を洞窟幅に応じてクランプ（進路ふさぎ防止）
		const caveW = bounds.right - bounds.left;
		const caveH = bounds.top - bounds.bottom;
		const minPassableSpace = 8.0;
		const maxAllowedRadius = Math.max(0.8, (Math.min(caveW, caveH) - minPassableSpace) * 0.5);

		let baseMinScale = 0.4;
		let baseMaxScale = 2.5;
		switch (this.geometryType) {
			case 0:
				baseMinScale = 0.4;
				baseMaxScale = 1.0;
				break;
			case 1:
				baseMinScale = 0.8;
				baseMaxScale = 2.2;
				break;
			case 2:
				baseMinScale = 1.4;
				baseMaxScale = 4.0;
				break;
			case 3:
				baseMinScale = 2.0;
				baseMaxScale = 6.5;
				break;
		}

		const randomScale = baseMinScale + Math.random() * (baseMaxScale - baseMinScale);
		const maxScaleLimit = maxAllowedRadius / this.baseHitRadius;
		const finalScale = Math.max(baseMinScale, Math.min(randomScale, maxScaleLimit));

		this.hitRadius = this.baseHitRadius * finalScale;

		if (this.rockMesh) {
			const rx = finalScale * (0.82 + Math.random() * 0.36);
			const ry = finalScale * (0.82 + Math.random() * 0.36);
			const rz = finalScale * (0.82 + Math.random() * 0.36);
			this.rockMesh.scale.set(rx, ry, rz);
		}

		// 2. 岩石の色を褐色系・スレートグレー系でバリエーション付与
		const isBrown = Math.random() < 0.5;
		const rockColor = new THREE.Color();
		if (isBrown) {
			const r = 0.38 + Math.random() * 0.22;
			const g = r * (0.50 + Math.random() * 0.14);
			const b = g * (0.45 + Math.random() * 0.18);
			rockColor.setRGB(r, g, b);
		} else {
			const val = 0.28 + Math.random() * 0.24;
			rockColor.setRGB(val * 0.94, val * 0.98, val * 1.06);
		}

		if (this.rockMesh && this.rockMesh.material) {
			this.rockMesh.material.color.copy(rockColor);
			// 出現直後は透明から距離に応じて滑らかにフェードインさせる
			this.rockMesh.material.transparent = true;
			this.rockMesh.material.opacity = 0.0;
		}

		// 3. 3軸自転速度の設定
		this.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
		const minRotSpeed = 0.35;
		const maxRotSpeed = 0.85;
		const rotX = (minRotSpeed + Math.random() * (maxRotSpeed - minRotSpeed)) * (Math.random() < 0.5 ? 1 : -1);
		const rotY = (minRotSpeed + Math.random() * (maxRotSpeed - minRotSpeed)) * (Math.random() < 0.5 ? 1 : -1);
		const rotZ = (minRotSpeed + Math.random() * (maxRotSpeed - minRotSpeed)) * (Math.random() < 0.5 ? 1 : -1);
		this.rotationSpeed.set(rotX, rotY, rotZ);

		// 4. 壁および巨大結晶障害物との干渉を避けてクランプスポーン
		const marginX = this.hitRadius + 1.2;
		const marginY = this.hitRadius + 1.2;
		const spawnRangeX = bounds.right - bounds.left - marginX * 2;
		const spawnRangeY = bounds.top - bounds.bottom - marginY * 2;

		let spawnX = bounds.left + marginX + Math.random() * Math.max(0, spawnRangeX);
		let spawnY = bounds.bottom + marginY + Math.random() * Math.max(0, spawnRangeY);

		// 近傍の巨大結晶クラスターとの距離チェック（めり込み・進路挟み撃ち防止）
		const collisionMgr = game && game.collisionManager;
		if (collisionMgr && typeof collisionMgr._findHitCaveCrystal === 'function') {
			// 自機が岩と結晶の間を安全に抜けるためのクリアランスバッファを含める
			const clearanceRadius = this.hitRadius + 5.5;
			const testPos = new THREE.Vector3(spawnX, spawnY, z);
			let foundSafe = !collisionMgr._findHitCaveCrystal(testPos, clearanceRadius);

			for (let attempt = 0; attempt < 12 && !foundSafe; attempt++) {
				spawnX = bounds.left + marginX + Math.random() * Math.max(0, spawnRangeX);
				spawnY = bounds.bottom + marginY + Math.random() * Math.max(0, spawnRangeY);
				testPos.set(spawnX, spawnY, z);
				if (!collisionMgr._findHitCaveCrystal(testPos, clearanceRadius)) {
					foundSafe = true;
				}
			}

			// それでも近傍結晶と干渉する場合は、Z座標を前方へずらして結晶セグメントを完全に回避する
			if (!foundSafe) {
				z -= 16.0;
			}
		}

		this.mesh.position.set(spawnX, spawnY, z);
	}

	/**
	 * 毎フレームの更新処理
	 * @param {number} deltaTime
	 * @param {number} playerZ
	 * @param {number} scrollSpeed
	 */
	update(deltaTime, playerZ, scrollSpeed) {
		if (!this.active) return;

		this.mesh.rotation.x += this.rotationSpeed.x * deltaTime;
		this.mesh.rotation.y += this.rotationSpeed.y * deltaTime;
		this.mesh.rotation.z += this.rotationSpeed.z * deltaTime;

		// 奥の暗闇から近づくにつれて滑らかにフェードイン（距離 245 → 175 で 0.0 → 1.0）
		if (this.rockMesh && this.rockMesh.material && this.rockMesh.material.transparent) {
			const dist = Math.max(0, playerZ - this.mesh.position.z);
			const fade = Math.max(0.0, Math.min(1.0, (245.0 - dist) / 70.0));
			this.rockMesh.material.opacity = fade;
			if (fade >= 0.995) {
				this.rockMesh.material.opacity = 1.0;
				this.rockMesh.material.transparent = false;
			}
		}
	}

	/**
	 * 非活性化
	 */
	deactivate() {
		this.active = false;
		this.mesh.visible = false;
	}

	/**
	 * メモリ破棄
	 */
	destroy() {
		if (this.mesh) {
			this.scene.remove(this.mesh);
			this.mesh.traverse((child) => {
				if (child.isMesh) {
					if (child.geometry) child.geometry.dispose();
					if (child.material) {
						if (Array.isArray(child.material)) {
							child.material.forEach(m => m.dispose());
						} else {
							child.material.dispose();
						}
					}
				}
			});
		}
		this.mesh = null;
		this.rockMesh = null;
	}
}
