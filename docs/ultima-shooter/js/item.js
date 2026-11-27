/**
 * @fileoverview item.js
 * アイテムクラス。回復・弾薬補充・ショットパワーアップ・バリアの
 * 立体 PBR＋発光コアモデル生成、オービタル回転アニメーション、
 * キャプションキャッシュ、および自機への磁力吸い寄せロジックを管理する。
 */

// 一時変数（GC対策）
const _itemTempVec = new THREE.Vector3();

class Item {
	/**
	 * @param {THREE.Scene} scene - レンダラーのシーンオブジェクト
	 */
	constructor(scene) {
		/** @type {THREE.Scene} */
		this.scene = scene;

		/** @type {THREE.Group} アイテムルートグループ */
		this.mesh = null;
		/** @type {Object<string, THREE.Group>} タイプ別事前構築サブモデル */
		this.typeModels = {};
		/** @type {THREE.Object3D|null} 外周オービタルリング参照（独立回転用） */
		this.activeOrbitRing = null;

		/** @type {boolean} アクティブ状態か */
		this.active = false;
		/** @type {string} アイテムのタイプ ('BULLET' | 'HEAL' | 'POWERUP' | 'BARRIER') */
		this.type = 'BULLET';
		/** @type {number} 個別の効果値 (弾薬補充量や回復量) */
		this.value = 0;

		/** @type {THREE.Sprite|null} アイテム上部に浮かぶ文字スプライト */
		this.captionSprite = null;

		// ポップアップ（飛び出す放物線演出）用
		this.vy = 0.0;
		this.popupTimer = 0.0;

		// パラメータ
		this.speed = GameConfig.items.speed;
		this.hitRadius = GameConfig.items.hitRadius;

		this.initGeometries();
		this.initMesh();
	}

	/**
	 * タイプ別の 3D ジオメトリと共有マテリアルを初回のみ初期化・キャッシュ
	 */
	initGeometries() {
		if (Item.geometries) return;

		// 1. HEAL: ベベル付き立体クリスタルハート
		const heartShape = new THREE.Shape();
		heartShape.moveTo(0, 0);
		heartShape.bezierCurveTo(-0.25, 0.25, -0.5, 0, -0.5, -0.25);
		heartShape.bezierCurveTo(-0.5, -0.55, -0.2, -0.8, 0, -1.05);
		heartShape.bezierCurveTo(0.2, -0.8, 0.5, -0.55, 0.5, -0.25);
		heartShape.bezierCurveTo(0.5, 0, 0.25, 0.25, 0, 0);

		const heartGeo = new THREE.ExtrudeGeometry(heartShape, {
			depth: 0.16,
			bevelEnabled: true,
			bevelSegments: 2,
			steps: 1,
			bevelSize: 0.03,
			bevelThickness: 0.03
		});
		heartGeo.center();
		heartGeo.rotateZ(Math.PI);
		heartGeo.scale(0.72, 0.72, 0.72);

		// 2. BULLET: エナジーカートリッジ（多角形セル＋上下金属キャップ）
		const cellGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.44, 8);
		const capGeo = new THREE.CylinderGeometry(0.21, 0.22, 0.12, 8);
		const ribGeo = new THREE.BoxGeometry(0.05, 0.54, 0.06);

		// 3. POWERUP: 外周メタリックリング＋内周発光コア
		const powerOuterGeo = new THREE.TorusGeometry(0.36, 0.06, 6, 16);
		const powerInnerGeo = new THREE.TorusGeometry(0.27, 0.035, 6, 16);
		const powerCoreGeo = new THREE.OctahedronGeometry(0.17, 0);

		// 4. BARRIER: ベベル付き3Dスター＋ホログラム八面体ケージ
		const starShape = new THREE.Shape();
		const outerRadius = 0.34;
		const innerRadius = 0.15;
		for (let i = 0; i < 10; i++) {
			const r = (i % 2 === 0) ? outerRadius : innerRadius;
			const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
			const px = Math.cos(a) * r;
			const py = Math.sin(a) * r;
			if (i === 0) starShape.moveTo(px, py);
			else starShape.lineTo(px, py);
		}
		starShape.closePath();
		const starGeo = new THREE.ExtrudeGeometry(starShape, {
			depth: 0.10,
			bevelEnabled: true,
			bevelSegments: 1,
			bevelSize: 0.025,
			bevelThickness: 0.025
		});
		starGeo.center();

		const orbitRingGeo = new THREE.TorusGeometry(0.46, 0.028, 6, 20);
		const barrierCageGeo = new THREE.OctahedronGeometry(0.48, 0);

		Item.geometries = {
			heartGeo,
			cellGeo,
			capGeo,
			ribGeo,
			powerOuterGeo,
			powerInnerGeo,
			powerCoreGeo,
			starGeo,
			orbitRingGeo,
			barrierCageGeo
		};

		// 共有 PBR フレームマテリアル
		const frameDarkMat = new THREE.MeshStandardMaterial({
			color: 0x1d2530,
			metalness: 0.85,
			roughness: 0.22,
			flatShading: true,
			envMapIntensity: 1.5
		});

		const frameSilverMat = new THREE.MeshStandardMaterial({
			color: 0xc2d4e2,
			metalness: 0.90,
			roughness: 0.16,
			flatShading: true,
			envMapIntensity: 1.65
		});

		const makeGlowMat = (hex, boost = 3.0) => {
			const m = new THREE.MeshBasicMaterial({ color: hex });
			m.color.lerp(new THREE.Color(0xffffff), 0.18);
			m.color.multiplyScalar(boost);
			return m;
		};

		const makeCorePbrMat = (hex) => new THREE.MeshStandardMaterial({
			color: hex,
			emissive: hex,
			emissiveIntensity: 1.4,
			metalness: 0.45,
			roughness: 0.18,
			flatShading: true,
			envMapIntensity: 1.6
		});

		const cageMat = new THREE.MeshBasicMaterial({
			color: GameConfig.items.types.BARRIER.color,
			wireframe: true,
			transparent: true,
			opacity: 0.65
		});
		cageMat.color.multiplyScalar(2.4);

		Item.materials = {
			frameDark: frameDarkMat,
			frameSilver: frameSilverMat,
			healCore: makeCorePbrMat(GameConfig.items.types.HEAL.color),
			healGlow: makeGlowMat(GameConfig.items.types.HEAL.color, 2.8),
			bulletGlow: makeGlowMat(GameConfig.items.types.BULLET.color, 3.0),
			powerCore: makeGlowMat(0xffffff, 3.2),
			powerGlow: makeGlowMat(GameConfig.items.types.POWERUP.color, 3.0),
			barrierCore: makeCorePbrMat(GameConfig.items.types.BARRIER.color),
			barrierCage: cageMat
		};
	}

	/**
	 * 4タイプの立体アイテムモデルをプール用グループ内に事前構築（切替時アロケーションゼロ）
	 */
	initMesh() {
		const g = Item.geometries;
		const m = Item.materials;

		this.mesh = new THREE.Group();

		// 1. HEAL モデル: 立体クリスタルハート＋ジャイロチタンリング
		const healGroup = new THREE.Group();
		healGroup.add(new THREE.Mesh(g.heartGeo, m.healCore));
		const healRing = new THREE.Mesh(g.orbitRingGeo, m.frameSilver);
		healRing.name = 'orbitRing';
		healGroup.add(healRing);
		const healHalo = new THREE.Mesh(g.powerInnerGeo, m.healGlow);
		healHalo.scale.set(1.55, 1.55, 1.55);
		healHalo.rotation.x = Math.PI / 2;
		healGroup.add(healHalo);
		healGroup.visible = false;
		this.mesh.add(healGroup);
		this.typeModels.HEAL = healGroup;

		// 2. BULLET モデル: SFエナジーカートリッジ（発光セル＋上下金属キャップ＋3本保護リブ）
		const bulletGroup = new THREE.Group();
		bulletGroup.add(new THREE.Mesh(g.cellGeo, m.bulletGlow));
		const topCap = new THREE.Mesh(g.capGeo, m.frameDark);
		topCap.position.y = 0.27;
		bulletGroup.add(topCap);
		const botCap = new THREE.Mesh(g.capGeo, m.frameDark);
		botCap.position.y = -0.27;
		bulletGroup.add(botCap);
		for (let i = 0; i < 3; i++) {
			const angle = (i / 3) * Math.PI * 2;
			const rib = new THREE.Mesh(g.ribGeo, m.frameSilver);
			rib.position.set(Math.cos(angle) * 0.21, 0, Math.sin(angle) * 0.21);
			rib.rotation.y = -angle;
			bulletGroup.add(rib);
		}
		const bulletRing = new THREE.Mesh(g.orbitRingGeo, m.frameSilver);
		bulletRing.rotation.x = Math.PI / 2;
		bulletRing.scale.set(0.85, 0.85, 0.85);
		bulletRing.name = 'orbitRing';
		bulletGroup.add(bulletRing);
		bulletGroup.rotation.z = 0.35;
		bulletGroup.visible = false;
		this.mesh.add(bulletGroup);
		this.typeModels.BULLET = bulletGroup;

		// 3. POWERUP モデル: 交差ツインリング＋中央ホワイトゴールド・パワーコア
		const powerGroup = new THREE.Group();
		powerGroup.add(new THREE.Mesh(g.powerOuterGeo, m.frameDark));
		powerGroup.add(new THREE.Mesh(g.powerInnerGeo, m.powerGlow));
		const powerCross = new THREE.Mesh(g.powerInnerGeo, m.powerGlow);
		powerCross.rotation.y = Math.PI / 2;
		powerCross.name = 'orbitRing';
		powerGroup.add(powerCross);
		powerGroup.add(new THREE.Mesh(g.powerCoreGeo, m.powerCore));
		powerGroup.visible = false;
		this.mesh.add(powerGroup);
		this.typeModels.POWERUP = powerGroup;

		// 4. BARRIER モデル: 立体ゴールドスター＋ホログラム八面体シールドケージ
		const barrierGroup = new THREE.Group();
		barrierGroup.add(new THREE.Mesh(g.starGeo, m.barrierCore));
		const cage = new THREE.Mesh(g.barrierCageGeo, m.barrierCage);
		cage.name = 'orbitRing';
		barrierGroup.add(cage);
		barrierGroup.visible = false;
		this.mesh.add(barrierGroup);
		this.typeModels.BARRIER = barrierGroup;

		this.mesh.visible = false;
		this.scene.add(this.mesh);
	}

	/**
	 * オブジェクトプールから活性化される際の初期化
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @param {string} type - アイテムタイプ
	 * @param {number|null} [customValue=null] - 補充量などの値
	 */
	init(x, y, z, type, customValue = null) {
		this.type = type;

		// 対象タイプのサブモデルのみ表示
		this.activeOrbitRing = null;
		for (const key in this.typeModels) {
			const isTarget = key === type;
			this.typeModels[key].visible = isTarget;
			if (isTarget) {
				this.activeOrbitRing = this.typeModels[key].getObjectByName('orbitRing');
			}
		}

		this.mesh.position.set(x, y, z + 2.0);
		this.mesh.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, 0);
		this.mesh.scale.set(1.5, 1.5, 1.5);

		// ポップアップ放物線演出
		this.vy = 8.0 + Math.random() * 4.0;
		this.popupTimer = 0.5;

		if (type === 'BULLET') {
			this.value = (customValue !== null && customValue !== undefined) ? customValue : 30;
		} else if (type === 'HEAL') {
			this.value = (customValue !== null && customValue !== undefined) ? customValue : 20;
		} else {
			this.value = 0;
		}

		// 補充数/回復量に応じた接近速度
		if (type === 'BULLET') {
			if (this.value === 10) this.speed = -15.0;
			else if (this.value === 30) this.speed = 0.0;
			else this.speed = 15.0;
		} else if (type === 'HEAL') {
			if (this.value === 10) this.speed = -15.0;
			else if (this.value === 20) this.speed = 0.0;
			else this.speed = 15.0;
		} else {
			this.speed = GameConfig.items.speed;
		}

		this.createCaption();

		this.mesh.visible = true;
		this.active = true;
	}

	/**
	 * キャプションスプライト用テクスチャをキャッシュから取得（未生成時のみ Canvas 描画）
	 * @param {string} text
	 * @param {string} colorStr
	 * @returns {THREE.CanvasTexture}
	 */
	_getCaptionTexture(text, colorStr) {
		const cacheKey = `${text}_${colorStr}`;
		if (Item.captionTextureCache[cacheKey]) {
			return Item.captionTextureCache[cacheKey];
		}

		const canvas = document.createElement('canvas');
		canvas.width = 160;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');

		ctx.font = 'Bold 28px "Outfit", sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';

		// ネオングロー＋黒縁取りで高い視認性と洗練感を両立
		ctx.shadowColor = colorStr;
		ctx.shadowBlur = 10;
		ctx.strokeStyle = '#050810';
		ctx.lineWidth = 5;
		ctx.strokeText(text, 80, 32);

		ctx.fillStyle = colorStr;
		ctx.fillText(text, 80, 32);

		const texture = new THREE.CanvasTexture(canvas);
		Item.captionTextureCache[cacheKey] = texture;
		return texture;
	}

	/**
	 * アイテム上部にフロート表示されるテキストスプライトを生成
	 */
	createCaption() {
		this.destroyCaption();

		let text = '';
		let colorStr = '#ffffff';

		if (this.type === 'POWERUP') {
			text = 'POWER';
			colorStr = '#ff33ff';
		} else if (this.type === 'HEAL') {
			text = `+${this.value}`;
			colorStr = '#ff3366';
		} else if (this.type === 'BULLET') {
			text = `+${this.value}`;
			colorStr = '#00e5e8';
		} else if (this.type === 'BARRIER') {
			text = 'BARRIER';
			colorStr = '#ffd25a';
		}

		const texture = this._getCaptionTexture(text, colorStr);
		const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
		this.captionSprite = new THREE.Sprite(mat);
		this.captionSprite.scale.set(2.3, 0.92, 1.0);
		this.captionSprite.position.copy(this.mesh.position);
		this.captionSprite.position.y += 1.25;

		this.scene.add(this.captionSprite);
	}

	/**
	 * キャプションスプライトの破棄（テクスチャはキャッシュ共有のため解放しない）
	 */
	destroyCaption() {
		if (!this.captionSprite) return;
		this.scene.remove(this.captionSprite);
		if (this.captionSprite.material) {
			this.captionSprite.material.dispose();
		}
		this.captionSprite = null;
	}

	/**
	 * 毎フレームの更新処理
	 * @param {number} deltaTime
	 * @param {THREE.Vector3} playerPos
	 */
	update(deltaTime, playerPos) {
		if (!this.active) return;

		if (this.popupTimer > 0) {
			this.popupTimer -= deltaTime;
			this.vy -= 22.0 * deltaTime;
			this.mesh.position.y += this.vy * deltaTime;
			this.mesh.position.z += this.speed * 0.7 * deltaTime;
			this.mesh.position.y = Math.max(0.5, this.mesh.position.y);
		} else {
			this.mesh.position.z += this.speed * deltaTime;

			const dist = this.mesh.position.distanceTo(playerPos);
			let magnetRange = GameConfig.items.magnetRange;
			let magnetSpeed = GameConfig.items.magnetSpeed;

			if (this.type === 'HEAL' || this.type === 'BULLET') {
				magnetRange = 16.0;
				magnetSpeed = 25.0;
			}

			const isBehind = this.mesh.position.z > playerPos.z;
			if (!isBehind && dist < magnetRange) {
				_itemTempVec.subVectors(playerPos, this.mesh.position).normalize();
				const ratio = 1.0 - (dist / magnetRange);
				const pullSpeed = ratio * magnetSpeed;
				this.mesh.position.addScaledVector(_itemTempVec, pullSpeed * deltaTime);
			}
		}

		// 本体自転 + 外周オービタルリングの逆軸回転でホログラム感を演出
		this.mesh.rotation.y += 2.4 * deltaTime;
		this.mesh.rotation.x += 0.9 * deltaTime;
		if (this.activeOrbitRing) {
			this.activeOrbitRing.rotation.x += 3.2 * deltaTime;
			this.activeOrbitRing.rotation.z -= 2.2 * deltaTime;
		}

		if (this.captionSprite) {
			this.captionSprite.position.copy(this.mesh.position);
			this.captionSprite.position.y += 1.25;
		}
	}

	/**
	 * 非活性化
	 */
	deactivate() {
		this.active = false;
		this.mesh.visible = false;
		this.destroyCaption();
	}

	/**
	 * リソース完全破棄（ジオメトリ・マテリアルは静的キャッシュ共有のためここでは解放しない）
	 */
	destroy() {
		this.destroyCaption();
		if (this.mesh) {
			this.scene.remove(this.mesh);
		}
		this.mesh = null;
		this.typeModels = {};
		this.activeOrbitRing = null;
	}
}

// 静的キャッシュ
Item.geometries = null;
Item.materials = null;
Item.captionTextureCache = {};
