import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { getPlatformSurfaceY } from '../collision.js';
import { textureFactory } from '../graphics/textureFactory.js';
import {
	buildArticulatedRobotArm,
	buildControlConsole,
	buildIndustrialPipeRun,
	buildPitFireStand,
	buildTrussBeam
} from '../graphics/modelBuilder.js';

/**
 * STAGE 3: FINAL TOWER（巨大な機械塔＋最終ボス「OVERLORD MK-III」）の定義と背景構築
 * 高低差のある立体足場、複数梯子、落下障害物、電気・炎トラップを突破し、最上部でボスと対決する。
 */
export function createStage3Definition() {
	const floor0 = { id: 's3-floor-0', xMin: -15.5, xMax: 15.5, yStart: 0.0, yEnd: 0.0, thickness: 0.48, zCenter: 0, zHalfDepth: 1.5 };

	const floor1Left = { id: 's3-floor-1-left', xMin: -15.5, xMax: -1.8, yStart: 5.1, yEnd: 4.6, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };
	const floor1Right = { id: 's3-floor-1-right', xMin: 0.4, xMax: 15.5, yStart: 4.6, yEnd: 4.6, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };

	const floor2Left = { id: 's3-floor-2-left', xMin: -15.5, xMax: -2.6, yStart: 9.2, yEnd: 9.2, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };
	const mover2 = {
		id: 's3-mover-2',
		xMin: -0.4,
		xMax: 3.4,
		yStart: 9.2,
		yEnd: 9.2,
		thickness: 0.42,
		zCenter: 0,
		zHalfDepth: 1.45,
		move: { axis: 'x', amplitude: 2.3, speed: 1.5, phase: 0 }
	};
	const floor2Right = { id: 's3-floor-2-right', xMin: 5.6, xMax: 15.5, yStart: 9.2, yEnd: 9.2, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };

	const floor3Main = { id: 's3-floor-3-main', xMin: -15.5, xMax: 15.5, yStart: 13.8, yEnd: 13.8, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };

	// 最上部ボスアリーナ（5Fメイン戦闘デッキ＋6F左右上部キャットウォーク＋鉄格子付き頂上ノード台座）
	const arenaFloor = { id: 's3-arena-floor', xMin: -14.8, xMax: 14.8, yStart: 17.6, yEnd: 17.6, thickness: 0.48, zCenter: 0, zHalfDepth: 1.55 };
	const catwalkLeft = { id: 's3-catwalk-left', xMin: -13.6, xMax: -6.4, yStart: 20.6, yEnd: 20.6, thickness: 0.42, zCenter: 0, zHalfDepth: 1.45 };
	const catwalkRight = { id: 's3-catwalk-right', xMin: 6.4, xMax: 13.6, yStart: 20.6, yEnd: 20.6, thickness: 0.42, zCenter: 0, zHalfDepth: 1.45 };
	const catwalkTop = {
		id: 's3-catwalk-top',
		xMin: -5.2,
		xMax: 5.2,
		yStart: 22.0,
		yEnd: 22.0,
		thickness: 0.42,
		zCenter: 0,
		zHalfDepth: 1.45,
		hiddenOnUpperDeck: true,
		hiddenY: 36.0,
		targetY: 22.0
	};

	const platforms = [
		floor0,
		floor1Left,
		floor1Right,
		floor2Left,
		mover2,
		floor2Right,
		floor3Main,
		arenaFloor,
		catwalkLeft,
		catwalkRight,
		catwalkTop
	];

	const ladders = [
		// 1F → 2F（2本のルート）
		{ id: 's3-ladder-0-1-r', x: 13.4, yBottom: 0.0, yTop: 4.6, z: 1.52, halfWidth: 0.5 },
		{ id: 's3-ladder-0-1-c', x: 1.8, yBottom: 0.0, yTop: 4.6, z: 1.52, halfWidth: 0.5 },
		// 2F → 3F（2本のルート）
		{ id: 's3-ladder-1-2-l', x: -13.0, yBottom: getPlatformSurfaceY(floor1Left, -13.0), yTop: 9.2, z: 1.52, halfWidth: 0.5 },
		{ id: 's3-ladder-1-2-c', x: -4.2, yBottom: getPlatformSurfaceY(floor1Left, -4.2), yTop: 9.2, z: 1.52, halfWidth: 0.5 },
		// 3F → 4F（2本のルート）
		{ id: 's3-ladder-2-3-r', x: 13.2, yBottom: 9.2, yTop: 13.8, z: 1.52, halfWidth: 0.5 },
		{ id: 's3-ladder-2-3-c', x: 7.4, yBottom: 9.2, yTop: 13.8, z: 1.52, halfWidth: 0.5 },
		// 4F → 5Fボスアリーナ（左右2入口）
		{ id: 's3-ladder-3-4-l', x: -11.5, yBottom: 13.8, yTop: 17.6, z: 1.52, halfWidth: 0.5 },
		{ id: 's3-ladder-3-4-r', x: 11.5, yBottom: 13.8, yTop: 17.6, z: 1.52, halfWidth: 0.5 },
		// 5Fアリーナ → 6F左右キャットウォーク梯子
		{ id: 's3-ladder-4-top-l', x: -12.2, yBottom: 17.6, yTop: 20.6, z: 1.52, halfWidth: 0.5 },
		{ id: 's3-ladder-4-top-r', x: 12.2, yBottom: 17.6, yTop: 20.6, z: 1.52, halfWidth: 0.5 }
	];

	const electricTraps = [
		{ id: 's3-elec-0', x1: -2.0, y1: 0.05, x2: -2.0, y2: 2.35, period: 3.1, activeStart: 0.58, activeEnd: 0.9, phase: 0.2 },
		{ id: 's3-elec-2', x1: 9.8, y1: 9.25, x2: 9.8, y2: 11.6, period: 2.9, activeStart: 0.58, activeEnd: 0.9, phase: 1.4 }
	];

	const burners = [
		{ id: 's3-burner-0', x: -6.8, y: 0.0, dirX: 0, dirY: 1, length: 2.3, period: 3.2, activeStart: 0.55, activeEnd: 0.88, phase: 0.1 },
		{ id: 's3-burner-1', x: 7.4, y: 4.6, dirX: 0, dirY: 1, length: 2.3, period: 3.3, activeStart: 0.56, activeEnd: 0.9, phase: 0.7 },
		{ id: 's3-burner-2', x: -8.6, y: 9.2, dirX: 0, dirY: 1, length: 2.3, period: 3.0, activeStart: 0.56, activeEnd: 0.88, phase: 1.5 },
		{ id: 's3-burner-3', x: -3.2, y: 13.8, dirX: 0, dirY: 1, length: 2.3, period: 3.0, activeStart: 0.58, activeEnd: 0.9, phase: 1.2 }
	];

	const chasers = [
		{ id: 's3-chaser-2', x: 9.2, y: 4.96, dir: -1, speed: 2.9, initialAiDelay: 3.0 },
		{ id: 's3-chaser-1', x: 2.0, y: 14.16, dir: -1, speed: 3.15, initialAiDelay: 2.6 }
	];

	const loopExtraChasers = [
		{ id: 's3-chaser-loop2', x: -5.5, y: getPlatformSurfaceY(floor2Left, -5.5) + 0.36, dir: -1, speed: 3.05, initialAiDelay: 2.0 },
		{ id: 's3-chaser-loop3', x: -8.0, y: getPlatformSurfaceY(floor1Left, -8.0) + 0.36, dir: 1, speed: 3.2, initialAiDelay: 1.7 },
		{ id: 's3-chaser-loop4', x: 8.5, y: getPlatformSurfaceY(floor0, 8.5) + 0.36, dir: -1, speed: 3.35, initialAiDelay: 1.4 }
	];

	// 空中出現・床貫通の落下ビーム予告は不自然なため廃止し、床接地型の炎・高圧電撃へ統一
	const fallingHazards = [];

	const items = [
		{ id: 's3-bonus-1', type: 'bonus', x: 6.8, y: getPlatformSurfaceY(floor0, 6.8) + 0.85, collected: false },
		{ id: 's3-bonus-2', type: 'bonus', x: -8.5, y: getPlatformSurfaceY(floor1Left, -8.5) + 0.85, collected: false },
		{ id: 's3-hammer-1', type: 'hammer', x: -13.8, y: getPlatformSurfaceY(floor2Left, -13.8) + 2.05, collected: false },
		{ id: 's3-bonus-3', type: 'bonus', x: 4.8, y: getPlatformSurfaceY(floor3Main, 4.8) + 0.85, collected: false }
	];

	const goal = {
		x: -2.6,
		y: getPlatformSurfaceY(catwalkTop, -2.6),
		z: 0,
		radius: 1.25,
		requireBossDefeat: true
	};

	// 左右ノード起動後に 3F（左右スライドする動く床 s3-mover-2）へ出現する鉄格子解除ボタン＆檻ブロッカー
	const cageSwitch = {
		id: 's3-cage-switch',
		platformId: 's3-mover-2',
		radius: 1.2
	};

	const solidBoxes = [
		// 1F 左端の燃焼ピット台
		{ id: 's3-pit-guard', xMin: -15.6, xMax: -14.2, yMin: 0.0, yMax: 1.2, zMin: -1.35, zMax: 1.35 },
		{ id: 's3-cage-blocker', xMin: -5.3, xMax: 5.3, yMin: 21.6, yMax: 25.4, zMin: -1.6, zMax: 1.6, disabled: true }
	];

	const barrelDestroyZones = [
		{ xMin: -16.8, xMax: -14.0, yMin: -1.2, yMax: 1.6 }
	];

	const pitFires = [
		// 1F 左端の燃焼ピット台上の炎：飛び乗った際・炎に触れた際にミス判定とする
		{ id: 's3-pit-fire', xMin: -15.48, xMax: -14.22, yMin: 1.0, yMax: 2.55 }
	];

	const boss = {
		name: 'OVERLORD MK-III',
		x: 0,
		y: 17.6,
		z: -1.65,
		arenaFloorY: 17.6,
		nodes: [
			{ id: 's3-node-left', x: -9.5, y: getPlatformSurfaceY(catwalkLeft, -9.5), unlocked: true, pillarTarget: 'left' },
			{ id: 's3-node-right', x: 9.5, y: getPlatformSurfaceY(catwalkRight, 9.5), unlocked: true, pillarTarget: 'right' },
			{ id: 's3-node-top', x: 2.0, y: getPlatformSurfaceY(catwalkTop, 2.0), unlocked: false, requiresOtherNodes: true, pillarTarget: 'center' }
		]
	};

	return {
		id: 3,
		theme: {
			backgroundColor: 0x10182b,
			fogColor: 0x142038,
			fogDensity: 0.0052,
			skyTint: 0x5c73a8,
			skyTopColor: 0x9bb4ff,
			groundBounceColor: 0x4f2345,
			mainLightColor: 0xe6f0ff,
			girderHex: '#526085',
			ladderColor: 0x9fb3c8
		},
		spawn: {
			x: -12.5,
			y: getPlatformSurfaceY(floor0, -12.5),
			z: 0
		},
		bounds: {
			xMin: -15.5,
			xMax: 15.5,
			deathY: CONFIG.PLAYER.FALL_DEATH_Y
		},
		platforms,
		ladders,
		solidBoxes,
		barrelDestroyZones,
		pitFires,
		presses: [],
		burners,
		electricTraps,
		chasers,
		loopExtraChasers,
		fallingHazards,
		items,
		thrower: null,
		goal,
		cageSwitch,
		boss,
		pitEmitterPos: null,
		buildScenery: _buildFinalTowerScenery
	};
}

/**
 * STAGE 3 固有の巨大機械塔背景（高層タワー柱・リアクターコア柱・テスラコイル・警報ネオン）
 */
function _buildFinalTowerScenery(group, tracker, qualityProfile = {}, sceneryHooks = null) {
	const updaters = [];
	const useBump = qualityProfile.enableBumpMaps !== false;
	const roughnessTex = useBump ? textureFactory.getSteelRoughnessTexture() : null;
	const girderBumpTex = useBump ? textureFactory.getGirderBumpTexture() : null;

	// 左下端の燃焼ドラム缶ピット（全ステージ共通の揺らめく炎＋熾き炭床）
	updaters.push(buildPitFireStand(group, tracker, -14.8, 0.0, qualityProfile.enableExtraLights !== false));

	const towerSteelMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x475775,
		bumpMap: girderBumpTex,
		bumpScale: useBump ? 0.03 : 0,
		roughnessMap: roughnessTex,
		metalness: 0.84,
		roughness: 0.3
	}));
	const silverTrussMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xb0becf,
		roughnessMap: roughnessTex,
		metalness: 0.88,
		roughness: 0.24
	}));
	const chromePipeMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xdbe6f2,
		roughnessMap: roughnessTex,
		metalness: 0.92,
		roughness: 0.16
	}));
	const neonCyanMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xe0f7ff,
		emissive: 0x38bdf8,
		emissiveIntensity: 3.1,
		roughness: 0.12,
		metalness: 0.08
	}));
	const neonCyanGlassMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x38bdf8,
		emissive: 0x0ea5e9,
		emissiveIntensity: 1.25,
		transparent: true,
		opacity: 0.44,
		roughness: 0.1,
		metalness: 0.18
	}));
	const alertCrimsonMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf43f5e,
		emissive: 0xe11d48,
		emissiveIntensity: 0.95
	}));
	const amberCoreMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xfff3d6,
		emissive: 0xff8c1a,
		emissiveIntensity: 2.5,
		roughness: 0.16
	}));
	const cyanHaloMat = tracker.mat(new THREE.SpriteMaterial({
		map: textureFactory.getGlowSpriteTexture(),
		color: 0x38bdf8,
		transparent: true,
		opacity: 0.34,
		blending: THREE.AdditiveBlending,
		depthWrite: false
	}));
	const amberHaloMat = tracker.mat(new THREE.SpriteMaterial({
		map: textureFactory.getGlowSpriteTexture(),
		color: 0xffb703,
		transparent: true,
		opacity: 0.28,
		blending: THREE.AdditiveBlending,
		depthWrite: false
	}));
	const deepCavityMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x0a1020,
		metalness: 0.3,
		roughness: 0.88
	}));
	// 配管バルブ用の非発光マット塗装鋼鉄（背景で敵・アイテムに誤認されないよう発光させない）
	const valvePaintMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x991b1b,
		metalness: 0.45,
		roughness: 0.44
	}));

	// 0. 画面上下左右の全体を覆う巨大機械塔・外郭側壁＆下層連続構造（ステージ2と同等の全面スケール感）
	const backWallMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x2c3b57,
		map: textureFactory.getIndustrialWallTexture('#232f48', 12, 9),
		roughnessMap: roughnessTex,
		metalness: 0.62,
		roughness: 0.48
	}));
	const backPanel = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(170, 130, 2.0)), backWallMat);
	backPanel.position.set(0, 6.0, -13.0);
	backPanel.receiveShadow = true;
	group.add(backPanel);

	// 斜め視点・タイトル周回カメラでも左右端が切れないタワー側壁ウィング
	const sideWingGeo = tracker.geo(new THREE.BoxGeometry(12, 126, 30));
	for (const sx of [-52, 52]) {
		const wing = new THREE.Mesh(sideWingGeo, backWallMat);
		wing.position.set(sx, 6.0, -3.0);
		wing.receiveShadow = true;
		group.add(wing);
	}

	// 背面ウォールを区切る立体ピラスター柱＆水平建築ビーム（最下段の下 y=-36〜上空まで連続構造化）
	const pilasterGeo = tracker.geo(new THREE.BoxGeometry(1.4, 120, 1.4));
	for (const px of [-44, -32, -20.5, -10.2, 0, 10.2, 20.5, 32, 44]) {
		const pilaster = new THREE.Mesh(pilasterGeo, towerSteelMat);
		pilaster.position.set(px, 6.0, -11.4);
		pilaster.receiveShadow = true;
		group.add(pilaster);
	}
	const wallBandGeo = tracker.geo(new THREE.BoxGeometry(108, 0.85, 1.8));
	for (const by of [-22.0, -12.0, -3.5, 2.5, 11.5, 20.5, 28.0, 36.0]) {
		const band = new THREE.Mesh(wallBandGeo, towerSteelMat);
		band.position.set(0, by, -11.1);
		group.add(band);
	}

	// 外郭補助タワー骨格＆壁面冷却ルーバー換気ベイ
	const buttressGeo = tracker.geo(new THREE.CylinderGeometry(1.6, 1.8, 72, 14));
	for (const bx of [-25.5, 25.5]) {
		const buttress = new THREE.Mesh(buttressGeo, towerSteelMat);
		buttress.position.set(bx, 0, -7.8);
		group.add(buttress);
		for (const bandY of [-20, -10, 0, 10, 20, 28]) {
			const collar = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(1.7, 0.12, 8, 18)), silverTrussMat);
			collar.rotation.x = Math.PI * 0.5;
			collar.position.set(bx, bandY, -7.8);
			group.add(collar);
		}
	}

	const ventFrameGeo = tracker.geo(new THREE.BoxGeometry(2.6, 1.6, 0.55));
	const ventHoleGeo = tracker.geo(new THREE.BoxGeometry(2.1, 1.15, 0.25));
	const louverGeo = tracker.geo(new THREE.BoxGeometry(2.05, 0.08, 0.28));
	for (const vx of [-26.2, -15.4, 15.4, 26.2]) {
		for (const vy of [-7.0, 5.5, 14.5, 23.5]) {
			const ventFrame = new THREE.Mesh(ventFrameGeo, towerSteelMat);
			ventFrame.position.set(vx, vy, -11.85);
			group.add(ventFrame);
			const ventHole = new THREE.Mesh(ventHoleGeo, deepCavityMat);
			ventHole.position.set(vx, vy, -11.65);
			group.add(ventHole);
			for (let li = -1.5; li <= 1.5; li += 1) {
				const slat = new THREE.Mesh(louverGeo, silverTrussMat);
				slat.position.set(vx, vy + li * 0.22, -11.5);
				slat.rotation.x = 0.42;
				group.add(slat);
			}
		}
	}

	// 1. 巨大な垂直タワー主柱（左右・中央の4本：ノード起動に連動して外れ、ゆっくり傾いて落下消滅する）
	const pillarGeo = tracker.geo(new THREE.BoxGeometry(1.15, 30, 1.45));
	const conduitGeo = tracker.geo(new THREE.CylinderGeometry(0.22, 0.22, 30, 14));
	const flangeGeo = tracker.geo(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14));
	const bracketGeo = tracker.geo(new THREE.BoxGeometry(1.45, 0.55, 2.2));
	const pillarSpecs = [
		{ key: 'left', x: -14.8, fallDir: -1 },
		{ key: 'center-left', x: -6.2, fallDir: -1 },
		{ key: 'center-right', x: 6.2, fallDir: 1 },
		{ key: 'right', x: 14.8, fallDir: 1 }
	];
	const pillarEntries = new Map();
	for (const spec of pillarSpecs) {
		const pGroup = new THREE.Group();
		pGroup.position.set(spec.x, 0, -3.2);

		const pillar = new THREE.Mesh(pillarGeo, towerSteelMat);
		pillar.position.set(0, 8.5, -0.45);
		pillar.castShadow = true;
		pGroup.add(pillar);

		const conduit = new THREE.Mesh(conduitGeo, chromePipeMat);
		conduit.position.set(0, 8.5, 0.42);
		pGroup.add(conduit);

		for (let fy = -4.0; fy <= 22.0; fy += 4.4) {
			const flange = new THREE.Mesh(flangeGeo, silverTrussMat);
			flange.position.set(0, fy, 0.42);
			pGroup.add(flange);
		}
		for (const by of [0.0, 9.2, 17.6, 20.6]) {
			const joint = new THREE.Mesh(bracketGeo, silverTrussMat);
			joint.position.set(0, by, 0.5);
			pGroup.add(joint);
		}

		group.add(pGroup);
		pillarEntries.set(spec.key, {
			key: spec.key,
			baseX: spec.x,
			baseZ: -3.2,
			fallDir: spec.fallDir,
			group: pGroup,
			state: 'intact',
			elapsed: 0,
			vx: 0,
			vy: 0
		});
	}

	const getTargetKeys = (target) => {
		if (target === 'center') {
			return ['center-left', 'center-right'];
		}
		return [target];
	};

	if (sceneryHooks) {
		sceneryHooks.triggerPillarFall = (target) => {
			for (const key of getTargetKeys(target)) {
				const entry = pillarEntries.get(key);
				if (entry && entry.state === 'intact') {
					entry.state = 'falling';
					entry.elapsed = 0;
					entry.vx = entry.fallDir * 0.8;
					entry.vy = -1.2;
				}
			}
		};
		sceneryHooks.isPillarRemoved = (target) => {
			for (const key of getTargetKeys(target)) {
				const entry = pillarEntries.get(key);
				if (!entry || entry.state !== 'removed') {
					return false;
				}
			}
			return true;
		};
		sceneryHooks.getPillarState = (key) => pillarEntries.get(key)?.state ?? 'removed';
		sceneryHooks.resetPillars = () => {
			for (const entry of pillarEntries.values()) {
				entry.state = 'intact';
				entry.elapsed = 0;
				entry.vx = 0;
				entry.vy = 0;
				entry.group.visible = true;
				entry.group.position.set(entry.baseX, 0, entry.baseZ);
				entry.group.rotation.set(0, 0, 0);
			}
		};
	}

	updaters.push((_time, dt) => {
		for (const entry of pillarEntries.values()) {
			if (entry.state !== 'falling') {
				continue;
			}
			entry.elapsed += dt;
			if (entry.elapsed < 0.25) {
				// 接続ロック外れ直後の激しい震え
				entry.group.position.x = entry.baseX + Math.sin(entry.elapsed * 80) * 0.18;
				entry.group.rotation.z = -entry.fallDir * (entry.elapsed / 0.25) * 0.08;
				continue;
			}
			entry.vx += entry.fallDir * 2.4 * dt;
			entry.vy -= 24.0 * dt;
			entry.group.position.x += entry.vx * dt;
			entry.group.position.y += entry.vy * dt;
			const nextRot = entry.group.rotation.z - entry.fallDir * 0.62 * dt;
			entry.group.rotation.z = entry.fallDir < 0 ? Math.min(0.92, nextRot) : Math.max(-0.92, nextRot);
			if (entry.group.position.y <= -34) {
				entry.group.visible = false;
				entry.state = 'removed';
			}
		}
	});

	buildTrussBeam(group, tracker, 44.0, 0.95, 0.75, silverTrussMat, [0, 16.6, -4.6]);
	buildTrussBeam(group, tracker, 44.0, 0.85, 0.7, silverTrussMat, [0, 7.4, -4.6]);
	buildTrussBeam(group, tracker, 46.0, 0.95, 0.78, towerSteelMat, [0, -1.2, -4.4]);
	buildTrussBeam(group, tracker, 48.0, 1.05, 0.84, silverTrussMat, [0, -10.2, -4.8]);

	// 左右の高圧冷却パイプ＋制御コンソール＋タワー保守サーボアーム
	buildIndustrialPipeRun(
		group,
		tracker,
		[[-13.8, -28.0, -3.5], [-13.8, 18.0, -3.5], [-6.8, 18.0, -3.5], [-6.8, 32.0, -3.5]],
		0.36,
		towerSteelMat,
		silverTrussMat,
		valvePaintMat,
		true
	);
	buildIndustrialPipeRun(
		group,
		tracker,
		[[13.8, -28.0, -3.5], [13.8, 18.0, -3.5], [6.8, 18.0, -3.5], [6.8, 32.0, -3.5]],
		0.36,
		towerSteelMat,
		silverTrussMat,
		valvePaintMat,
		true
	);
	buildControlConsole(group, tracker, towerSteelMat, neonCyanMat, [-9.5, 0.0, -1.6], 0.25);
	buildControlConsole(group, tracker, towerSteelMat, alertCrimsonMat, [8.5, 17.6, -1.9], -0.25);

	const servoArms = [
		buildArticulatedRobotArm(group, tracker, silverTrussMat, towerSteelMat, neonCyanMat, [-11.4, 0.0, -2.5], 0.35, 1.0),
		buildArticulatedRobotArm(group, tracker, silverTrussMat, towerSteelMat, amberCoreMat, [11.4, 0.0, -2.5], -0.35, 1.0)
	];

	// 配管を背面壁・支柱へ固定する壁面クランプ金具（単独浮遊防止）
	const clampGeo = tracker.geo(new THREE.BoxGeometry(1.15, 0.42, 6.2));
	for (const sx of [-13.8, 13.8]) {
		for (const sy of [3.5, 9.5, 15.5]) {
			const clamp = new THREE.Mesh(clampGeo, silverTrussMat);
			clamp.position.set(sx, sy, -6.7);
			group.add(clamp);
		}
	}

	// 2. ボス背後の壁面固定型・巨大冷却タービンハウジング＆ガントリー架台（タイヤ誤認や浮遊感を解消）
	const gantryBeamGeo = tracker.geo(new THREE.BoxGeometry(13.2, 0.65, 3.8));
	for (const gy of [16.8, 25.4]) {
		const gantryBeam = new THREE.Mesh(gantryBeamGeo, towerSteelMat);
		gantryBeam.position.set(0, gy, -7.8);
		group.add(gantryBeam);
	}
	const wallAnchorGeo = tracker.geo(new THREE.BoxGeometry(0.75, 0.75, 4.4));
	for (const sx of [-5.2, 5.2]) {
		for (const sy of [17.4, 24.8]) {
			const strut = new THREE.Mesh(wallAnchorGeo, silverTrussMat);
			strut.position.set(sx, sy, -7.8);
			group.add(strut);
		}
	}

	const reactorGroup = new THREE.Group();
	reactorGroup.position.set(0, 21.0, -6.2);
	group.add(reactorGroup);

	// 円筒状の重厚な金属シュラウド外殻と背面バックプレート
	const housingBack = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(5.15, 5.15, 0.9, 28)), towerSteelMat);
	housingBack.rotation.x = Math.PI * 0.5;
	housingBack.position.z = -1.05;
	reactorGroup.add(housingBack);

	const outerRing = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(4.85, 0.36, 12, 36)), silverTrussMat);
	outerRing.position.z = 0.25;
	reactorGroup.add(outerRing);

	// 立体2層円形ネオンリング（リフレクタ溝＋白熱コア＋半透明ガラス管＋固定クランプ8基）
	const energyTrack = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(3.75, 0.22, 10, 36)), deepCavityMat);
	energyTrack.position.z = 0.22;
	reactorGroup.add(energyTrack);

	const energyRing = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(3.75, 0.085, 10, 36)), neonCyanMat);
	energyRing.position.z = 0.34;
	reactorGroup.add(energyRing);

	const energyGlass = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(3.75, 0.16, 12, 36)), neonCyanGlassMat);
	energyGlass.position.z = 0.34;
	reactorGroup.add(energyGlass);

	const reactorClampGeo = tracker.geo(new THREE.BoxGeometry(0.26, 0.42, 0.36));
	for (let ci = 0; ci < 8; ci += 1) {
		const ang = (ci / 8) * Math.PI * 2;
		const clamp = new THREE.Mesh(reactorClampGeo, silverTrussMat);
		clamp.position.set(Math.cos(ang) * 3.75, Math.sin(ang) * 3.75, 0.3);
		clamp.rotation.z = ang + Math.PI * 0.5;
		reactorGroup.add(clamp);
	}

	const reactorHalo = new THREE.Sprite(cyanHaloMat);
	reactorHalo.position.z = 0.45;
	reactorHalo.scale.set(11.5, 11.5, 1);
	reactorGroup.add(reactorHalo);

	const innerHubRing = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(2.55, 0.22, 10, 28)), silverTrussMat);
	innerHubRing.position.z = 0.36;
	reactorGroup.add(innerHubRing);

	const turbineCore = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(1.18, 1.38, 0.95, 16)), chromePipeMat);
	turbineCore.rotation.x = Math.PI * 0.5;
	turbineCore.position.z = 0.18;
	reactorGroup.add(turbineCore);

	// 各スポークは親グループで放射角度を決め、子メッシュ自身のY軸で羽根ピッチのみを傾ける（背面板へのめり込み防止）
	const turbineBlades = new THREE.Group();
	turbineBlades.position.z = 0.12;
	const reactorSpokeGeo = tracker.geo(new THREE.BoxGeometry(0.32, 9.0, 0.16));
	for (let i = 0; i < 6; i += 1) {
		const spokePivot = new THREE.Group();
		spokePivot.rotation.z = (i / 6) * Math.PI;
		const spoke = new THREE.Mesh(reactorSpokeGeo, silverTrussMat);
		spoke.rotation.y = 0.24;
		spokePivot.add(spoke);
		turbineBlades.add(spokePivot);
	}
	reactorGroup.add(turbineBlades);

	// 2b. 全階層＋下層を生き生きと動かす多段タービン・巨大発電フライホイール群
	const auxRotors = [];
	const buildTowerTurbine = (x, y, z, radius, bladeCount, speed, accentMat) => {
		const tGroup = new THREE.Group();
		tGroup.position.set(x, y, z);
		group.add(tGroup);

		const backPlate = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(radius * 1.05, radius * 1.05, 0.65, 24)), deepCavityMat);
		backPlate.rotation.x = Math.PI * 0.5;
		backPlate.position.z = -0.65;
		tGroup.add(backPlate);

		const shroud = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(radius, radius * 0.09, 10, 28)), towerSteelMat);
		shroud.position.z = 0.22;
		tGroup.add(shroud);

		// リフレクタ溝＋白熱コア＋半透明ガラス管＋固定クランプで立体的な円形照明を形成
		const glowRadius = radius * 0.78;
		const glowTrack = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(glowRadius, 0.17, 8, 28)), deepCavityMat);
		glowTrack.position.z = 0.2;
		tGroup.add(glowTrack);

		const glowRing = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(glowRadius, 0.07, 10, 28)), accentMat);
		glowRing.position.z = 0.3;
		tGroup.add(glowRing);

		const isCyanRing = accentMat === neonCyanMat;
		if (isCyanRing) {
			const glassRing = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(glowRadius, 0.135, 10, 28)), neonCyanGlassMat);
			glassRing.position.z = 0.3;
			tGroup.add(glassRing);
		}

		const tClampGeo = tracker.geo(new THREE.BoxGeometry(0.22, 0.34, 0.28));
		for (let ci = 0; ci < 6; ci += 1) {
			const ang = (ci / 6) * Math.PI * 2;
			const cl = new THREE.Mesh(tClampGeo, silverTrussMat);
			cl.position.set(Math.cos(ang) * glowRadius, Math.sin(ang) * glowRadius, 0.28);
			cl.rotation.z = ang + Math.PI * 0.5;
			tGroup.add(cl);
		}

		const haloSprite = new THREE.Sprite(isCyanRing ? cyanHaloMat : amberHaloMat);
		haloSprite.position.z = 0.42;
		haloSprite.scale.set(radius * 2.45, radius * 2.45, 1);
		tGroup.add(haloSprite);

		const rotor = new THREE.Group();
		rotor.position.z = 0.12;
		tGroup.add(rotor);

		const hub = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(radius * 0.24, radius * 0.28, 0.52, 14)), chromePipeMat);
		hub.rotation.x = Math.PI * 0.5;
		hub.position.z = 0.08;
		rotor.add(hub);

		const bladeGeo = tracker.geo(new THREE.BoxGeometry(radius * 0.14, radius * 1.84, 0.14));
		for (let i = 0; i < bladeCount; i += 1) {
			const bladePivot = new THREE.Group();
			bladePivot.rotation.z = (i / bladeCount) * Math.PI;
			const blade = new THREE.Mesh(bladeGeo, silverTrussMat);
			blade.rotation.y = 0.24;
			bladePivot.add(blade);
			rotor.add(bladePivot);
		}
		auxRotors.push({ rotor, glowRing, speed });
	};

	// 1〜2階背後の下段主タービン、3〜4階左右の補助冷却タービン、地下発電フライホイール群
	buildTowerTurbine(0.0, 5.4, -8.4, 4.1, 6, -0.5, neonCyanMat);
	buildTowerTurbine(-10.2, 13.0, -8.5, 2.8, 5, 0.85, amberCoreMat);
	buildTowerTurbine(10.2, 13.0, -8.5, 2.8, 5, -0.85, amberCoreMat);
	buildTowerTurbine(0.0, -6.2, -7.8, 5.6, 8, 0.35, amberCoreMat);
	buildTowerTurbine(-12.0, -7.8, -8.2, 3.8, 6, -0.48, neonCyanMat);
	buildTowerTurbine(12.0, -7.8, -8.2, 3.8, 6, 0.48, neonCyanMat);

	// 2c. 左右＆地下の巨大油圧パワープッシュ・ピストン機関（上下往復運動で機械塔の鼓動を表現）
	const towerPistons = [];
	const buildTowerPiston = (x, baseY, z, stroke, speed, phase, accentMat) => {
		const pRoot = new THREE.Group();
		pRoot.position.set(x, baseY, z);
		group.add(pRoot);

		const sleeve = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(1.15, 1.25, 7.5, 16)), towerSteelMat);
		pRoot.add(sleeve);

		const sleeveCollar = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(1.26, 0.14, 8, 20)), silverTrussMat);
		sleeveCollar.rotation.x = Math.PI * 0.5;
		sleeveCollar.position.y = 3.7;
		pRoot.add(sleeveCollar);

		const pistonHead = new THREE.Group();
		pRoot.add(pistonHead);

		const chromeRod = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.55, 0.55, 9.5, 14)), chromePipeMat);
		chromeRod.position.y = 4.5;
		pistonHead.add(chromeRod);

		const crown = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(1.38, 1.38, 1.4, 16)), towerSteelMat);
		crown.position.y = 9.0;
		pistonHead.add(crown);

		const powerBand = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(1.42, 0.1, 8, 20)), accentMat);
		powerBand.rotation.x = Math.PI * 0.5;
		powerBand.position.y = 9.0;
		pistonHead.add(powerBand);

		towerPistons.push({ pistonHead, stroke, speed, phase });
	};

	buildTowerPiston(-19.2, 3.0, -6.4, 3.4, 2.2, 0.0, neonCyanMat);
	buildTowerPiston(19.2, 3.0, -6.4, 3.4, 2.2, Math.PI, neonCyanMat);
	buildTowerPiston(-19.2, 16.5, -6.4, 2.6, 2.2, 1.1, amberCoreMat);
	buildTowerPiston(19.2, 16.5, -6.4, 2.6, 2.2, 1.1 + Math.PI, amberCoreMat);

	// 2d. 高電圧エネルギー伝送パイロン＆上昇エネルギーリング（左右から塔頂コアへエネルギー供給）
	const conduitRings = [];
	for (const px of [-21.5, 21.5]) {
		const mast = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.32, 0.42, 54, 12)), towerSteelMat);
		mast.position.set(px, 2.0, -5.6);
		group.add(mast);

		const coreRod = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.14, 0.14, 52, 10)), chromePipeMat);
		coreRod.position.set(px, 2.0, -5.1);
		group.add(coreRod);

		const emitterSphere = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.62, 14, 12)), neonCyanMat);
		emitterSphere.position.set(px, 28.5, -5.6);
		group.add(emitterSphere);

		const emitterGlass = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.92, 16, 14)), neonCyanGlassMat);
		emitterGlass.position.set(px, 28.5, -5.6);
		group.add(emitterGlass);

		const emitterCage = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(0.96, 0.07, 8, 20)), silverTrussMat);
		emitterCage.position.set(px, 28.5, -5.6);
		group.add(emitterCage);

		const emitterHalo = new THREE.Sprite(cyanHaloMat);
		emitterHalo.position.set(px, 28.5, -5.2);
		emitterHalo.scale.set(4.6, 4.6, 1);
		group.add(emitterHalo);

		for (let ri = 0; ri < 3; ri += 1) {
			const pulseRing = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(0.75, 0.09, 8, 20)), neonCyanMat);
			pulseRing.rotation.x = Math.PI * 0.5;
			pulseRing.position.set(px, 0, -5.35);
			group.add(pulseRing);
			conduitRings.push({ ring: pulseRing, offset: ri / 3 + (px > 0 ? 0.15 : 0) });
		}
	}

	// 2e. 上空ガントリレールを往復巡回する自動検査クレーン・トロリー
	const gantryRail = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(38, 0.55, 0.7)), silverTrussMat);
	gantryRail.position.set(0, 26.8, -6.6);
	group.add(gantryRail);

	const gantryTrolley = new THREE.Group();
	gantryTrolley.position.set(0, 26.2, -6.6);
	group.add(gantryTrolley);

	const trolleyBody = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(2.4, 0.9, 1.3)), towerSteelMat);
	gantryTrolley.add(trolleyBody);
	const trolleyLamp = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.24, 10, 8)), amberCoreMat);
	trolleyLamp.position.set(0, -0.6, 0.45);
	gantryTrolley.add(trolleyLamp);
	const trolleyArm = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.12, 0.12, 1.5, 8)), chromePipeMat);
	trolleyArm.position.set(0, -1.0, 0);
	gantryTrolley.add(trolleyArm);

	// 地下深層のリアクター排熱グロー帯
	const lowerCoreGlow = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(32.0, 0.75, 2.8)), amberCoreMat);
	lowerCoreGlow.position.set(0, -13.0, -9.8);
	group.add(lowerCoreGlow);

	// 3. 左右タワー外郭の全高警報スタンション塔＋ケージ付き警告灯（空中浮遊しないように基礎から連結）
	const beacons = [];
	const stanchionMastGeo = tracker.geo(new THREE.BoxGeometry(0.68, 56, 0.68));
	const stanchionTieGeo = tracker.geo(new THREE.BoxGeometry(2.6, 0.36, 0.42));
	const cageRingGeo = tracker.geo(new THREE.TorusGeometry(0.42, 0.05, 8, 16));
	for (const bx of [-16.6, 16.6]) {
		const mast = new THREE.Mesh(stanchionMastGeo, towerSteelMat);
		mast.position.set(bx, -3.4, -3.5);
		group.add(mast);

		const signDir = bx < 0 ? 1 : -1;
		for (const ty of [-12.0, -3.0, 4.6, 13.8, 22.0]) {
			const tie = new THREE.Mesh(stanchionTieGeo, silverTrussMat);
			tie.position.set(bx + signDir * 1.1, ty, -3.5);
			group.add(tie);
		}

		const lampBase = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.44, 0.54, 0.5, 10)), silverTrussMat);
		lampBase.position.set(bx, 24.75, -3.5);
		group.add(lampBase);

		const cage = new THREE.Mesh(cageRingGeo, silverTrussMat);
		cage.rotation.x = Math.PI * 0.5;
		cage.position.set(bx, 25.15, -3.5);
		group.add(cage);

		const lamp = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.32, 12, 10)), alertCrimsonMat);
		lamp.position.set(bx, 25.18, -3.5);
		group.add(lamp);
		beacons.push(lamp);
	}

	if (qualityProfile.enableExtraLights !== false) {
		const arenaLight = new THREE.PointLight(0x60a5fa, 18, 44);
		arenaLight.position.set(0, 22.5, 2.5);
		group.add(arenaLight);

		const midTowerLight = new THREE.PointLight(0x93c5fd, 11, 42);
		midTowerLight.position.set(0, 10.5, 2.5);
		group.add(midTowerLight);

		const cyanTurbineGlowLight = new THREE.PointLight(0x38bdf8, 8, 24);
		cyanTurbineGlowLight.position.set(0, 5.4, -2.2);
		group.add(cyanTurbineGlowLight);

		const cyanReactorGlowLight = new THREE.PointLight(0x38bdf8, 8, 26);
		cyanReactorGlowLight.position.set(0, 21.0, -1.5);
		group.add(cyanReactorGlowLight);

		const lowTowerLight = new THREE.PointLight(0xf59e0b, 14, 38);
		lowTowerLight.position.set(0, -4.5, -2.5);
		group.add(lowTowerLight);
	}

	updaters.push((time, dt) => {
		outerRing.rotation.z += dt * 0.25;
		energyRing.rotation.z -= dt * 0.85;
		energyGlass.rotation.z -= dt * 0.85;
		turbineBlades.rotation.z += dt * 0.55;
		alertCrimsonMat.emissiveIntensity = 0.65 + Math.abs(Math.sin(time * 3.8)) * 0.55;
		neonCyanMat.emissiveIntensity = 2.65 + Math.sin(time * 3.1) * 0.55;

		for (const ar of auxRotors) {
			ar.rotor.rotation.z += dt * ar.speed;
			ar.glowRing.rotation.z -= dt * ar.speed * 0.6;
		}
		for (const tp of towerPistons) {
			tp.pistonHead.position.y = Math.sin(time * tp.speed + tp.phase) * tp.stroke;
		}
		for (const cr of conduitRings) {
			const cycle = (time * 0.36 + cr.offset) % 1;
			cr.ring.position.y = -12.0 + cycle * 38.0;
		}
		gantryTrolley.position.x = Math.sin(time * 0.55) * 11.5;
		for (let i = 0; i < servoArms.length; i += 1) {
			const sa = servoArms[i];
			sa.waist.rotation.y = Math.sin(time * 0.85 + i * 2.4) * 0.48;
			sa.shoulder.rotation.x = Math.sin(time * 1.3 + i) * 0.2;
			sa.elbow.rotation.x = 0.35 + Math.cos(time * 1.65 + i) * 0.25;
		}
	});

	return updaters;
}
