import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { getPlatformSurfaceY } from '../collision.js';
import { textureFactory } from '../graphics/textureFactory.js';
import {
	buildArticulatedRobotArm,
	buildControlConsole,
	buildIndustrialPipeRun,
	buildMoltenCrucible,
	buildMovingSpotLight,
	buildPitFireStand,
	buildTrussBeam,
	buildWallFluorescentLight
} from '../graphics/modelBuilder.js';

/**
 * STAGE 2: INDUSTRIAL FACTORY（巨大な工場）の定義とリッチ工場背景構築
 * ベルトコンベア、往復シャトル・垂直エレベーター、ピストンプレス、周期炎バーナー、追跡スパークを段階的に組み合わせる。
 */
export function createStage2Definition() {
	// STAGE 1 と同様にドラム缶が最上段からZ字に転がり落ちる傾斜＋コンベア＆移動足場構成
	const floor0Left = { id: 's2-floor-0-left', xMin: -15.5, xMax: 2.5, yStart: -0.35, yEnd: 0.0, thickness: 0.46, zCenter: 0, zHalfDepth: 1.5 };
	const conv0Right = { id: 's2-conv-0-right', xMin: 2.5, xMax: 15.5, yStart: 0.0, yEnd: 0.42, thickness: 0.46, zCenter: 0, zHalfDepth: 1.5, conveyorSpeed: -2.2 };

	const floor1LeftPad = { id: 's2-floor-1-left-pad', xMin: -15.5, xMax: -11.8, yStart: 5.05, yEnd: 4.9, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };
	const conv1Left = { id: 's2-conv-1-left', xMin: -11.8, xMax: -5.0, yStart: 4.9, yEnd: 4.65, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48, conveyorSpeed: 1.85 };
	const mover1 = {
		id: 's2-mover-1',
		xMin: -1.5,
		xMax: 2.5,
		yStart: 4.5,
		yEnd: 4.5,
		thickness: 0.42,
		zCenter: 0,
		zHalfDepth: 1.45,
		move: { axis: 'x', amplitude: 3.4, speed: 1.35, phase: 0 }
	};
	const conv1Right = { id: 's2-conv-1-right', xMin: 6.0, xMax: 12.2, yStart: 4.35, yEnd: 4.12, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48, conveyorSpeed: -1.9 };
	const floor1RightPad = { id: 's2-floor-1-right-pad', xMin: 12.2, xMax: 14.0, yStart: 4.12, yEnd: 4.05, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };

	const conv2Left = { id: 's2-conv-2-left', xMin: -13.9, xMax: -2.5, yStart: 8.2, yEnd: 8.65, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48, conveyorSpeed: 2.05 };
	const floor2Center = { id: 's2-floor-2-center', xMin: -2.5, xMax: 2.5, yStart: 8.65, yEnd: 8.85, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };
	const conv2Right = { id: 's2-conv-2-right', xMin: 2.5, xMax: 15.5, yStart: 8.85, yEnd: 9.35, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48, conveyorSpeed: -2.2 };

	const floor3Left = { id: 's2-floor-3-left', xMin: -15.5, xMax: -5.2, yStart: 14.05, yEnd: 13.65, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };
	const elevator3 = {
		id: 's2-elevator-3',
		xMin: -3.6,
		xMax: 0.4,
		yStart: 13.5,
		yEnd: 13.5,
		thickness: 0.42,
		zCenter: 0,
		zHalfDepth: 1.45,
		move: { axis: 'y', amplitude: 1.25, speed: 1.4, phase: 0.4 }
	};
	const conv3Right = { id: 's2-conv-3-right', xMin: 2.0, xMax: 11.8, yStart: 13.35, yEnd: 13.0, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48, conveyorSpeed: 1.95 };
	const floor3RightPad = { id: 's2-floor-3-right-pad', xMin: 11.8, xMax: 14.2, yStart: 13.0, yEnd: 12.92, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };

	const conv4Left = { id: 's2-conv-4-left', xMin: -13.9, xMax: 4.5, yStart: 17.15, yEnd: 17.85, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48, conveyorSpeed: -2.25 };
	const floor4Right = { id: 's2-floor-4-right', xMin: 4.5, xMax: 15.5, yStart: 17.85, yEnd: 18.25, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };

	const floor5Goal = { id: 's2-floor-5-goal', xMin: -2.0, xMax: 11.2, yStart: 21.6, yEnd: 21.6, thickness: 0.45, zCenter: 0, zHalfDepth: 1.5 };

	const platforms = [
		floor0Left,
		conv0Right,
		floor1RightPad,
		conv1Right,
		mover1,
		conv1Left,
		floor1LeftPad,
		conv2Left,
		floor2Center,
		conv2Right,
		floor3RightPad,
		conv3Right,
		elevator3,
		floor3Left,
		conv4Left,
		floor4Right,
		floor5Goal
	];

	const ladders = [
		{
			id: 's2-ladder-0-1',
			x: 13.5,
			yBottom: getPlatformSurfaceY(conv0Right, 13.5),
			yTop: getPlatformSurfaceY(floor1RightPad, 13.5),
			z: 1.52,
			halfWidth: 0.5
		},
		{
			id: 's2-ladder-1-2',
			x: -13.2,
			yBottom: getPlatformSurfaceY(floor1LeftPad, -13.2),
			yTop: getPlatformSurfaceY(conv2Left, -13.2),
			z: 1.52,
			halfWidth: 0.5
		},
		{
			id: 's2-ladder-2-3-r',
			x: 13.5,
			yBottom: getPlatformSurfaceY(conv2Right, 13.5),
			yTop: getPlatformSurfaceY(floor3RightPad, 13.5),
			z: 1.52,
			halfWidth: 0.5
		},
		// 3F中央寄り梯子は途中切断とし、2Fプレス機を迂回して直接上層へ登るショートカットを防止
		{
			id: 's2-ladder-2-3-mid',
			x: 4.2,
			yBottom: getPlatformSurfaceY(conv2Right, 4.2),
			yTop: getPlatformSurfaceY(conv3Right, 4.2) - 1.35,
			z: 1.52,
			halfWidth: 0.5,
			broken: true,
			climbMaxY: getPlatformSurfaceY(conv2Right, 4.2) + 2.25
		},
		{
			id: 's2-ladder-3-4',
			x: -13.2,
			yBottom: getPlatformSurfaceY(floor3Left, -13.2),
			yTop: getPlatformSurfaceY(conv4Left, -13.2),
			z: 1.52,
			halfWidth: 0.5
		},
		{
			id: 's2-ladder-4-5',
			x: 9.8,
			yBottom: getPlatformSurfaceY(floor4Right, 9.8),
			yTop: getPlatformSurfaceY(floor5Goal, 9.8),
			z: 1.52,
			halfWidth: 0.5
		}
	];

	const press0Base = getPlatformSurfaceY(conv0Right, 8.2);
	const press2Base = getPlatformSurfaceY(conv2Right, 7.2);
	const press3Base = getPlatformSurfaceY(floor3Left, -9.5);
	const presses = [
		{ id: 's2-press-0', x: 8.2, yClosedBottom: press0Base + 0.05, yOpenBottom: press0Base + 2.1, width: 1.9, height: 1.25, mountY: getPlatformSurfaceY(conv1Right, 8.2) - 0.45, period: 3.1, phase: 0.2 },
		{ id: 's2-press-2', x: 7.2, yClosedBottom: press2Base + 0.05, yOpenBottom: press2Base + 2.05, width: 2.0, height: 1.2, mountY: getPlatformSurfaceY(conv3Right, 7.2) - 0.45, period: 2.9, phase: 1.1 },
		{ id: 's2-press-3', x: -9.5, yClosedBottom: press3Base + 0.05, yOpenBottom: press3Base + 1.85, width: 1.9, height: 1.1, mountY: getPlatformSurfaceY(conv4Left, -9.5) - 0.45, period: 2.75, phase: 0.6 }
	];

	const burners = [
		{ id: 's2-burner-1', x: -8.6, y: getPlatformSurfaceY(conv1Left, -8.6), dirX: 0, dirY: 1, length: 2.3, period: 3.4, activeStart: 0.58, activeEnd: 0.9, phase: 0.4 },
		{ id: 's2-burner-3', x: 8.4, y: getPlatformSurfaceY(conv3Right, 8.4), dirX: 0, dirY: 1, length: 2.4, period: 3.2, activeStart: 0.58, activeEnd: 0.9, phase: 1.7 },
		{ id: 's2-burner-4', x: 5.8, y: getPlatformSurfaceY(floor4Right, 5.8), dirX: 0, dirY: 1, length: 2.2, period: 3.0, activeStart: 0.6, activeEnd: 0.9, phase: 0.9 }
	];

	const chasers = [
		// 3Fチェイサーは 2F左（移動床で分断された袋小路＋バーナー区画）へ降りて閉じ込められないよう梯子降下を禁止
		{ id: 's2-chaser-1', x: 9.5, y: getPlatformSurfaceY(conv2Right, 9.5) + 0.36, dir: -1, speed: 2.9, initialAiDelay: 2.2, allowLadderDescend: false },
		// 5F（最上段）専属とし、4F左（プレス機周辺）への降下閉じ込め・左端梯子（x=-13.2）上端の出待ち・工場ボス（x=13.8）との重複を防ぐ
		{ id: 's2-chaser-2', x: -2.0, y: getPlatformSurfaceY(conv4Left, -2.0) + 0.36, dir: 1, speed: 3.15, initialAiDelay: 3.4, minX: -11.2, maxX: 11.8, allowLadders: false }
	];

	const loopExtraChasers = [
		{ id: 's2-chaser-loop2', x: -7.5, y: getPlatformSurfaceY(conv2Left, -7.5) + 0.36, dir: 1, speed: 3.05, initialAiDelay: 1.8, allowLadderDescend: false },
		{ id: 's2-chaser-loop3', x: 6.5, y: getPlatformSurfaceY(conv3Right, 6.5) + 0.36, dir: -1, speed: 3.2, initialAiDelay: 1.5 },
		{ id: 's2-chaser-loop4', x: -6.0, y: getPlatformSurfaceY(floor0Left, -6.0) + 0.36, dir: 1, speed: 3.3, initialAiDelay: 1.2, minX: -13.6 }
	];

	const solidBoxes = [
		// 0F 左端のドラム缶溶解スクラップピット境界
		{ id: 's2-pit-guard', xMin: -15.6, xMax: -14.2, yMin: -0.35, yMax: 0.85, zMin: -1.35, zMax: 1.35 }
	];

	const barrelDestroyZones = [
		{ xMin: -17.0, xMax: -14.0, yMin: -1.8, yMax: 1.2 }
	];

	const pitFires = [
		// 0F 左端の燃焼ピット台上の炎：飛び乗った際・炎に触れた際にミス判定とする
		{ id: 's2-pit-fire', xMin: -15.48, xMax: -14.22, yMin: 0.65, yMax: 2.2 }
	];

	const items = [
		{ id: 's2-bonus-1', type: 'bonus', x: 5.2, y: getPlatformSurfaceY(conv0Right, 5.2) + 0.85, collected: false },
		{ id: 's2-bonus-2', type: 'bonus', x: -10.5, y: getPlatformSurfaceY(conv1Left, -10.5) + 0.85, collected: false },
		{ id: 's2-hammer-1', type: 'hammer', x: -12.6, y: getPlatformSurfaceY(conv2Left, -12.6) + 2.05, collected: false },
		{ id: 's2-bonus-3', type: 'bonus', x: 11.4, y: getPlatformSurfaceY(conv3Right, 11.4) + 0.85, collected: false },
		{ id: 's2-bonus-4', type: 'bonus', x: 0.0, y: getPlatformSurfaceY(conv4Left, 0.0) + 0.85, collected: false }
	];

	// 4F 右端の工場ボス「FORGE LOADER MK-II」が鋼鉄ドラム缶を投げてZ字に転がす
	const throwerX = 13.8;
	const thrower = {
		x: throwerX,
		y: getPlatformSurfaceY(floor4Right, throwerX),
		z: 0,
		throwDir: -1,
		modelType: 'factoryBoss',
		projectileKind: 'drum'
	};

	const goal = {
		x: 1.5,
		y: getPlatformSurfaceY(floor5Goal, 1.5),
		z: 0,
		radius: 1.25
	};

	return {
		id: 2,
		theme: {
			backgroundColor: 0x0b1019,
			fogColor: 0x101827,
			fogDensity: 0.0085,
			skyTint: 0x526488,
			skyTopColor: 0x62a8e8,
			groundBounceColor: 0x5a2314,
			mainLightColor: 0xffe0c2,
			girderHex: '#3f5168',
			ladderColor: 0xf59e0b
		},
		spawn: {
			x: -12.5,
			y: getPlatformSurfaceY(floor0Left, -12.5),
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
		presses,
		burners,
		electricTraps: [],
		chasers,
		loopExtraChasers,
		fallingHazards: [],
		items,
		thrower,
		goal,
		pitEmitterPos: null,
		buildScenery: _buildFactoryScenery
	};
}

/**
 * STAGE 2 固有の巨大工場背景（大型歯車フライホイール・ボイラー・配管とバルブ・吊り下げ溶鉱炉鍋・作業灯）
 */
function _buildFactoryScenery(group, tracker, qualityProfile = {}) {
	const updaters = [];
	const useBump = qualityProfile.enableBumpMaps !== false;
	const roughnessTex = useBump ? textureFactory.getSteelRoughnessTexture() : null;

	// 左下端の燃焼ドラム缶ピット（STAGE 1 共通の揺らめく炎＋熾き炭床）
	updaters.push(buildPitFireStand(group, tracker, -14.8, -0.35, qualityProfile.enableExtraLights !== false));
	const girderBumpTex = useBump ? textureFactory.getGirderBumpTexture() : null;

	const darkSteelMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x1e2736,
		bumpMap: girderBumpTex,
		bumpScale: useBump ? 0.025 : 0,
		roughnessMap: roughnessTex,
		metalness: 0.88,
		roughness: 0.32
	}));
	const silverTrussMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xaab4c4,
		roughnessMap: roughnessTex,
		metalness: 0.9,
		roughness: 0.25
	}));
	const redBoilerMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xb92b27,
		map: textureFactory.getBoilerTexture('#b92b27', 2, 4),
		roughnessMap: roughnessTex,
		metalness: 0.62,
		roughness: 0.32
	}));
	const deepSiloMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x3b485e,
		map: textureFactory.getBoilerTexture('#3b485e', 2, 5),
		roughnessMap: roughnessTex,
		metalness: 0.72,
		roughness: 0.38
	}));
	const brassMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xd99b26,
		roughnessMap: roughnessTex,
		metalness: 0.85,
		roughness: 0.26
	}));
	const moltenMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xffb703,
		emissive: 0xff6b00,
		emissiveIntensity: 2.5,
		roughness: 0.18
	}));
	const lampMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf0f9ff,
		emissive: 0x7dd3fc,
		emissiveIntensity: 2.35,
		roughness: 0.14
	}));
	const ventCavityMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x090d14,
		metalness: 0.25,
		roughness: 0.9
	}));

	// 1. 画面上下左右の全体を覆う巨大工場ホール壁・側面ウィング・下層まで伸びる鉄骨柱骨格
	const backWallMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x263144,
		map: textureFactory.getIndustrialWallTexture('#202938', 12, 9),
		roughnessMap: roughnessTex,
		metalness: 0.68,
		roughness: 0.48
	}));
	const backWall = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(170, 130, 2.0)),
		backWallMat
	);
	backWall.position.set(0, 6.0, -13.5);
	backWall.receiveShadow = true;
	group.add(backWall);

	// 斜め視点・タイトル周回カメラでも左右が途切れない工場側壁ウィング
	const sideWingGeo = tracker.geo(new THREE.BoxGeometry(12, 126, 30));
	for (const sx of [-52, 52]) {
		const wing = new THREE.Mesh(sideWingGeo, backWallMat);
		wing.position.set(sx, 4.0, -3.5);
		wing.receiveShadow = true;
		group.add(wing);
	}

	// 壁面の重厚な縦ピラスター柱＆水平ガントリー棚（最下段の遥か下方〜天井まで連続構造化）
	const pilasterGeo = tracker.geo(new THREE.BoxGeometry(1.8, 120, 1.8));
	for (const px of [-44, -32, -20, -8, 8, 20, 32, 44]) {
		const pilaster = new THREE.Mesh(pilasterGeo, darkSteelMat);
		pilaster.position.set(px, 4.0, -11.8);
		pilaster.receiveShadow = true;
		group.add(pilaster);
	}

	const gantryShelfGeo = tracker.geo(new THREE.BoxGeometry(108, 0.9, 2.2));
	for (const gy of [-24.0, -14.0, -4.5, 4.6, 13.8, 22.8, 32.0]) {
		const shelf = new THREE.Mesh(gantryShelfGeo, darkSteelMat);
		shelf.position.set(0, gy, -11.4);
		shelf.receiveShadow = true;
		group.add(shelf);
	}

	// ステージ背面・最下段の下（y=-38まで）を支える主鉄骨カラム＆下層Xブレース
	const stageColGeo = tracker.geo(new THREE.BoxGeometry(0.62, 66, 0.62));
	for (const cx of [-15.2, -5.2, 5.2, 15.2]) {
		const col = new THREE.Mesh(stageColGeo, darkSteelMat);
		col.position.set(cx, -7.0, -2.2);
		col.receiveShadow = true;
		group.add(col);
	}
	const subBraceGeo = tracker.geo(new THREE.BoxGeometry(0.18, 11.2, 0.18));
	for (const bx of [-10.2, 0, 10.2]) {
		for (const by of [-20.5, -12.0, -3.5]) {
			const b1 = new THREE.Mesh(subBraceGeo, darkSteelMat);
			b1.position.set(bx, by, -2.3);
			b1.rotation.z = 0.76;
			group.add(b1);
			const b2 = new THREE.Mesh(subBraceGeo, darkSteelMat);
			b2.position.set(bx, by, -2.3);
			b2.rotation.z = -0.76;
			group.add(b2);
		}
	}

	// 壁面換気ルーバーダクト（上層〜下層・左右外郭まで全面配置）
	const ventFrameGeo = tracker.geo(new THREE.BoxGeometry(2.4, 1.5, 0.55));
	const ventHoleGeo = tracker.geo(new THREE.BoxGeometry(1.9, 1.05, 0.25));
	const louverGeo = tracker.geo(new THREE.BoxGeometry(1.88, 0.08, 0.28));
	for (const vx of [-26.0, -14.5, 14.5, 26.0]) {
		for (const vy of [-11.5, -2.2, 6.2, 14.5, 24.5]) {
			const ventFrame = new THREE.Mesh(ventFrameGeo, darkSteelMat);
			ventFrame.position.set(vx, vy, -12.15);
			group.add(ventFrame);

			const ventHole = new THREE.Mesh(ventHoleGeo, ventCavityMat);
			ventHole.position.set(vx, vy, -11.95);
			group.add(ventHole);

			for (let li = -1.5; li <= 1.5; li += 1) {
				const slat = new THREE.Mesh(louverGeo, silverTrussMat);
				slat.position.set(vx, vy + li * 0.22, -11.82);
				slat.rotation.x = 0.42;
				group.add(slat);
			}
		}
	}

	// 工場上下架橋のシルバートラス（最下段の下〜上空まで）
	buildTrussBeam(group, tracker, 48.0, 0.95, 0.78, silverTrussMat, [0, 22.8, -4.4]);
	buildTrussBeam(group, tracker, 42.0, 0.95, 0.78, darkSteelMat, [0, -1.2, -3.4]);
	buildTrussBeam(group, tracker, 48.0, 1.05, 0.85, silverTrussMat, [0, -10.5, -4.6]);
	buildTrussBeam(group, tracker, 18.0, 0.8, 0.68, silverTrussMat, [-8.5, 14.2, -5.0], 0.14);
	buildTrussBeam(group, tracker, 18.0, 0.8, 0.68, silverTrussMat, [8.5, 14.2, -5.0], -0.14);

	// 2. 巨大回転フライホイール／歯車群（上層・中層・最下段・さらに下の深層まで多層配置）
	const gearWheels = [];
	const buildGearWheel = (x, y, z, radius, toothCount, mat, speed) => {
		const pivot = new THREE.Group();
		pivot.position.set(x, y, z);
		group.add(pivot);

		const rim = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(radius, radius * 0.14, 14, 30)), mat);
		rim.castShadow = true;
		pivot.add(rim);

		const hub = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(radius * 0.26, radius * 0.26, 0.75, 16)), brassMat);
		hub.rotation.x = Math.PI * 0.5;
		pivot.add(hub);

		const spokeGeo = tracker.geo(new THREE.BoxGeometry(radius * 1.9, radius * 0.16, 0.35));
		for (let i = 0; i < 3; i += 1) {
			const spoke = new THREE.Mesh(spokeGeo, darkSteelMat);
			spoke.rotation.z = (i * Math.PI) / 3;
			pivot.add(spoke);
		}

		const toothGeo = tracker.geo(new THREE.BoxGeometry(radius * 0.2, radius * 0.28, 0.5));
		for (let i = 0; i < toothCount; i += 1) {
			const a = (i / toothCount) * Math.PI * 2;
			const tooth = new THREE.Mesh(toothGeo, mat);
			tooth.position.set(Math.cos(a) * (radius + radius * 0.12), Math.sin(a) * (radius + radius * 0.12), 0);
			tooth.rotation.z = a - Math.PI * 0.5;
			pivot.add(tooth);
		}

		gearWheels.push({ pivot, speed });
	};

	// 中上層・左右外郭の歯車群
	buildGearWheel(-3.8, 10.5, -5.2, 4.2, 16, redBoilerMat, 0.32);
	buildGearWheel(3.5, 6.4, -5.8, 3.0, 12, darkSteelMat, -0.45);
	buildGearWheel(9.6, 15.2, -6.2, 3.6, 14, brassMat, 0.28);
	buildGearWheel(-22.2, 3.8, -7.4, 5.5, 20, brassMat, -0.24);
	buildGearWheel(22.4, 10.2, -7.4, 5.8, 20, darkSteelMat, 0.22);
	buildGearWheel(-11.2, 23.0, -7.0, 4.6, 16, darkSteelMat, 0.28);
	buildGearWheel(8.2, 25.5, -7.4, 5.2, 18, redBoilerMat, -0.24);

	// 最下段〜下層深部にかけて配置された超巨大フライホイール＆連結歯車群
	buildGearWheel(0.0, -3.2, -6.4, 6.4, 22, darkSteelMat, -0.2);
	buildGearWheel(-9.8, -6.8, -6.8, 4.8, 18, redBoilerMat, 0.3);
	buildGearWheel(10.6, -7.2, -6.6, 5.0, 18, brassMat, -0.26);
	buildGearWheel(-21.5, -11.5, -7.8, 5.6, 20, darkSteelMat, 0.2);
	buildGearWheel(22.0, -12.0, -7.8, 5.4, 20, redBoilerMat, -0.21);
	buildGearWheel(0.0, -15.5, -7.6, 5.2, 18, brassMat, 0.25);

	// 3. 画面下部まで連続して伸びる大型レッドボイラータンク2基＋外郭サイロ＋太パイプシステム
	const tankMountGeo = tracker.geo(new THREE.BoxGeometry(1.4, 0.85, 6.6));
	for (const bx of [-16.8, 16.8]) {
		// y = -36.0 〜 +17.5 まで途切れなく伸びる長大円筒タンク
		const tank = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(2.6, 2.6, 53.5, 22)), redBoilerMat);
		tank.position.set(bx, -9.25, -5.2);
		group.add(tank);

		const dome = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(2.6, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), redBoilerMat);
		dome.position.set(bx, 17.5, -5.2);
		group.add(dome);

		// ドーム上端から天井へ繋がる圧力解放スタック管
		const topRiser = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.65, 0.78, 18.0, 14)), darkSteelMat);
		topRiser.position.set(bx, 28.0, -5.2);
		group.add(topRiser);

		for (const bandY of [-28, -22, -16, -10, -4, 0.5, 4, 9, 14]) {
			const band = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(2.64, 0.08, 8, 28)), darkSteelMat);
			band.rotation.x = Math.PI * 0.5;
			band.position.set(bx, bandY, -5.2);
			group.add(band);
		}

		for (const my of [-18.0, -8.0, 1.5, 11.0]) {
			const mount = new THREE.Mesh(tankMountGeo, darkSteelMat);
			mount.position.set(bx, my, -8.5);
			group.add(mount);
		}
	}

	// 左右外郭の大型産業サイロ（画面左右端の奥行き密度を強化）
	for (const sx of [-27.5, 27.5]) {
		const silo = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(3.1, 3.1, 70, 20)), deepSiloMat);
		silo.position.set(sx, -3.0, -8.2);
		group.add(silo);
		for (const bandY of [-22, -12, -2, 8, 18, 26]) {
			const band = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(3.15, 0.1, 8, 24)), darkSteelMat);
			band.rotation.x = Math.PI * 0.5;
			band.position.set(sx, bandY, -8.2);
			group.add(band);
		}
	}

	buildIndustrialPipeRun(
		group,
		tracker,
		[[-12.8, -32.0, -3.6], [-12.8, 12.8, -3.6], [-7.5, 12.8, -3.6], [-7.5, 36.0, -3.6]],
		0.42,
		darkSteelMat,
		silverTrussMat,
		redBoilerMat,
		true
	);
	buildIndustrialPipeRun(
		group,
		tracker,
		[[12.8, -32.0, -3.6], [12.8, 16.5, -3.6], [6.5, 16.5, -3.6], [6.5, 36.0, -3.6]],
		0.42,
		darkSteelMat,
		silverTrussMat,
		redBoilerMat,
		true
	);
	buildIndustrialPipeRun(
		group,
		tracker,
		[[-22.0, -32.0, -5.6], [-22.0, -6.5, -5.6], [22.0, -6.5, -5.6], [22.0, -32.0, -5.6]],
		0.36,
		darkSteelMat,
		silverTrussMat,
		brassMat,
		false
	);

	// 地下溶解ピットの赤熱グレーチング（最下段の下に工場深部の熱源を演出）
	const furnaceTrough = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(34.0, 0.7, 3.2)), moltenMat);
	furnaceTrough.position.set(0, -13.2, -9.5);
	group.add(furnaceTrough);

	// 計器コンソール＆工場作業ロボットアーム2基（Image 2 のジオラマ情報密度を実現）
	buildControlConsole(group, tracker, darkSteelMat, moltenMat, [-10.6, 0.0, -1.6], 0.24);
	buildControlConsole(group, tracker, darkSteelMat, lampMat, [9.2, 9.2, -1.55], -0.25);

	const robotArms = [
		buildArticulatedRobotArm(group, tracker, brassMat, darkSteelMat, moltenMat, [6.2, 0.0, -1.9], 0.35, 1.05),
		buildArticulatedRobotArm(group, tracker, brassMat, darkSteelMat, lampMat, [-7.2, 9.2, -1.9], -0.4, 0.95)
	];

	// 4. 実鎖チェーン＆赤ハンガーで吊り下げた溶鉱鍋クルーシブル（暖色発光の主役アクセント）
	const crucibles = [];
	const enableLights = qualityProfile.enableExtraLights !== false;
	for (const [cx, cy, cz, phase] of [[-9.2, 16.5, -3.0, 0], [8.8, 8.5, -3.2, 1.5]]) {
		const cGroup = buildMoltenCrucible(
			group,
			tracker,
			darkSteelMat,
			redBoilerMat,
			moltenMat,
			6.5,
			[cx, cy, cz],
			enableLights
		);
		crucibles.push({ cGroup, baseX: cx, phase });
	}
	if (enableLights) {
		const lowerFurnaceLight = new THREE.PointLight(0xff7b29, 28, 36, 1.3);
		lowerFurnaceLight.position.set(0, -6.5, -2.5);
		group.add(lowerFurnaceLight);
	}

	// 5. 壁面ガントリー固定の立体2灯式蛍光灯ユニット＋角度を変えて工場を照らすムービング・スポットライト群
	const tubeHaloMat = tracker.mat(new THREE.SpriteMaterial({
		map: textureFactory.getGlowSpriteTexture(),
		color: 0x93c5fd,
		transparent: true,
		opacity: 0.28,
		blending: THREE.AdditiveBlending,
		depthWrite: false
	}));
	for (const [fx, fy] of [
		[-5.6, -4.5], [5.6, -4.5],
		[-6.2, 4.6], [6.2, 4.6],
		[-5.6, 13.8], [5.6, 13.8],
		[0.0, 22.8]
	]) {
		buildWallFluorescentLight(
			group,
			tracker,
			silverTrussMat,
			darkSteelMat,
			lampMat,
			tubeHaloMat,
			{ x: fx, y: fy, z: -10.1, length: 5.4, mountDepth: 1.35 }
		);
	}

	const cyanSpotBeamMat = tracker.mat(textureFactory.createVolumetricBeamMaterial(0x7dd3fc, 0.17));
	const amberSpotBeamMat = tracker.mat(textureFactory.createVolumetricBeamMaterial(0xffb703, 0.16));
	const cyanSpotHaloMat = tracker.mat(new THREE.SpriteMaterial({
		map: textureFactory.getGlowSpriteTexture(),
		color: 0x93c5fd,
		transparent: true,
		opacity: 0.55,
		blending: THREE.AdditiveBlending,
		depthWrite: false
	}));
	const amberSpotHaloMat = tracker.mat(new THREE.SpriteMaterial({
		map: textureFactory.getGlowSpriteTexture(),
		color: 0xffd166,
		transparent: true,
		opacity: 0.55,
		blending: THREE.AdditiveBlending,
		depthWrite: false
	}));
	const factoryMovingSpots = [];
	const movingSpotSpecs = [
		{ x: -16.5, y: 21.8, z: -7.4, baseYaw: 0.62, basePitch: 0.34, speed: 1.05, phase: 0.0, warm: false },
		{ x: 16.5, y: 21.8, z: -7.4, baseYaw: -0.62, basePitch: 0.34, speed: 1.05, phase: 1.8, warm: true },
		{ x: -16.5, y: 8.6, z: -7.4, baseYaw: 0.55, basePitch: 0.24, speed: 1.25, phase: 0.9, warm: true },
		{ x: 16.5, y: 8.6, z: -7.4, baseYaw: -0.55, basePitch: 0.24, speed: 1.25, phase: 2.7, warm: false }
	];
	for (const spec of movingSpotSpecs) {
		const rig = buildMovingSpotLight(
			group,
			tracker,
			darkSteelMat,
			silverTrussMat,
			spec.warm ? moltenMat : lampMat,
			spec.warm ? amberSpotBeamMat : cyanSpotBeamMat,
			spec.warm ? amberSpotHaloMat : cyanSpotHaloMat,
			{
				x: spec.x,
				y: spec.y,
				z: spec.z,
				armLen: 1.8,
				baseYaw: spec.baseYaw,
				basePitch: spec.basePitch,
				beamLen: 16.0,
				beamRadius: 2.6,
				scale: 1.05
			}
		);
		factoryMovingSpots.push({ rig, spec });
	}

	updaters.push((time, dt) => {
		cyanSpotBeamMat.uniforms.uTime.value = time;
		amberSpotBeamMat.uniforms.uTime.value = time;
		for (const ms of factoryMovingSpots) {
			ms.rig.yokePivot.rotation.y = ms.spec.baseYaw + Math.sin(time * ms.spec.speed + ms.spec.phase) * 0.42;
			ms.rig.headPivot.rotation.x = ms.spec.basePitch + Math.sin(time * (ms.spec.speed * 1.35) + ms.spec.phase) * 0.18;
		}
		for (const gw of gearWheels) {
			gw.pivot.rotation.z += dt * gw.speed;
		}
		for (const cr of crucibles) {
			cr.cGroup.position.x = cr.baseX + Math.sin(time * 0.75 + cr.phase) * 0.8;
			cr.cGroup.rotation.z = Math.cos(time * 0.75 + cr.phase) * 0.06;
		}
		for (let i = 0; i < robotArms.length; i += 1) {
			const ra = robotArms[i];
			ra.waist.rotation.y = Math.sin(time * 0.9 + i * 2.1) * 0.55;
			ra.shoulder.rotation.x = Math.sin(time * 1.4 + i) * 0.22;
			ra.elbow.rotation.x = 0.35 + Math.cos(time * 1.8 + i) * 0.28;
		}
	});

	return updaters;
}
