import * as THREE from 'three';
import { CONFIG, getLoopDifficulty } from './config.js';
import { getPlatformSlopeAngle, getPlatformSurfaceY, isWithinPlatformX } from './collision.js';
import { BarrelThrower } from './enemy.js';
import { textureFactory } from './graphics/textureFactory.js';
import { buildPowerHammerModel, buildPrincessNpcModel } from './graphics/modelBuilder.js';
import { HazardManager, stepMovingPlatforms, createEmptyHazardResult } from './hazardManager.js';
import { BossManager } from './boss.js';

const CAGE_VIBRATE_DURATION = 2.2;

/**
 * ステージの3D構築・アイテム/ゴール判定・ギミック更新・リソース解放を統括するクラス
 */
export class StageManager {
	/**
	 * @param {THREE.Scene} scene
	 */
	constructor(scene) {
		this.scene = scene;
		this.currentLevel = null;
		this.thrower = null;
		this.hazardManager = new HazardManager(this.scene);
		this.bossManager = new BossManager(this.scene);

		this._stageGroup = new THREE.Group();
		this._lightGroup = new THREE.Group();
		this._disposables = { geometries: [], materials: [] };
		this._itemEntries = [];
		this._platformVisuals = [];
		this._ladderVisuals = [];
		this._conveyorTextures = { fwd: null, rev: null };
		this._goalActor = null;
		this._sceneryUpdaters = [];
		this._sceneryHooks = {};
		this._upperDeckState = null;
		this._cageState = null;
		this._floorsCollapsed = false;
		this._collapseElapsed = 0;
		this._elapsed = 0;
	}

	_geo(g) {
		this._disposables.geometries.push(g);
		return g;
	}

	_mat(m) {
		this._disposables.materials.push(m);
		return m;
	}

	/**
	 * ステージ定義を読み込み、3Dシーンを構築する
	 * @param {object} levelDef
	 * @param {object} [qualityProfile]
	 * @param {object|null} [loopScaling]
	 */
	load(levelDef, qualityProfile = {}, loopScaling = null) {
		this.unload();
		this.currentLevel = levelDef;
		const difficulty = loopScaling || getLoopDifficulty(1);
		this._elapsed = 0;
		this._sceneryHooks = {};
		this._upperDeckState = null;
		this._cageState = null;
		this._floorsCollapsed = false;
		this._collapseElapsed = 0;
		for (const p of levelDef.platforms || []) {
			p.collapsed = false;
			if (p.hiddenOnUpperDeck && Number.isFinite(p.targetY)) {
				p.yStart = p.targetY;
				p.yEnd = p.targetY;
			}
			p.hidden = false;
		}
		for (const l of levelDef.ladders || []) {
			l.collapsed = false;
		}

		const theme = levelDef.theme || {};
		this.scene.background = new THREE.Color(theme.backgroundColor ?? 0x0d1522);
		this.scene.fog = new THREE.FogExp2(theme.fogColor ?? 0x0d1522, theme.fogDensity ?? 0.009);

		this.scene.add(this._lightGroup);
		this.scene.add(this._stageGroup);

		this._buildSkyDome(theme);
		this._setupStageLights(theme, qualityProfile);
		this._buildPlatforms(levelDef.platforms, theme, qualityProfile);
		this._buildLadders(levelDef.ladders, theme);
		this._buildSolidBoxes(levelDef.solidBoxes);
		this._buildItems(levelDef.items || []);
		this._buildGoal(levelDef.goal);

		if (levelDef.thrower) {
			this.thrower = new BarrelThrower(this.scene, levelDef.thrower, difficulty);
		}
		const extraChaserCount = Math.max(0, (difficulty.loop || 1) - 1);
		const baseChasers = levelDef.chasers || [];
		const extraChasers = (levelDef.loopExtraChasers || []).slice(0, extraChaserCount);
		const hazardLevelDef = extraChasers.length > 0
			? { ...levelDef, chasers: [...baseChasers, ...extraChasers] }
			: levelDef;
		this.hazardManager.load(hazardLevelDef, difficulty);
		if (levelDef.boss) {
			this.bossManager.load(levelDef.boss, levelDef.bounds, difficulty);
		}
		this._initUpperDeckState();
		this._initStage3CageState();

		if (typeof levelDef.buildScenery === 'function') {
			const tracker = {
				geo: (g) => this._geo(g),
				mat: (m) => this._mat(m)
			};
			const updaters = levelDef.buildScenery(this._stageGroup, tracker, qualityProfile, this._sceneryHooks);
			if (Array.isArray(updaters)) {
				this._sceneryUpdaters.push(...updaters);
			}
		}
	}

	_buildSkyDome(theme) {
		const skyMat = this._mat(new THREE.MeshBasicMaterial({
			map: textureFactory.getSunsetSkyTexture(),
			side: THREE.BackSide,
			fog: false,
			depthWrite: false
		}));
		if (theme.skyTint) {
			skyMat.color.setHex(theme.skyTint);
		}
		const skyDome = new THREE.Mesh(this._geo(new THREE.SphereGeometry(140, 24, 16)), skyMat);
		skyDome.position.set(0, 10, 0);
		this._stageGroup.add(skyDome);
	}

	_setupStageLights(theme, qualityProfile = {}) {
		const hemi = new THREE.HemisphereLight(
			theme.skyTopColor ?? 0x8bb6ff,
			theme.groundBounceColor ?? 0x452718,
			0.95
		);
		this._lightGroup.add(hemi);

		const shadowSize = qualityProfile.shadowMapSize ?? 2048;
		const main = new THREE.DirectionalLight(theme.mainLightColor ?? 0xffd5a6, 2.55);
		main.position.set(14, 30, 18);
		main.castShadow = true;
		main.shadow.mapSize.set(shadowSize, shadowSize);
		main.shadow.camera.near = 2;
		main.shadow.camera.far = 75;
		main.shadow.camera.left = -22;
		main.shadow.camera.right = 22;
		main.shadow.camera.top = 28;
		main.shadow.camera.bottom = -8;
		main.shadow.bias = -0.0005;
		main.shadow.normalBias = 0.025;
		this._lightGroup.add(main);

		// 立体感と金属エッジの反射を引き出す補助ライト
		const coolRim = new THREE.DirectionalLight(0x4ea8de, 1.05);
		coolRim.position.set(-18, 16, -14);
		this._lightGroup.add(coolRim);

		if (qualityProfile.enableExtraLights !== false) {
			// 中央近接の点光源ホットスポットを避け、全体へ均一に届く穏やかな正面フィルライトを使用
			const frontFill = new THREE.DirectionalLight(0xffebd2, 0.45);
			frontFill.position.set(-4, 10, 24);
			this._lightGroup.add(frontFill);
		}
	}

	_buildPlatforms(platforms, theme, qualityProfile = {}) {
		const girderColorHex = theme.girderHex ?? '#c84b26';
		const useBump = qualityProfile.enableBumpMaps !== false;
		const girderMat = this._mat(new THREE.MeshStandardMaterial({
			map: textureFactory.getGirderTexture(girderColorHex),
			bumpMap: useBump ? textureFactory.getGirderBumpTexture() : null,
			bumpScale: useBump ? 0.045 : 0,
			roughnessMap: useBump ? textureFactory.getSteelRoughnessTexture() : null,
			metalness: 0.78,
			roughness: 0.38
		}));
		const deckMat = this._mat(new THREE.MeshStandardMaterial({
			map: textureFactory.getDeckPlateTexture(),
			bumpMap: useBump ? textureFactory.getDeckBumpTexture() : null,
			bumpScale: useBump ? 0.04 : 0,
			roughnessMap: useBump ? textureFactory.getSteelRoughnessTexture() : null,
			metalness: 0.8,
			roughness: 0.36
		}));
		const trimMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x1d232f,
			metalness: 0.88,
			roughness: 0.28
		}));
		const edgeRailMat = this._mat(new THREE.MeshStandardMaterial({
			color: theme.ladderColor ?? 0xeab308,
			metalness: 0.55,
			roughness: 0.32
		}));
		const gratingMat = this._mat(new THREE.MeshStandardMaterial({
			map: textureFactory.getGratingTexture(),
			alphaTest: 0.32,
			side: THREE.DoubleSide,
			metalness: 0.84,
			roughness: 0.3
		}));
		const convFwdTex = textureFactory.getConveyorTexture(false);
		const convRevTex = textureFactory.getConveyorTexture(true);
		this._conveyorTextures.fwd = convFwdTex;
		this._conveyorTextures.rev = convRevTex;

		const convFwdMat = this._mat(new THREE.MeshStandardMaterial({
			map: convFwdTex,
			roughnessMap: useBump ? textureFactory.getSteelRoughnessTexture() : null,
			metalness: 0.45,
			roughness: 0.55
		}));
		const convRevMat = this._mat(new THREE.MeshStandardMaterial({
			map: convRevTex,
			roughnessMap: useBump ? textureFactory.getSteelRoughnessTexture() : null,
			metalness: 0.45,
			roughness: 0.55
		}));

		for (const p of platforms) {
			const dx = p.xMax - p.xMin;
			const dy = p.yEnd - p.yStart;
			const length = Math.hypot(dx, dy);
			const angle = getPlatformSlopeAngle(p);
			const depth = p.zHalfDepth * 2;
			const isConveyor = Math.abs(p.conveyorSpeed || 0) > 0.01;
			const topMat = isConveyor ? (p.conveyorSpeed < 0 ? convRevMat : convFwdMat) : deckMat;
			const hasCenterGrating = !isConveyor && !p.move && Math.abs(dy) < 0.05 && length >= 11.5;

			const beamGroup = new THREE.Group();
			beamGroup.position.set((p.xMin + p.xMax) * 0.5, (p.yStart + p.yEnd) * 0.5 - p.thickness * 0.5, p.zCenter);
			beamGroup.rotation.z = angle;

			if (hasCenterGrating) {
				// 中央区間のみ下が見える網目グレーチング歩道にし、Image 2 のような立体的な抜け感を演出
				const grateLen = 3.6;
				const sideLen = (length - grateLen) * 0.5;
				const sideGeo = this._geo(new THREE.BoxGeometry(sideLen, 0.14, depth));
				for (const side of [-1, 1]) {
					const wing = new THREE.Mesh(sideGeo, topMat);
					wing.position.set(side * (grateLen * 0.5 + sideLen * 0.5), p.thickness * 0.5 - 0.07, 0);
					wing.castShadow = true;
					wing.receiveShadow = true;
					beamGroup.add(wing);
				}

				const gratePlane = new THREE.Mesh(this._geo(new THREE.PlaneGeometry(grateLen, depth)), gratingMat);
				gratePlane.rotation.x = -Math.PI * 0.5;
				gratePlane.position.set(0, p.thickness * 0.5 - 0.01, 0);
				gratePlane.receiveShadow = true;
				beamGroup.add(gratePlane);

				// グレーチング下を支える細い格子枠フレーム
				const supportGeo = this._geo(new THREE.BoxGeometry(grateLen, 0.08, 0.16));
				for (const sz of [-depth * 0.36, 0, depth * 0.36]) {
					const sup = new THREE.Mesh(supportGeo, trimMat);
					sup.position.set(0, p.thickness * 0.5 - 0.11, sz);
					beamGroup.add(sup);
				}
			} else {
				const topPlate = new THREE.Mesh(
					this._geo(new THREE.BoxGeometry(length, 0.14, depth)),
					topMat
				);
				topPlate.position.y = p.thickness * 0.5 - 0.07;
				topPlate.castShadow = true;
				topPlate.receiveShadow = true;
				beamGroup.add(topPlate);
			}

			// 足場手前・奥エッジの立体セーフティトリムレール（視認性と質感を同時強化）
			const sideRailGeo = this._geo(new THREE.BoxGeometry(length, 0.07, 0.08));
			for (const sz of [-depth * 0.5 + 0.02, depth * 0.5 - 0.02]) {
				const edgeRail = new THREE.Mesh(sideRailGeo, edgeRailMat);
				edgeRail.position.set(0, p.thickness * 0.5 + 0.01, sz);
				beamGroup.add(edgeRail);
			}

			if (isConveyor) {
				// ベルトコンベア両端のドライブローラー＆軸受け装飾
				const rollerGeo = this._geo(new THREE.CylinderGeometry(0.18, 0.18, depth * 0.96, 12));
				const capGeo = this._geo(new THREE.CylinderGeometry(0.11, 0.11, depth * 1.04, 10));
				for (const side of [-1, 1]) {
					const roller = new THREE.Mesh(rollerGeo, trimMat);
					roller.rotation.x = Math.PI * 0.5;
					roller.position.set(side * (length * 0.5 - 0.12), p.thickness * 0.5 - 0.14, 0);
					beamGroup.add(roller);

					const axle = new THREE.Mesh(capGeo, edgeRailMat);
					axle.rotation.x = Math.PI * 0.5;
					axle.position.copy(roller.position);
					beamGroup.add(axle);
				}
			}

			const bottomFlange = new THREE.Mesh(
				this._geo(new THREE.BoxGeometry(length, 0.1, depth * 0.92)),
				girderMat
			);
			bottomFlange.position.y = -p.thickness * 0.5 + 0.05;
			bottomFlange.castShadow = true;
			bottomFlange.receiveShadow = true;
			beamGroup.add(bottomFlange);

			const webW = hasCenterGrating ? Math.max(2, (length - 4.0) * 0.5) : length;
			if (hasCenterGrating) {
				const webWingGeo = this._geo(new THREE.BoxGeometry(webW, p.thickness - 0.18, depth * 0.62));
				for (const side of [-1, 1]) {
					const wingWeb = new THREE.Mesh(webWingGeo, girderMat);
					wingWeb.position.set(side * (2.0 + webW * 0.5), -0.02, 0);
					wingWeb.castShadow = true;
					wingWeb.receiveShadow = true;
					beamGroup.add(wingWeb);
				}
			} else {
				const web = new THREE.Mesh(
					this._geo(new THREE.BoxGeometry(length, p.thickness - 0.18, depth * 0.62)),
					girderMat
				);
				web.position.y = -0.02;
				web.castShadow = true;
				web.receiveShadow = true;
				beamGroup.add(web);
			}

			// 鉄骨スティフナー（垂直リブ）
			const ribGeo = this._geo(new THREE.BoxGeometry(0.14, p.thickness - 0.06, depth * 0.96));
			const ribCount = Math.max(2, Math.floor(length / 2.8));
			for (let i = 0; i <= ribCount; i += 1) {
				const rx = -length * 0.5 + 0.35 + (i / ribCount) * (length - 0.7);
				if (hasCenterGrating && Math.abs(rx) < 1.65) {
					continue;
				}
				const rib = new THREE.Mesh(ribGeo, trimMat);
				rib.position.set(rx, -0.02, 0);
				beamGroup.add(rib);
			}

			this._stageGroup.add(beamGroup);
			this._platformVisuals.push({
				platform: p,
				group: beamGroup,
				basePos: [
					(p.xMin + p.xMax) * 0.5,
					(p.yStart + p.yEnd) * 0.5 - p.thickness * 0.5,
					p.zCenter
				],
				parts: this._captureGroupParts(beamGroup)
			});
		}
	}

	_buildLadders(ladders, theme) {
		const roughnessTex = textureFactory.getSteelRoughnessTexture();
		const ladderMat = this._mat(new THREE.MeshStandardMaterial({
			color: theme.ladderColor ?? 0xffb703,
			roughnessMap: roughnessTex,
			metalness: 0.88,
			roughness: 0.2
		}));
		const clampMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x334155,
			roughnessMap: roughnessTex,
			metalness: 0.9,
			roughness: 0.24
		}));
		const brokenMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x727d91,
			metalness: 0.55,
			roughness: 0.5
		}));

		for (const l of ladders) {
			const visualTop = l.broken ? l.climbMaxY : l.yTop;
			const height = Math.max(0.4, visualTop - l.yBottom);
			const mat = l.broken ? brokenMat : ladderMat;
			const railGeo = this._geo(new THREE.BoxGeometry(0.095, height, 0.125));
			const rungGeo = this._geo(new THREE.CylinderGeometry(0.04, 0.04, 0.74, 10));
			const sleeveGeo = this._geo(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10));
			const bracketGeo = this._geo(new THREE.BoxGeometry(0.18, 0.15, 0.28));
			const capGeo = this._geo(new THREE.BoxGeometry(0.115, 0.06, 0.145));

			const ladderGroup = new THREE.Group();
			ladderGroup.position.set(l.x, l.yBottom, l.z);

			for (const side of [-0.36, 0.36]) {
				const rail = new THREE.Mesh(railGeo, mat);
				rail.position.set(side, height * 0.5, 0);
				rail.castShadow = true;
				rail.receiveShadow = true;
				ladderGroup.add(rail);

				const cap = new THREE.Mesh(capGeo, clampMat);
				cap.position.set(side, height, 0);
				ladderGroup.add(cap);

				// 上下端の固定クランプ金具（宙浮き感を防ぐディテール）
				for (const by of [0.12, Math.max(0.24, height - 0.18)]) {
					const clamp = new THREE.Mesh(bracketGeo, clampMat);
					clamp.position.set(side, by, -0.08);
					ladderGroup.add(clamp);
				}
			}

			const stepSpacing = 0.42;
			const stepCount = Math.floor(height / stepSpacing);
			for (let i = 1; i <= stepCount; i += 1) {
				const ry = i * stepSpacing - 0.12;
				const rung = new THREE.Mesh(rungGeo, mat);
				rung.rotation.z = Math.PI * 0.5;
				rung.position.set(0, ry, 0);
				rung.castShadow = true;
				rung.receiveShadow = true;
				ladderGroup.add(rung);

				for (const side of [-0.36, 0.36]) {
					const sleeve = new THREE.Mesh(sleeveGeo, clampMat);
					sleeve.rotation.z = Math.PI * 0.5;
					sleeve.position.set(side, ry, 0);
					ladderGroup.add(sleeve);
				}
			}

			this._stageGroup.add(ladderGroup);
			this._ladderVisuals.push({
				ladder: l,
				group: ladderGroup,
				basePos: [l.x, l.yBottom, l.z],
				parts: this._captureGroupParts(ladderGroup)
			});
		}
	}

	_captureGroupParts(group) {
		return group.children.map((mesh, idx) => ({
			mesh,
			basePos: [mesh.position.x, mesh.position.y, mesh.position.z],
			baseRot: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
			vx: ((idx % 5) - 2) * 1.45,
			vy: 0.8 + (idx % 3) * 0.75,
			vz: (((idx * 3) % 5) - 2) * 0.55,
			vrx: ((idx % 3) - 1) * 2.4,
			vry: (((idx + 1) % 3) - 1) * 1.8,
			vrz: (idx % 2 === 0 ? 1 : -1) * (1.8 + (idx % 4) * 0.7),
			delay: (idx % 6) * 0.045
		}));
	}

	_buildSolidBoxes(solidBoxes) {
		const blockerMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x3f4959,
			metalness: 0.72,
			roughness: 0.4
		}));
		for (const box of solidBoxes) {
			if (box.invisible || box.id === 's3-cage-blocker') {
				continue;
			}
			const w = box.xMax - box.xMin;
			const h = box.yMax - box.yMin;
			const d = box.zMax - box.zMin;
			const mesh = new THREE.Mesh(this._geo(new THREE.BoxGeometry(w, h, d)), blockerMat);
			mesh.position.set((box.xMin + box.xMax) * 0.5, (box.yMin + box.yMax) * 0.5, (box.zMin + box.zMax) * 0.5);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			this._stageGroup.add(mesh);
		}
	}

	_buildItems(items) {
		const bonusMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xffd166,
			metalness: 0.68,
			roughness: 0.34,
			emissive: 0x6b4400,
			emissiveIntensity: 0.42
		}));
		const itemTracker = {
			geo: (g) => this._geo(g),
			mat: (m) => this._mat(m)
		};

		for (const item of items) {
			let group;
			if (item.type === 'hammer') {
				group = buildPowerHammerModel(itemTracker, { pivotAtGrip: false, scale: 1.06 });
				group.position.set(item.x, item.y, 0);
			} else {
				group = new THREE.Group();
				group.position.set(item.x, item.y, 0);
				// ボーナス用セーフティツール／エネルギーギア風オブジェクト（平滑面で四角いブルーム滲みを防ぐ）
				const ring = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.28, 0.08, 12, 24)), bonusMat);
				ring.castShadow = true;
				group.add(ring);
				const core = new THREE.Mesh(this._geo(new THREE.SphereGeometry(0.14, 14, 10)), bonusMat);
				group.add(core);
			}

			this._stageGroup.add(group);
			this._itemEntries.push({ data: item, mesh: group, baseY: item.y });
		}
	}

	/**
	 * ゴール地点：レスキュービーコン台座＋2.5頭身・可愛いデフォルメ姫キャラを構築する
	 */
	_buildGoal(goal) {
		if (!goal) {
			return;
		}
		const group = new THREE.Group();
		group.position.set(goal.x, goal.y, goal.z ?? 0);

		const padMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x223042,
			metalness: 0.8,
			roughness: 0.3
		}));
		const ringGlowMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x2ec4b6,
			emissive: 0x2ec4b6,
			emissiveIntensity: 1.5,
			roughness: 0.2
		}));

		const makeMesh = (g, m) => {
			const mesh = new THREE.Mesh(g, m);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			return mesh;
		};

		// レスキューパッド台座＋発光リング（ボス撃破条件付きゴールはプレイヤーと足高が揃う薄型デッキプレート）
		const isFinalShowcase = Boolean(goal.requireBossDefeat);
		const padHeight = isFinalShowcase ? 0.03 : 0.05;
		const pad = makeMesh(
			this._geo(new THREE.CylinderGeometry(isFinalShowcase ? 0.96 : 1.02, isFinalShowcase ? 1.02 : 1.16, padHeight, 24)),
			padMat
		);
		pad.position.y = padHeight * 0.5;
		group.add(pad);

		if (!isFinalShowcase) {
			const glowRing = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.96, 0.045, 8, 28)), ringGlowMat);
			glowRing.rotation.x = Math.PI * 0.5;
			glowRing.position.y = padHeight + 0.02;
			group.add(glowRing);
		}

		// 上品な4頭身プロポーションの姫キャラクター
		const tracker = {
			geo: (g) => this._geo(g),
			mat: (m) => this._mat(m)
		};
		const princess = buildPrincessNpcModel(tracker);
		princess.npc.position.set(0, padHeight, 0);
		princess.npc.rotation.y = isFinalShowcase ? Math.PI * 0.25 : Math.PI * 0.16;
		group.add(princess.npc);

		// 頭上の目標ダイヤサイン（救出中の目印。クリア祝福時は非表示にしてハート演出は使わない）
		const diamondMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x67e8f9,
			emissive: 0x0ea5e9,
			emissiveIntensity: 1.35,
			roughness: 0.2
		}));
		const beaconGroup = new THREE.Group();
		beaconGroup.position.set(0, 2.08, 0);
		const diamond = new THREE.Mesh(this._geo(new THREE.OctahedronGeometry(0.16, 0)), diamondMat);
		diamond.scale.set(0.85, 1.2, 0.85);
		beaconGroup.add(diamond);

		const beaconRing = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.28, 0.025, 6, 20)), ringGlowMat);
		beaconGroup.add(beaconRing);
		if (isFinalShowcase) {
			beaconGroup.scale.setScalar(0.68);
		}
		group.add(beaconGroup);

		const goalLight = new THREE.PointLight(0xffe8c8, 5, 11);
		goalLight.position.set(0, 2.4, 2.0);
		group.add(goalLight);

		this._stageGroup.add(group);
		this._goalActor = {
			group,
			baseY: goal.y,
			npcBaseY: padHeight,
			baseYaw: isFinalShowcase ? Math.PI * 0.25 : Math.PI * 0.16,
			npc: princess.npc,
			head: princess.head,
			npcLeftArm: princess.npcLeftArm,
			npcRightArm: princess.npcRightArm,
			signalBeacon: beaconGroup,
			heartRing: beaconRing,
			isFinalShowcase,
			celebrated: false,
			celebrationTime: 0,
			patrolX: 0,
			patrolDir: 1,
			patrolPause: 0.45,
			patrolWalkPhase: 0
		};
	}

	/**
	 * STAGE 3 用：姫のいる最上段デッキ（hiddenOnUpperDeck）を上空画面外に隠し、
	 * 姫・中央ノードとまとめて降下出現させられる初期状態を構築する
	 */
	_initUpperDeckState() {
		const deckPlatform = this.currentLevel?.platforms?.find((p) => p.hiddenOnUpperDeck);
		if (!deckPlatform) {
			this._upperDeckState = null;
			return;
		}
		const deckVisual = this._platformVisuals.find((pv) => pv.platform === deckPlatform);
		const targetY = deckPlatform.targetY ?? deckPlatform.yStart;
		const hiddenY = deckPlatform.hiddenY ?? targetY + 14.0;
		this._upperDeckState = {
			platform: deckPlatform,
			visual: deckVisual,
			targetY,
			hiddenY,
			currentY: hiddenY,
			phase: 'hidden',
			justLanded: false
		};
		this._resetUpperDeckToHidden();
	}

	_resetUpperDeckToHidden() {
		const u = this._upperDeckState;
		if (!u) {
			return;
		}
		u.phase = 'hidden';
		u.currentY = u.hiddenY;
		u.justLanded = false;
		u.platform.hidden = true;
		u.platform.yStart = u.hiddenY;
		u.platform.yEnd = u.hiddenY;
		if (u.visual) {
			u.visual.basePos[1] = u.hiddenY - u.platform.thickness * 0.5;
			u.visual.group.visible = false;
			u.visual.group.position.set(u.visual.basePos[0], u.visual.basePos[1], u.visual.basePos[2]);
		}
		if (this._goalActor?.group) {
			this._goalActor.group.visible = false;
			this._goalActor.group.position.y = u.hiddenY;
		}
		this.bossManager.setNodeVisualTransform('s3-node-top', { visible: false, y: u.hiddenY });
	}

	/**
	 * STAGE 3 用：檻付き最上段（姫＆最終ノード）＋ 3F 移動足場上の点滅発光スイッチを構築・初期化する
	 */
	_initStage3CageState() {
		const switchDef = this.currentLevel?.cageSwitch;
		const cageBlocker = this.currentLevel?.solidBoxes?.find((b) => b.id === 's3-cage-blocker');
		const deckState = this._upperDeckState;
		if (!switchDef || !cageBlocker || !deckState?.platform || !deckState?.visual) {
			this._cageState = null;
			return;
		}
		const moverPlatform = this.currentLevel.platforms.find((p) => p.id === switchDef.platformId) || null;
		const moverVisual = moverPlatform
			? (this._platformVisuals.find((pv) => pv.platform === moverPlatform) || null)
			: null;

		const cageVisual = this._buildStage3CageVisual(deckState.platform, deckState.visual);
		const switchVisual = this._buildStage3MoverSwitchVisual(switchDef, moverPlatform, moverVisual);

		this._cageState = {
			switchDef,
			cageBlocker,
			moverPlatform,
			moverVisual,
			cageVisual,
			switchVisual,
			phase: 'hidden', // hidden | caged | vibrating | shattering | broken
			vibrateElapsed: 0,
			vibrateExposure: 0,
			justShattered: false,
			shatterElapsed: 0,
			bumpCooldown: 0
		};
		this._resetStage3CageToHidden();
	}

	/**
	 * 姫と最終ノードを囲む鉄格子の檻＋破砕用パーツ群を最上段デッキの子階層として構築する
	 * （最上段デッキの上空からの降下にもそのまま追従する）
	 */
	_buildStage3CageVisual(deckPlatform, deckVisual) {
		const group = new THREE.Group();
		deckVisual.group.add(group);

		const barMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x64748b,
			metalness: 0.88,
			roughness: 0.24
		}));
		const frameMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x334155,
			metalness: 0.82,
			roughness: 0.34
		}));
		const lockMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xf87171,
			emissive: 0xdc2626,
			emissiveIntensity: 1.35,
			metalness: 0.55,
			roughness: 0.25
		}));

		const deckW = deckPlatform.xMax - deckPlatform.xMin;
		const halfX = deckW * 0.5 - 0.12;
		const halfZ = (deckPlatform.zHalfDepth || 1.45) - 0.09;
		const surfaceY = deckPlatform.thickness * 0.5;
		const cageH = 3.16;
		const midY = surfaceY + cageH * 0.5;
		const topY = surfaceY + cageH;

		const rawMeshes = [];
		const addPiece = (mesh, outDirX, outDirZ) => {
			mesh.castShadow = true;
			group.add(mesh);
			rawMeshes.push({ mesh, outDirX, outDirZ });
		};

		// 四隅の太い鉄柱
		const postGeo = this._geo(new THREE.BoxGeometry(0.16, cageH, 0.16));
		for (const sx of [-1, 1]) {
			for (const sz of [-1, 1]) {
				const post = new THREE.Mesh(postGeo, frameMat);
				post.position.set(sx * halfX, midY, sz * halfZ);
				addPiece(post, sx, sz);
			}
		}

		// 上部・中段の外周フレーム桟（前後＋左右）
		const longRailGeo = this._geo(new THREE.BoxGeometry(deckW * 0.98, 0.14, 0.14));
		const sideRailGeo = this._geo(new THREE.BoxGeometry(0.14, 0.14, halfZ * 2));
		for (const ry of [surfaceY + 1.56, topY]) {
			for (const sz of [-1, 1]) {
				const rail = new THREE.Mesh(longRailGeo, frameMat);
				rail.position.set(0, ry, sz * halfZ);
				addPiece(rail, 0, sz);
			}
			for (const sx of [-1, 1]) {
				const sideRail = new THREE.Mesh(sideRailGeo, frameMat);
				sideRail.position.set(sx * halfX, ry, 0);
				addPiece(sideRail, sx, 0);
			}
		}

		// 前後・左右の垂直鉄格子バー
		const barGeo = this._geo(new THREE.CylinderGeometry(0.055, 0.055, cageH, 8));
		for (let i = -4; i <= 4; i += 1) {
			const bx = i * 1.06;
			for (const sz of [-1, 1]) {
				const bar = new THREE.Mesh(barGeo, barMat);
				bar.position.set(bx, midY, sz * halfZ);
				addPiece(bar, Math.sign(bx) * 0.5 + (i * 0.12), sz);
			}
		}
		for (const bz of [-0.66, 0, 0.66]) {
			for (const sx of [-1, 1]) {
				const bar = new THREE.Mesh(barGeo, barMat);
				bar.position.set(sx * halfX, midY, bz);
				addPiece(bar, sx, Math.sign(bz) * 0.4);
			}
		}

		// 前面中央の赤いロックプレート＆錠前リング（施錠中であることを遠目でも明確に示す）
		const lockPlate = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.92, 0.56, 0.2)), lockMat);
		lockPlate.position.set(0, surfaceY + 1.56, halfZ + 0.05);
		addPiece(lockPlate, 0, 1.4);

		const shackle = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.24, 0.055, 8, 16, Math.PI)), frameMat);
		shackle.position.set(0, surfaceY + 1.84, halfZ + 0.05);
		addPiece(shackle, 0, 1.4);

		const pieces = rawMeshes.map((entry, idx) => {
			const m = entry.mesh;
			const spread = ((idx % 5) - 2) * 0.55;
			return {
				mesh: m,
				basePos: [m.position.x, m.position.y, m.position.z],
				baseRot: [m.rotation.x, m.rotation.y, m.rotation.z],
				vx: entry.outDirX * (3.2 + (idx % 3) * 0.9) + spread,
				vy: 2.2 + (idx % 4) * 1.05,
				vz: (entry.outDirZ || (idx % 2 === 0 ? 0.6 : -0.6)) * (2.6 + (idx % 3) * 0.8),
				vrx: ((idx % 3) - 1) * 4.2,
				vry: (((idx + 1) % 3) - 1) * 3.4,
				vrz: (idx % 2 === 0 ? 1 : -1) * (3.2 + (idx % 4) * 1.1),
				delay: (idx % 4) * 0.025
			};
		});

		return { group, pieces, lockMat };
	}

	/**
	 * 3F 左右スライド移動足場（s3-mover-2）上に載る点滅・淡光解除スイッチを構築する
	 */
	_buildStage3MoverSwitchVisual(switchDef, moverPlatform, moverVisual) {
		const group = new THREE.Group();
		if (moverVisual && moverPlatform) {
			group.position.set(0, moverPlatform.thickness * 0.5, 0);
			moverVisual.group.add(group);
		} else {
			group.position.set(1.5, 9.2, 0);
			this._stageGroup.add(group);
		}

		const baseMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x0f172a,
			metalness: 0.86,
			roughness: 0.26
		}));
		const collarMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xa5f3fc,
			emissive: 0x0891b2,
			emissiveIntensity: 0.95,
			metalness: 0.78,
			roughness: 0.2
		}));
		const buttonMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x67e8f9,
			emissive: 0x06b6d4,
			emissiveIntensity: 2.2,
			roughness: 0.18
		}));
		const beaconMat = this._mat(new THREE.MeshBasicMaterial({
			color: 0x67e8f9,
			transparent: true,
			opacity: 0.85
		}));
		const haloMat = this._mat(new THREE.MeshBasicMaterial({
			color: 0x38bdf8,
			transparent: true,
			opacity: 0.24,
			blending: THREE.AdditiveBlending,
			depthWrite: false
		}));
		const beamMat = this._mat(new THREE.MeshBasicMaterial({
			color: 0x22d3ee,
			transparent: true,
			opacity: 0.22,
			side: THREE.DoubleSide,
			blending: THREE.AdditiveBlending,
			depthWrite: false
		}));

		const pad = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.78, 0.9, 0.16, 20)), baseMat);
		pad.position.y = 0.08;
		pad.castShadow = true;
		pad.receiveShadow = true;
		group.add(pad);

		const collar = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.6, 0.06, 8, 22)), collarMat);
		collar.rotation.x = Math.PI * 0.5;
		collar.position.y = 0.16;
		group.add(collar);

		const button = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.5, 0.54, 0.24, 20)), buttonMat);
		button.position.y = 0.26;
		group.add(button);

		// 淡い光のオーラ球＆上空からも 3F 移動床の位置がひと目で分かる垂直ライト柱
		const halo = new THREE.Mesh(this._geo(new THREE.SphereGeometry(1.15, 16, 12)), haloMat);
		halo.position.y = 0.55;
		group.add(halo);

		const beam = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.28, 0.64, 4.2, 16, 1, true)), beamMat);
		beam.position.y = 2.25;
		group.add(beam);

		const beacon = new THREE.Mesh(this._geo(new THREE.OctahedronGeometry(0.32, 0)), beaconMat);
		beacon.position.y = 2.05;
		beacon.scale.set(0.95, 1.38, 0.95);
		group.add(beacon);

		const ring = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.76, 0.05, 8, 24)), beaconMat);
		ring.rotation.x = Math.PI * 0.5;
		ring.position.y = 0.28;
		group.add(ring);

		const pointLight = new THREE.PointLight(0x38bdf8, 0, 14, 1.35);
		pointLight.position.set(0, 1.1, 0.35);
		group.add(pointLight);

		return {
			group,
			button,
			buttonMat,
			beacon,
			beaconMat,
			ring,
			halo,
			haloMat,
			beam,
			beamMat,
			pointLight
		};
	}

	_resetStage3CageToHidden() {
		const cs = this._cageState;
		if (!cs) {
			return;
		}
		cs.phase = 'hidden';
		cs.vibrateElapsed = 0;
		cs.vibrateExposure = 0;
		cs.justShattered = false;
		cs.shatterElapsed = 0;
		cs.bumpCooldown = 0;
		cs.cageBlocker.disabled = true;

		if (cs.cageVisual) {
			cs.cageVisual.group.visible = false;
			for (const p of cs.cageVisual.pieces) {
				p.mesh.position.set(p.basePos[0], p.basePos[1], p.basePos[2]);
				p.mesh.rotation.set(p.baseRot[0], p.baseRot[1], p.baseRot[2]);
			}
		}

		const sv = cs.switchVisual;
		if (sv) {
			sv.group.visible = false;
			sv.button.position.y = 0.26;
			sv.buttonMat.color.setHex(0x67e8f9);
			sv.buttonMat.emissive.setHex(0x06b6d4);
			sv.buttonMat.emissiveIntensity = 2.2;
			sv.halo.visible = true;
			sv.beam.visible = true;
			sv.beacon.visible = true;
			sv.ring.visible = true;
			sv.pointLight.intensity = 0;
		}
	}

	_getMover2SwitchWorldPos() {
		const mp = this._cageState?.moverPlatform;
		if (!mp) {
			return { x: 1.5, y: 9.2 };
		}
		return {
			x: (mp.xMin + mp.xMax) * 0.5,
			y: mp.yStart
		};
	}

	/**
	 * 3つ目のノード（檻解除スイッチ）起動時に、檻破砕前の全鉄骨振動フェーズへ移行する
	 */
	_triggerCageVibration() {
		const cs = this._cageState;
		if (!cs || cs.phase !== 'caged') {
			return;
		}
		cs.phase = 'vibrating';
		cs.vibrateElapsed = 0;
		cs.vibrateExposure = 0;
		cs.justShattered = false;

		const sv = cs.switchVisual;
		if (sv) {
			sv.button.position.y = 0.06;
			sv.buttonMat.color.setHex(0x34d399);
			sv.buttonMat.emissive.setHex(0x10b981);
			sv.buttonMat.emissiveIntensity = 1.25;
			sv.halo.visible = false;
			sv.beam.visible = false;
			sv.beacon.visible = false;
			sv.ring.visible = false;
			sv.pointLight.intensity = 0;
		}
	}

	_triggerCageShatter() {
		const cs = this._cageState;
		if (!cs || (cs.phase !== 'caged' && cs.phase !== 'vibrating')) {
			return;
		}
		cs.phase = 'shattering';
		cs.shatterElapsed = 0;
		cs.cageBlocker.disabled = true;

		const sv = cs.switchVisual;
		if (sv) {
			sv.button.position.y = 0.06;
			sv.buttonMat.color.setHex(0x34d399);
			sv.buttonMat.emissive.setHex(0x10b981);
			sv.buttonMat.emissiveIntensity = 1.25;
			sv.halo.visible = false;
			sv.beam.visible = false;
			sv.beacon.visible = false;
			sv.ring.visible = false;
			sv.pointLight.intensity = 0;
		}
	}

	/**
	 * プレイヤー更新前に移動足場・コンベアベルト等のステージ動的座標を先読み更新する
	 * （プレイヤーの足場搬送と描画位置の1フレームずれを完全に防ぐ）
	 */
	updateDynamics(dt, quakeIntensity = 0) {
		this._elapsed += dt;
		if (!this.currentLevel) {
			return;
		}
		if (this._floorsCollapsed) {
			if (this._goalActor?.group && this.currentLevel?.goal) {
				const g = this.currentLevel.goal;
				this._goalActor.group.position.x = g.x;
				this._goalActor.group.position.y = this._upperDeckState ? this._upperDeckState.currentY : g.y;
			}
			this._updateCollapsedVisuals(dt);
			return;
		}
		if (this._upperDeckState?.phase === 'descending') {
			const u = this._upperDeckState;
			u.currentY = Math.max(u.targetY, u.currentY - 7.8 * dt);
			u.platform.yStart = u.currentY;
			u.platform.yEnd = u.currentY;
			if (u.visual) {
				u.visual.basePos[1] = u.currentY - u.platform.thickness * 0.5;
			}
			if (this._goalActor?.group) {
				this._goalActor.group.position.y = u.currentY;
			}
			this.bossManager.setNodeVisualTransform('s3-node-top', { visible: true, y: u.currentY });
			if (u.currentY <= u.targetY) {
				u.phase = 'ready';
				u.platform.hidden = false;
				u.justLanded = true;
			}
		}
		if (this._cageState?.phase === 'caged' && this._upperDeckState?.phase === 'descending') {
			const uy = this._upperDeckState.currentY;
			this._cageState.cageBlocker.yMin = uy - 0.45;
			this._cageState.cageBlocker.yMax = uy + 3.4;
		}
		if (this._cageState?.phase === 'vibrating') {
			const cs = this._cageState;
			cs.vibrateElapsed += dt;
			if (cs.vibrateElapsed >= CAGE_VIBRATE_DURATION) {
				this._triggerCageShatter();
				cs.justShattered = true;
			}
		}
		if (this._cageState?.phase === 'shattering') {
			const cs = this._cageState;
			cs.shatterElapsed += dt;
			for (const p of cs.cageVisual.pieces) {
				const t = Math.max(0, cs.shatterElapsed - p.delay);
				p.mesh.position.set(
					p.basePos[0] + p.vx * t,
					p.basePos[1] + p.vy * t - 14.0 * t * t,
					p.basePos[2] + p.vz * t
				);
				p.mesh.rotation.set(
					p.baseRot[0] + p.vrx * t,
					p.baseRot[1] + p.vry * t,
					p.baseRot[2] + p.vrz * t
				);
			}
			if (cs.shatterElapsed >= 2.2) {
				cs.phase = 'broken';
				cs.cageVisual.group.visible = false;
			}
		}
		stepMovingPlatforms(this.currentLevel.platforms, this._elapsed, dt);
		const cageQuake = this._cageState?.phase === 'vibrating' ? 1.0 : 0;
		const effectiveQuake = Math.max(quakeIntensity, cageQuake);
		const shaking = effectiveQuake > 0.01;
		for (let i = 0; i < this._platformVisuals.length; i += 1) {
			const pv = this._platformVisuals[i];
			const p = pv.platform;
			const isDynamicPos = Boolean(p.move);
			const baseX = isDynamicPos ? (p.xMin + p.xMax) * 0.5 : pv.basePos[0];
			const baseY = isDynamicPos ? (p.yStart + p.yEnd) * 0.5 - p.thickness * 0.5 : pv.basePos[1];
			const baseZ = isDynamicPos ? p.zCenter : pv.basePos[2];
			const ox = shaking ? Math.sin(this._elapsed * 56 + i * 1.7) * 0.09 * effectiveQuake : 0;
			const oy = shaking ? Math.cos(this._elapsed * 64 + i * 2.3) * 0.12 * effectiveQuake : 0;
			let impOx = 0;
			let impOy = 0;
			if (pv.impactTimer > 0) {
				pv.impactTimer = Math.max(0, pv.impactTimer - dt);
				const env = pv.impactDuration > 0 ? (pv.impactTimer / pv.impactDuration) : 0;
				const dampEnv = env * env;
				const phase = (pv.impactDuration - pv.impactTimer);
				impOy = -Math.sin(phase * 76) * pv.impactAmp * dampEnv;
				impOx = Math.cos(phase * 58) * (pv.impactAmp * 0.35) * dampEnv;
			}
			pv.group.position.set(baseX + ox + impOx, baseY + oy + impOy, baseZ);
		}
		for (let i = 0; i < this._ladderVisuals.length; i += 1) {
			const lv = this._ladderVisuals[i];
			const ox = shaking ? Math.sin(this._elapsed * 56 + i * 1.3) * 0.07 * effectiveQuake : 0;
			const oy = shaking ? Math.cos(this._elapsed * 64 + i * 1.9) * 0.09 * effectiveQuake : 0;
			lv.group.position.set(lv.basePos[0] + ox, lv.basePos[1] + oy, lv.basePos[2]);
		}
		if (this._goalActor?.group && this.currentLevel?.goal && this._upperDeckState?.phase !== 'descending') {
			const g = this.currentLevel.goal;
			const baseGoalY = this._upperDeckState ? this._upperDeckState.currentY : g.y;
			const gx = shaking ? Math.sin(this._elapsed * 56) * 0.08 * effectiveQuake : 0;
			const gy = shaking ? Math.cos(this._elapsed * 64) * 0.10 * effectiveQuake : 0;
			this._goalActor.group.position.x = g.x + gx;
			this._goalActor.group.position.y = baseGoalY + gy;
		}
		if (this._conveyorTextures.fwd) {
			this._conveyorTextures.fwd.offset.x = -(this._elapsed * 0.8) % 1;
		}
		if (this._conveyorTextures.rev) {
			this._conveyorTextures.rev.offset.x = (this._elapsed * 0.8) % 1;
		}
	}

	/**
	 * 姫のいる最上段足場（s3-catwalk-top）以外のすべての床と梯子を崩落状態へ遷移させる
	 */
	collapseStageExceptGoal() {
		if (!this.currentLevel || this._floorsCollapsed) {
			return;
		}
		this._floorsCollapsed = true;
		this._collapseElapsed = 0;
		if (this._cageState?.switchVisual) {
			this._cageState.switchVisual.group.visible = false;
			this._cageState.switchVisual.pointLight.intensity = 0;
		}

		for (const p of this.currentLevel.platforms || []) {
			if (p.id !== 's3-catwalk-top') {
				p.collapsed = true;
			}
		}
		for (const l of this.currentLevel.ladders || []) {
			l.collapsed = true;
		}

		// 各ビジュアルの現在位置・パーツごとの初速と高所からの連鎖遅延をセット
		for (let i = 0; i < this._platformVisuals.length; i += 1) {
			const pv = this._platformVisuals[i];
			if (!pv.platform.collapsed) {
				continue;
			}
			const tierDelay = Math.max(0, (21.0 - pv.basePos[1]) * 0.085);
			for (let j = 0; j < pv.parts.length; j += 1) {
				const part = pv.parts[j];
				part.x = part.basePos[0];
				part.y = part.basePos[1];
				part.z = part.basePos[2];
				part.rx = part.baseRot[0];
				part.ry = part.baseRot[1];
				part.rz = part.baseRot[2];
				part.curVx = part.vx + (i % 2 === 0 ? -0.6 : 0.6);
				part.curVy = part.vy * 0.45;
				part.curVz = part.vz;
				part.startDelay = tierDelay + (j % 6) * 0.055;
			}
		}
		for (let i = 0; i < this._ladderVisuals.length; i += 1) {
			const lv = this._ladderVisuals[i];
			const tierDelay = Math.max(0, (21.0 - lv.basePos[1]) * 0.085);
			for (let j = 0; j < lv.parts.length; j += 1) {
				const part = lv.parts[j];
				part.x = part.basePos[0];
				part.y = part.basePos[1];
				part.z = part.basePos[2];
				part.rx = part.baseRot[0];
				part.ry = part.baseRot[1];
				part.rz = part.baseRot[2];
				part.curVx = part.vx * 0.85;
				part.curVy = part.vy * 0.35;
				part.curVz = part.vz;
				part.startDelay = tierDelay + (j % 5) * 0.06;
			}
		}
	}

	_updateCollapsedVisuals(dt) {
		this._collapseElapsed += dt;
		const grav = 22.0;
		const stepDt = Math.min(0.05, Math.max(0.001, dt));

		const stepGroupParts = (parts) => {
			for (const part of parts) {
				if (this._collapseElapsed < part.startDelay) {
					part.mesh.position.set(
						part.basePos[0] + Math.sin(this._collapseElapsed * 68 + part.basePos[0]) * 0.08,
						part.basePos[1] - (this._collapseElapsed / Math.max(0.05, part.startDelay)) * 0.12,
						part.basePos[2]
					);
					continue;
				}
				part.curVy -= grav * stepDt;
				part.x += part.curVx * stepDt;
				part.y += part.curVy * stepDt;
				part.z += part.curVz * stepDt;
				part.rx += part.vrx * stepDt;
				part.ry += part.vry * stepDt;
				part.rz += part.vrz * stepDt;
				part.mesh.position.set(part.x, part.y, part.z);
				part.mesh.rotation.set(part.rx, part.ry, part.rz);
			}
		};

		for (const pv of this._platformVisuals) {
			if (!pv.platform.collapsed) {
				pv.group.position.set(pv.basePos[0], pv.basePos[1], pv.basePos[2]);
				continue;
			}
			stepGroupParts(pv.parts);
		}
		for (const lv of this._ladderVisuals) {
			stepGroupParts(lv.parts);
		}
	}

	/**
	 * 崩壊後にプレイヤーが姫のいる安全な最上段足場（s3-catwalk-top）上に留まっているか判定する
	 * @param {object} playerPhysics
	 * @returns {boolean}
	 */
	isPlayerSafeOnGoalDeck(playerPhysics) {
		const topDeck = this.currentLevel?.platforms?.find((p) => p.id === 's3-catwalk-top');
		if (!topDeck) {
			return true;
		}
		return (
			playerPhysics.x >= topDeck.xMin - 0.65 &&
			playerPhysics.x <= topDeck.xMax + 0.65 &&
			playerPhysics.y >= topDeck.yStart - 0.85
		);
	}

	/**
	 * 毎フレームのステージ更新（背景稼働・アイテム・ゴール・ギミック・ボス判定）
	 */
	update(playerPhysics, dt, hasHammer = false) {
		for (const updater of this._sceneryUpdaters) {
			updater(this._elapsed, dt);
		}

		const collectedItems = [];
		const px = playerPhysics.x;
		const py = playerPhysics.y + 0.75;

		for (const entry of this._itemEntries) {
			if (entry.data.collected) {
				continue;
			}
			entry.mesh.rotation.y += dt * 2.4;
			entry.mesh.position.y = entry.baseY + Math.sin(this._elapsed * 3.5 + entry.data.x) * 0.14;

			const dist = Math.hypot(px - entry.data.x, py - entry.data.y);
			if (dist <= 0.88) {
				entry.data.collected = true;
				entry.mesh.visible = false;
				collectedItems.push(entry.data);
			}
		}

		// 救助ターゲット姫：待機中は前で手を組んで左右に往復散歩、プレイヤーのデッキ到達後は軽く飛び跳ねて喜び、クリア時は手繋ぎ同期
		if (this._goalActor) {
			const ga = this._goalActor;
			const celebrated = Boolean(ga.celebrated);
			const g = this.currentLevel?.goal;
			const pz = playerPhysics.z ?? 0;
			const gz = g?.z ?? 0;
			const closeForHands = celebrated && g
				&& Math.abs(px - g.x) <= 0.88
				&& Math.abs(pz - gz) <= 0.14
				&& Math.abs(playerPhysics.y - g.y) <= 0.35
				&& (playerPhysics.celebrateSynced ?? true);
			const npcBaseY = ga.npcBaseY ?? 0.03;

			const goalPlatform = g
				? this.currentLevel?.platforms?.find((p) => (
					!p.hidden &&
					!p.collapsed &&
					Math.abs(getPlatformSurfaceY(p, g.x) - g.y) <= 0.25 &&
					g.x >= p.xMin - 0.1 &&
					g.x <= p.xMax + 0.1
				))
				: null;
			const playerOnGoalDeck = Boolean(
				goalPlatform &&
				Math.abs(playerPhysics.y - g.y) <= 0.65 &&
				playerPhysics.x >= goalPlatform.xMin - 0.2 &&
				playerPhysics.x <= goalPlatform.xMax + 0.2
			);

			if (celebrated) {
				ga.celebrationTime += dt * 5.2;
				ga.signalBeacon.visible = false;
			} else {
				ga.signalBeacon.visible = true;
				ga.signalBeacon.rotation.y += dt * 2.2;
				ga.signalBeacon.position.y = 2.08 + Math.sin(this._elapsed * 3.5) * 0.11;
			}

			const kArm = 1 - Math.exp(-14 * dt);
			const rotateNpcYawToward = (targetYaw, stiffness = 10) => {
				let diff = (targetYaw - ga.npc.rotation.y + Math.PI) % (Math.PI * 2) - Math.PI;
				if (diff < -Math.PI) {
					diff += Math.PI * 2;
				}
				ga.npc.rotation.y += diff * (1 - Math.exp(-stiffness * dt));
			};

			if (closeForHands) {
				ga.patrolX += (0 - ga.patrolX) * (1 - Math.exp(-12 * dt));
				ga.npc.position.x = ga.patrolX;
				if (g) {
					rotateNpcYawToward(px >= g.x ? Math.PI * 0.5 : -Math.PI * 0.5, 14);
				}
				const ct = Number.isFinite(playerPhysics.celebrateJumpPhase)
					? playerPhysics.celebrateJumpPhase
					: ga.celebrationTime;
				const bounce = Math.abs(Math.sin(ct)) * 0.028;
				const sway = Math.sin(ct) * 0.045;
				ga.npc.position.y = npcBaseY + bounce;
				ga.npc.rotation.z = 0;
				// 両腕を胸高さで前方へまっすぐ差し出し、プレイヤーの両手とタイミング・高さを合わせて繋ぐ（XZY回転順）
				const k = 1 - Math.exp(-18 * dt);
				ga.npcLeftArm.rotation.x += ((-1.5 - sway) - ga.npcLeftArm.rotation.x) * k;
				ga.npcLeftArm.rotation.y += (1.22 - ga.npcLeftArm.rotation.y) * k;
				ga.npcLeftArm.rotation.z += (-0.06 - ga.npcLeftArm.rotation.z) * k;
				ga.npcRightArm.rotation.x += ((-1.5 - sway) - ga.npcRightArm.rotation.x) * k;
				ga.npcRightArm.rotation.y += (-1.22 - ga.npcRightArm.rotation.y) * k;
				ga.npcRightArm.rotation.z += (0.06 - ga.npcRightArm.rotation.z) * k;
				if (ga.head) {
					ga.head.rotation.z = Math.sin(ct * 0.5) * 0.035;
					ga.head.rotation.x = 0.03;
				}
			} else if (celebrated || playerOnGoalDeck) {
				// プレイヤーがデッキに到達したら立ち止まってプレイヤー側を向き、軽く飛び跳ねて喜ぶ
				if (celebrated && Math.abs(ga.patrolX) > 0.01) {
					const step = Math.min(Math.abs(ga.patrolX), 2.2 * dt);
					ga.patrolX -= Math.sign(ga.patrolX) * step;
					ga.npc.position.x = ga.patrolX;
				}
				if (g) {
					const worldNpcX = g.x + ga.npc.position.x;
					const faceYaw = px >= worldNpcX ? Math.PI * 0.42 : -Math.PI * 0.42;
					rotateNpcYawToward(faceYaw, 12);
				}
				const t = this._elapsed;
				const joyPhase = t * 5.2;
				const hop = Math.abs(Math.sin(joyPhase)) * 0.055;
				ga.npc.position.y = npcBaseY + hop;
				ga.npc.rotation.z = Math.sin(joyPhase * 0.5) * 0.02;

				const armJoy = Math.sin(joyPhase) * 0.08;
				ga.npcLeftArm.rotation.x += ((-0.78 + armJoy) - ga.npcLeftArm.rotation.x) * kArm;
				ga.npcLeftArm.rotation.y += (0.2 - ga.npcLeftArm.rotation.y) * kArm;
				ga.npcLeftArm.rotation.z += (0.26 - ga.npcLeftArm.rotation.z) * kArm;
				ga.npcRightArm.rotation.x += ((-0.78 + armJoy) - ga.npcRightArm.rotation.x) * kArm;
				ga.npcRightArm.rotation.y += (-0.2 - ga.npcRightArm.rotation.y) * kArm;
				ga.npcRightArm.rotation.z += (-0.26 - ga.npcRightArm.rotation.z) * kArm;
				if (ga.head) {
					ga.head.rotation.z = Math.sin(joyPhase * 0.5) * 0.045;
					ga.head.rotation.x = -0.03;
				}
			} else {
				// 待機中：両手を上品に前で組み、デッキ上を左右に往復散歩する
				const patrolBound = 0.68;
				if (ga.patrolPause > 0) {
					ga.patrolPause = Math.max(0, ga.patrolPause - dt);
					rotateNpcYawToward(ga.baseYaw ?? 0.2, 6);
					ga.npc.position.y = npcBaseY;
					ga.npc.rotation.z += (0 - ga.npc.rotation.z) * kArm;
				} else {
					const walkSpeed = 1.02;
					ga.patrolX += ga.patrolDir * walkSpeed * dt;
					if (ga.patrolX >= patrolBound) {
						ga.patrolX = patrolBound;
						ga.patrolDir = -1;
						ga.patrolPause = 0.65;
					} else if (ga.patrolX <= -patrolBound) {
						ga.patrolX = -patrolBound;
						ga.patrolDir = 1;
						ga.patrolPause = 0.65;
					}
					ga.npc.position.x = ga.patrolX;
					ga.patrolWalkPhase += dt * 7.2;
					const stepBob = Math.abs(Math.sin(ga.patrolWalkPhase)) * 0.012;
					ga.npc.position.y = npcBaseY + stepBob;
					ga.npc.rotation.z = Math.sin(ga.patrolWalkPhase) * 0.022;
					rotateNpcYawToward(ga.patrolDir > 0 ? Math.PI * 0.36 : -Math.PI * 0.36, 8);
				}

				const swayBreath = Math.sin(this._elapsed * 1.8) * 0.015;
				ga.npcLeftArm.rotation.x += ((-0.46 + swayBreath) - ga.npcLeftArm.rotation.x) * kArm;
				ga.npcLeftArm.rotation.y += (0.0 - ga.npcLeftArm.rotation.y) * kArm;
				ga.npcLeftArm.rotation.z += (0.44 - ga.npcLeftArm.rotation.z) * kArm;
				ga.npcRightArm.rotation.x += ((-0.46 + swayBreath) - ga.npcRightArm.rotation.x) * kArm;
				ga.npcRightArm.rotation.y += (0.0 - ga.npcRightArm.rotation.y) * kArm;
				ga.npcRightArm.rotation.z += (-0.44 - ga.npcRightArm.rotation.z) * kArm;
				if (ga.head) {
					ga.head.rotation.z = Math.sin(this._elapsed * 1.4) * 0.03;
					ga.head.rotation.x = Math.sin(this._elapsed * 1.1) * 0.02;
				}
			}
		}

		let reachedGoal = false;
		if (this.currentLevel?.goal && !this.currentLevel.goal.requireBossDefeat) {
			const g = this.currentLevel.goal;
			const distGoal = Math.hypot(px - g.x, playerPhysics.y - g.y);
			if (distGoal <= g.radius) {
				reachedGoal = true;
			}
		}

		let spawnedBarrel = null;
		let hitByThrower = false;
		if (this.thrower) {
			spawnedBarrel = this.thrower.update(dt);
			hitByThrower = this.thrower.checkPlayerCollision(playerPhysics);
		}

		const hazardResult = this._floorsCollapsed
			? createEmptyHazardResult()
			: this.hazardManager.update(this.currentLevel, playerPhysics, hasHammer, dt);
		for (const slam of hazardResult.pressSlams) {
			this.triggerPlatformImpactShake(slam.x, slam.y);
		}
		const bossResult = this.bossManager.update(playerPhysics, dt);

		// 左右オーバーロードノード起動に連動して縦支柱を倒壊させる（中央支柱はクライマックス振動後に倒壊）
		for (const node of bossResult.activatedNodes) {
			if (node.pillarTarget && node.pillarTarget !== 'center' && typeof this._sceneryHooks.triggerPillarFall === 'function') {
				this._sceneryHooks.triggerPillarFall(node.pillarTarget);
			}
		}
		if (bossResult.pillarFallTriggeredNow && typeof this._sceneryHooks.triggerPillarFall === 'function') {
			this._sceneryHooks.triggerPillarFall('center');
		}

		// 左右のノード起動＆左右支柱が完全に落下消滅したら、上空から姫のいる床・姫・中央ノードを降下開始する
		let upperDeckDescendingNow = false;
		let unlockedTopNodeNow = false;
		const topNode = this.bossManager.state?.nodes?.find((n) => n.id === 's3-node-top');
		if (topNode && topNode.unlocked === false) {
			const leftNode = this.bossManager.state.nodes.find((n) => n.id === 's3-node-left');
			const rightNode = this.bossManager.state.nodes.find((n) => n.id === 's3-node-right');
			const leftDone = Boolean(leftNode?.triggered) && (this._sceneryHooks.isPillarRemoved?.('left') ?? true);
			const rightDone = Boolean(rightNode?.triggered) && (this._sceneryHooks.isPillarRemoved?.('right') ?? true);
			if (leftDone && rightDone) {
				if (this._upperDeckState) {
					if (this._upperDeckState.phase === 'hidden') {
						const u = this._upperDeckState;
						u.phase = 'descending';
						if (u.visual) {
							u.visual.group.visible = true;
						}
						if (this._goalActor?.group) {
							this._goalActor.group.visible = true;
						}
						this.bossManager.setNodeVisualTransform('s3-node-top', { visible: true, y: u.currentY });
						upperDeckDescendingNow = true;
					} else if (this._upperDeckState.justLanded) {
						this._upperDeckState.justLanded = false;
						this.bossManager.setNodeVisualTransform('s3-node-top', { visible: true, y: topNode.y });
						if (this._cageState) {
							this._cageState.cageBlocker.yMin = topNode.y - 0.45;
							this._cageState.cageBlocker.yMax = topNode.y + 3.4;
						} else {
							unlockedTopNodeNow = this.bossManager.unlockNode('s3-node-top');
						}
					}
				} else {
					unlockedTopNodeNow = this.bossManager.unlockNode('s3-node-top');
				}
			}
		}

		// 檻付きデッキ降下と同時に 3F 移動足場の点滅ボタンを表示し、踏まれたら全鉄骨振動を経て鉄格子を砕き最終ノードを解放する
		let cageSwitchUnlockedNow = false;
		let cageSwitchPos = null;
		let cageVibrateStartedNow = false;
		let cageShatteredNow = false;
		let cageShakeOffPlayer = false;
		let cageQuakeIntensity = 0;
		let cagePos = null;
		let cageBumpNow = false;
		const cs = this._cageState;
		if (cs && !this._floorsCollapsed) {
			if (upperDeckDescendingNow && cs.phase === 'hidden') {
				cs.phase = 'caged';
				cs.cageBlocker.disabled = false;
				cs.cageBlocker.yMin = this._upperDeckState.currentY - 0.45;
				cs.cageBlocker.yMax = this._upperDeckState.currentY + 3.4;
				if (cs.cageVisual) {
					cs.cageVisual.group.visible = true;
				}
				if (cs.switchVisual) {
					cs.switchVisual.group.visible = true;
				}
				cageSwitchUnlockedNow = true;
				cageSwitchPos = this._getMover2SwitchWorldPos();
			}

			if (cs.phase === 'caged') {
				const pulse = 0.5 + 0.5 * Math.sin(this._elapsed * 6.4);
				const glow = 0.3 + 0.7 * Math.pow(pulse, 1.35);
				const sv = cs.switchVisual;
				if (sv) {
					sv.beacon.rotation.y += dt * 3.2;
					sv.beacon.position.y = 2.05 + Math.sin(this._elapsed * 4.5) * 0.18;
					sv.beaconMat.opacity = 0.42 + 0.54 * glow;
					sv.buttonMat.emissiveIntensity = 1.0 + 2.0 * glow;
					sv.haloMat.opacity = 0.08 + 0.24 * glow;
					sv.halo.scale.setScalar(0.92 + 0.24 * glow);
					sv.beamMat.opacity = 0.08 + 0.22 * glow;
					sv.pointLight.intensity = 3.2 * glow;
					sv.ring.scale.setScalar(0.95 + 0.55 * Math.abs(Math.sin(this._elapsed * 5.0)));
				}
				if (cs.cageVisual?.lockMat) {
					cs.cageVisual.lockMat.emissiveIntensity = 0.9 + 0.75 * (0.5 + 0.5 * Math.sin(this._elapsed * 5.2));
				}

				const py = playerPhysics.y ?? 0;
				cs.bumpCooldown = Math.max(0, cs.bumpCooldown - dt);
				if (
					cs.bumpCooldown <= 0 &&
					py >= cs.cageBlocker.yMin - 0.15 &&
					py <= cs.cageBlocker.yMax &&
					Math.abs(px) >= 5.05 &&
					Math.abs(px) <= 6.05
				) {
					cageBumpNow = true;
					cs.bumpCooldown = 0.65;
				}

				const swPos = this._getMover2SwitchWorldPos();
				const radius = cs.switchDef.radius ?? 1.2;
				if (
					Math.abs(px - swPos.x) <= radius &&
					Math.abs(py - swPos.y) <= 1.25
				) {
					this._triggerCageVibration();
					cageVibrateStartedNow = true;
					cageSwitchPos = swPos;
					cageQuakeIntensity = 1.0;
				}
			}

			if (cs.phase === 'vibrating') {
				cageQuakeIntensity = 1.0;
				if (cs.cageVisual?.lockMat) {
					cs.cageVisual.lockMat.emissiveIntensity = 2.2;
				}
				if ((playerPhysics.grounded || playerPhysics.onLadder) && playerPhysics.y > 0.8) {
					cs.vibrateExposure += dt;
					if (cs.vibrateExposure >= CONFIG.BOSS.QUAKE_EXPOSURE_LIMIT) {
						cs.vibrateExposure = 0;
						cageShakeOffPlayer = true;
					}
				} else {
					cs.vibrateExposure = Math.max(0, cs.vibrateExposure - dt * 1.4);
				}
			}

			if (cs.justShattered) {
				cs.justShattered = false;
				unlockedTopNodeNow = this.bossManager.unlockNode('s3-node-top');
				cageShatteredNow = true;
				cageSwitchPos = this._getMover2SwitchWorldPos();
				cagePos = {
					x: 0,
					y: this._upperDeckState?.targetY ?? 22.0
				};
			}
		}

		// 中央支柱2本が倒壊消滅したタイミングで、姫のいる床以外のすべての床と梯子を崩落させる
		if (bossResult.collapseTriggeredNow) {
			this.collapseStageExceptGoal();
			if (this.hazardManager?.group) {
				this.hazardManager.group.visible = false;
			}
		}

		return {
			collectedItems,
			reachedGoal,
			spawnedBarrel,
			hitPlayer: hitByThrower,
			hazardResult,
			bossResult,
			upperDeckDescendingNow,
			unlockedTopNodeNow,
			cageSwitchUnlockedNow,
			cageSwitchPos,
			cageVibrateStartedNow,
			cageShatteredNow,
			cageShakeOffPlayer,
			cageQuakeIntensity,
			cagePos,
			cageBumpNow,
			floorsCollapsed: this._floorsCollapsed
		};
	}

	/**
	 * プレス機が床へ接地した瞬間に、該当する鉄骨ビームだけを短時間振動させる
	 * @param {number} x
	 * @param {number} y
	 * @param {number} [duration]
	 * @param {number} [amplitude]
	 */
	triggerPlatformImpactShake(x, y, duration = 0.22, amplitude = 0.085) {
		for (const pv of this._platformVisuals) {
			const p = pv.platform;
			if (!p || p.hidden || p.collapsed) {
				continue;
			}
			if (!isWithinPlatformX(p, x, 0.25)) {
				continue;
			}
			const surfY = getPlatformSurfaceY(p, x);
			if (Math.abs(surfY - y) <= 0.45) {
				pv.impactTimer = duration;
				pv.impactDuration = duration;
				pv.impactAmp = amplitude;
			}
		}
	}

	/**
	 * クリア時・ボス撃破時の姫キャラクター祝福演出を起動する
	 */
	triggerGoalCelebration() {
		if (!this._goalActor) {
			return;
		}
		this._goalActor.celebrated = true;
		this._goalActor.celebrationTime = 0;
		this._goalActor.signalBeacon.visible = false;
	}

	resetStageEntities(options = {}) {
		const keepBonus = Boolean(options.keepBonusCollected);
		this._floorsCollapsed = false;
		this._collapseElapsed = 0;
		for (const p of this.currentLevel?.platforms || []) {
			p.collapsed = false;
		}
		for (const l of this.currentLevel?.ladders || []) {
			l.collapsed = false;
		}
		for (const pv of this._platformVisuals) {
			pv.group.position.set(pv.basePos[0], pv.basePos[1], pv.basePos[2]);
			for (const part of pv.parts || []) {
				part.mesh.position.set(part.basePos[0], part.basePos[1], part.basePos[2]);
				part.mesh.rotation.set(part.baseRot[0], part.baseRot[1], part.baseRot[2]);
			}
		}
		for (const lv of this._ladderVisuals) {
			lv.group.position.set(lv.basePos[0], lv.basePos[1], lv.basePos[2]);
			for (const part of lv.parts || []) {
				part.mesh.position.set(part.basePos[0], part.basePos[1], part.basePos[2]);
				part.mesh.rotation.set(part.baseRot[0], part.baseRot[1], part.baseRot[2]);
			}
		}
		this._sceneryHooks.resetPillars?.();

		for (const entry of this._itemEntries) {
			if (keepBonus && entry.data.type === 'bonus') {
				continue;
			}
			entry.data.collected = false;
			entry.mesh.visible = true;
		}
		if (this._goalActor) {
			this._goalActor.celebrated = false;
			this._goalActor.celebrationTime = 0;
			this._goalActor.patrolX = 0;
			this._goalActor.patrolDir = 1;
			this._goalActor.patrolPause = 0.45;
			this._goalActor.patrolWalkPhase = 0;
			this._goalActor.npc.position.set(0, this._goalActor.npcBaseY ?? 0.03, 0);
			this._goalActor.npc.rotation.set(0, this._goalActor.baseYaw ?? 0, 0);
			this._goalActor.npcLeftArm.rotation.set(-0.46, 0, 0.44);
			this._goalActor.npcRightArm.rotation.set(-0.46, 0, -0.44);
			this._goalActor.signalBeacon.visible = true;
			this._goalActor.signalBeacon.position.set(0, 2.08, 0);
			this._goalActor.signalBeacon.scale.setScalar(this._goalActor.isFinalShowcase ? 0.68 : 1.0);
			if (this._goalActor.heartRing) {
				this._goalActor.heartRing.visible = true;
			}
		}
		if (this.thrower) {
			this.thrower.reset();
		}
		this.hazardManager.reset();
		if (this.hazardManager?.group) {
			this.hazardManager.group.visible = true;
		}
		this.bossManager.reset();
		this._resetUpperDeckToHidden();
		this._resetStage3CageToHidden();
	}

	unload() {
		if (this.thrower) {
			this.thrower.dispose();
			this.thrower = null;
		}
		this.hazardManager.clear();
		this.bossManager.clear();
		while (this._stageGroup.children.length > 0) {
			this._stageGroup.remove(this._stageGroup.children[0]);
		}
		while (this._lightGroup.children.length > 0) {
			this._lightGroup.remove(this._lightGroup.children[0]);
		}
		this.scene.remove(this._stageGroup);
		this.scene.remove(this._lightGroup);

		for (const g of this._disposables.geometries) {
			g.dispose();
		}
		for (const m of this._disposables.materials) {
			m.dispose();
		}
		this._disposables.geometries.length = 0;
		this._disposables.materials.length = 0;
		this._itemEntries.length = 0;
		this._platformVisuals.length = 0;
		this._ladderVisuals.length = 0;
		this._sceneryUpdaters.length = 0;
		this._sceneryHooks = {};
		this._upperDeckState = null;
		this._cageState = null;
		this._floorsCollapsed = false;
		this._collapseElapsed = 0;
		this._goalActor = null;
		this.currentLevel = null;
	}
}
