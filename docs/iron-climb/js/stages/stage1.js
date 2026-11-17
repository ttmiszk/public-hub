import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { getPlatformSurfaceY } from '../collision.js';
import { textureFactory } from '../graphics/textureFactory.js';
import {
	buildChainLinkString,
	buildControlConsole,
	buildIndustrialPipeRun,
	buildMovingSpotLight,
	buildPitFireStand,
	buildTrussBeam
} from '../graphics/modelBuilder.js';

/**
 * STAGE 1: CONSTRUCTION SITE（巨大な建設現場）の定義とリッチ背景構築
 * 横幅を広く取り、端から落ちた樽も100%下の階に着地してZ字に迫りくる骨太バランス。
 */
export function createStage1Definition() {
	// 下の階ほど外側へ 2.5u 張り出させ、端から落ちた樽を1段も飛ばさず確実にキャッチする
	const floor0 = { id: 's1-floor-0', xMin: -15.5, xMax: 15.5, yStart: 0.0, yEnd: 1.0, thickness: 0.48, zCenter: 0, zHalfDepth: 1.5 };
	const floor1 = { id: 's1-floor-1', xMin: -15.5, xMax: 13.0, yStart: 5.0, yEnd: 4.1, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };
	const floor2 = { id: 's1-floor-2', xMin: -13.0, xMax: 15.5, yStart: 8.1, yEnd: 9.0, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };
	const floor3 = { id: 's1-floor-3', xMin: -15.5, xMax: 13.0, yStart: 13.0, yEnd: 12.1, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };
	const floor4 = { id: 's1-floor-4', xMin: -13.0, xMax: 14.8, yStart: 16.0, yEnd: 16.8, thickness: 0.45, zCenter: 0, zHalfDepth: 1.48 };
	const floor5 = { id: 's1-floor-5', xMin: -3.5, xMax: 4.8, yStart: 20.1, yEnd: 20.1, thickness: 0.45, zCenter: 0, zHalfDepth: 1.5 };

	const platforms = [floor0, floor1, floor2, floor3, floor4, floor5];

	const ladders = [
		// 1階 → 2階
		{
			id: 's1-ladder-0-1',
			x: 11.6,
			yBottom: getPlatformSurfaceY(floor0, 11.6),
			yTop: getPlatformSurfaceY(floor1, 11.6),
			z: 1.52,
			halfWidth: 0.5
		},
		// 1階の途切れ梯子
		{
			id: 's1-ladder-broken',
			x: -2.4,
			yBottom: getPlatformSurfaceY(floor0, -2.4),
			yTop: 2.8,
			z: 1.52,
			halfWidth: 0.5,
			broken: true,
			climbMaxY: 2.4
		},
		// 2階 → 3階（左端本ルート＋中央ショートカット）
		{
			id: 's1-ladder-1-2',
			x: -11.6,
			yBottom: getPlatformSurfaceY(floor1, -11.6),
			yTop: getPlatformSurfaceY(floor2, -11.6),
			z: 1.52,
			halfWidth: 0.5
		},
		{
			id: 's1-ladder-1-2-mid',
			x: 1.5,
			yBottom: getPlatformSurfaceY(floor1, 1.5),
			yTop: getPlatformSurfaceY(floor2, 1.5),
			z: 1.52,
			halfWidth: 0.5
		},
		// 3階 → 4階（右端本ルート＋中央ショートカット）
		{
			id: 's1-ladder-2-3',
			x: 11.6,
			yBottom: getPlatformSurfaceY(floor2, 11.6),
			yTop: getPlatformSurfaceY(floor3, 11.6),
			z: 1.52,
			halfWidth: 0.5
		},
		{
			id: 's1-ladder-2-3-mid',
			x: -2.8,
			yBottom: getPlatformSurfaceY(floor2, -2.8),
			yTop: getPlatformSurfaceY(floor3, -2.8),
			z: 1.52,
			halfWidth: 0.5
		},
		// 4階 → 5階（左端側＆中央寄り、敵から離れた側から登る）
		{
			id: 's1-ladder-3-4',
			x: -10.8,
			yBottom: getPlatformSurfaceY(floor3, -10.8),
			yTop: getPlatformSurfaceY(floor4, -10.8),
			z: 1.52,
			halfWidth: 0.5
		},
		{
			id: 's1-ladder-3-4-mid',
			x: -1.8,
			yBottom: getPlatformSurfaceY(floor3, -1.8),
			yTop: getPlatformSurfaceY(floor4, -1.8),
			z: 1.52,
			halfWidth: 0.5
		},
		// 5階 → ゴールプラットフォーム
		{
			id: 's1-ladder-4-5',
			x: 3.2,
			yBottom: getPlatformSurfaceY(floor4, 3.2),
			yTop: getPlatformSurfaceY(floor5, 3.2),
			z: 1.52,
			halfWidth: 0.5
		}
	];

	const solidBoxes = [
		// Floor 0 左端の燃焼ピット壁
		{ id: 's1-pit-guard', xMin: -15.6, xMax: -14.2, yMin: 0.0, yMax: 1.2, zMin: -1.35, zMax: 1.35 }
	];

	const barrelDestroyZones = [
		// Floor 0 左端の燃焼ドラム缶ピット
		{ xMin: -16.8, xMax: -14.0, yMin: -1.2, yMax: 1.6 }
	];

	const pitFires = [
		// 燃焼ピット台の炎：飛び乗った際・炎に触れた際にミス判定とする
		{ id: 's1-pit-fire', xMin: -15.48, xMax: -14.22, yMin: 1.0, yMax: 2.55 }
	];

	// パワーハンマーは寄り道リスクのある端寄りに1本だけ配置し、基本のジャンプ攻略を重視
	const items = [
		{ id: 's1-bonus-1', type: 'bonus', x: 4.5, y: getPlatformSurfaceY(floor0, 4.5) + 0.85, collected: false },
		{ id: 's1-bonus-2', type: 'bonus', x: -7.5, y: getPlatformSurfaceY(floor1, -7.5) + 0.85, collected: false },
		{ id: 's1-bonus-3', type: 'bonus', x: 7.2, y: getPlatformSurfaceY(floor2, 7.2) + 0.85, collected: false },
		{ id: 's1-bonus-4', type: 'bonus', x: -7.2, y: getPlatformSurfaceY(floor3, -7.2) + 0.85, collected: false },
		{ id: 's1-hammer-1', type: 'hammer', x: -10.5, y: getPlatformSurfaceY(floor2, -10.5) + 2.05, collected: false }
	];

	const throwerX = 12.2;
	const thrower = {
		x: throwerX,
		y: getPlatformSurfaceY(floor4, throwerX),
		z: 0,
		throwDir: -1
	};

	const goal = {
		x: -1.2,
		y: getPlatformSurfaceY(floor5, -1.2),
		z: 0,
		radius: 1.25
	};

	const loopExtraChasers = [
		{ id: 's1-chaser-loop2', x: 6.0, y: getPlatformSurfaceY(floor2, 6.0) + 0.36, dir: -1, speed: 2.75, initialAiDelay: 2.4 },
		{ id: 's1-chaser-loop3', x: -6.5, y: getPlatformSurfaceY(floor1, -6.5) + 0.36, dir: 1, speed: 2.9, initialAiDelay: 2.0 },
		{ id: 's1-chaser-loop4', x: -5.0, y: getPlatformSurfaceY(floor3, -5.0) + 0.36, dir: 1, speed: 3.1, initialAiDelay: 1.5 }
	];

	return {
		id: 1,
		theme: {
			backgroundColor: 0x0b0f18,
			fogColor: 0x0e1421,
			fogDensity: 0.0115,
			skyTopColor: 0x8cb4f0,
			groundBounceColor: 0x4b2a19,
			mainLightColor: 0xffd5a6,
			girderHex: '#c84b26',
			ladderColor: 0xffb703
		},
		spawn: {
			x: -11.5,
			y: getPlatformSurfaceY(floor0, -11.5),
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
		chasers: [],
		loopExtraChasers,
		items,
		thrower,
		goal,
		pitEmitterPos: null,
		buildScenery: _buildConstructionScenery
	};
}

/**
 * STAGE 1 固有の大型建設現場背景（Xブレース鉄骨タワー・投光器・背面巨大廃墟構造物・タワークレーン2基・燃焼ピット）
 */
function _buildConstructionScenery(group, tracker, qualityProfile = {}) {
	const updaters = [];
	const useBump = qualityProfile.enableBumpMaps !== false;
	const roughnessTex = useBump ? textureFactory.getSteelRoughnessTexture() : null;
	const girderBumpTex = useBump ? textureFactory.getGirderBumpTexture() : null;

	const steelDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x222c3c,
		bumpMap: girderBumpTex,
		bumpScale: useBump ? 0.025 : 0,
		roughnessMap: roughnessTex,
		metalness: 0.88,
		roughness: 0.36
	}));
	const steelFrameMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x2d394b,
		roughnessMap: roughnessTex,
		metalness: 0.82,
		roughness: 0.4
	}));
	const craneYellowMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xe9a825,
		roughnessMap: roughnessTex,
		metalness: 0.62,
		roughness: 0.34
	}));
	const ruinConcreteMat = tracker.mat(new THREE.MeshStandardMaterial({
		map: textureFactory.getRuinedStructureTexture('#2c303a'),
		roughnessMap: roughnessTex,
		metalness: 0.14,
		roughness: 0.88
	}));
	const ruinTrimMat = tracker.mat(new THREE.MeshStandardMaterial({
		map: textureFactory.getRuinedStructureTexture('#1d2028'),
		metalness: 0.22,
		roughness: 0.84
	}));
	const rustSteelMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x5c2f22,
		roughnessMap: roughnessTex,
		metalness: 0.72,
		roughness: 0.62
	}));
	const voidCavityMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x07090e,
		metalness: 0.05,
		roughness: 0.96
	}));
	const ruinDeepWallMat = tracker.mat(new THREE.MeshStandardMaterial({
		map: textureFactory.getRuinedStructureTexture('#171a22'),
		metalness: 0.12,
		roughness: 0.94
	}));
	const beaconRedMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xff3b30,
		emissive: 0xff2a1f,
		emissiveIntensity: 1.8
	}));
	const floodLightMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xfff3d6,
		emissive: 0xffd166,
		emissiveIntensity: 2.5
	}));
	// 先端と側面が滑らかに溶け込むボリュメトリック風シェーダーマテリアル（ラッパ状の切れ目を解消）
	const beamMat = tracker.mat(textureFactory.createVolumetricBeamMaterial(0xffe1ae, 0.2));
	const lensHaloMat = tracker.mat(new THREE.SpriteMaterial({
		map: textureFactory.getGlowSpriteTexture(),
		color: 0xffdfa0,
		transparent: true,
		opacity: 0.75,
		blending: THREE.AdditiveBlending,
		depthWrite: false
	}));

	// 1. 背面大型鉄骨タワー骨格（最下段の下 y=-36 まで伸び、巨大廃墟の高層階に位置する構造を示す）
	const colGeo = tracker.geo(new THREE.BoxGeometry(0.6, 60, 0.6));
	for (const cx of [-15.2, -5.2, 5.2, 15.2]) {
		const col = new THREE.Mesh(colGeo, steelDarkMat);
		col.position.set(cx, -6.0, -2.2);
		col.receiveShadow = true;
		group.add(col);
	}

	const braceGeo = tracker.geo(new THREE.BoxGeometry(0.16, 11.2, 0.16));
	for (const bx of [-10.2, 0, 10.2]) {
		for (const by of [-20.5, -12.0, -3.5, 5.0, 13.5]) {
			const b1 = new THREE.Mesh(braceGeo, steelFrameMat);
			b1.position.set(bx, by, -2.25);
			b1.rotation.z = 0.76;
			group.add(b1);

			const b2 = new THREE.Mesh(braceGeo, steelFrameMat);
			b2.position.set(bx, by, -2.25);
			b2.rotation.z = -0.76;
			group.add(b2);
		}
	}

	// 足場下の支えトラス・接地コンクリート基礎・上部トラスブリッジ
	const silverTrussMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x94a3b8,
		roughnessMap: roughnessTex,
		metalness: 0.88,
		roughness: 0.28
	}));
	const valveRedMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xdc2626,
		metalness: 0.5,
		roughness: 0.35
	}));

	buildTrussBeam(group, tracker, 31.0, 0.9, 0.75, silverTrussMat, [0, 21.6, -2.5]);
	buildTrussBeam(group, tracker, 18.0, 0.75, 0.65, steelFrameMat, [0, 10.6, -2.6]);

	// 左奥の配管ラインと操作盤（現場設備ディテール）
	buildIndustrialPipeRun(
		group,
		tracker,
		[[-16.4, 0, -2.8], [-16.4, 15.0, -2.8], [-12.5, 15.0, -2.8]],
		0.32,
		steelFrameMat,
		silverTrussMat,
		valveRedMat,
		true
	);
	buildControlConsole(group, tracker, steelDarkMat, beaconRedMat, [-13.4, 0.1, -1.2], 0.35);

	// 2. 工事用大型投光器タワー（足場より十分後方の z=-6.0 に配置し、下層廃墟まで続く支柱から自然な光束を放つ）
	const beamHeight = 20;
	const beamGeo = tracker.geo(new THREE.CylinderGeometry(0.32, 3.6, beamHeight, 32, 1, true));
	// 原点を光源レンズ側（上端 y = +beamHeight/2）へずらし、ヘッドから自然に回転照射させる
	beamGeo.translate(0, -beamHeight * 0.5, 0);
	const lampHousingGeo = tracker.geo(new THREE.BoxGeometry(1.25, 0.72, 0.78));
	const bracketGeo = tracker.geo(new THREE.BoxGeometry(0.34, 0.34, 2.6));
	const floodPivots = [];

	for (const [fx, dir, targetX, targetY] of [[-18.0, 1, -4.5, 8.5], [18.0, -1, 4.5, 9.5]]) {
		const towerZ = -6.0;
		const headY = 21.8;

		const poleHeight = headY + 36.0;
		const pole = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.18, 0.28, poleHeight, 12)), steelDarkMat);
		pole.position.set(fx, poleHeight * 0.5 - 36.0, towerZ);
		group.add(pole);

		for (const by of [-6.5, 1.8, 10.2, 18.6]) {
			const bracket = new THREE.Mesh(bracketGeo, steelFrameMat);
			bracket.position.set(fx, by, towerZ - 1.2);
			group.add(bracket);
		}

		const headGroup = new THREE.Group();
		headGroup.position.set(fx, headY, towerZ + 0.3);
		const baseRotZ = dir * 0.68;
		headGroup.rotation.z = baseRotZ;
		headGroup.rotation.x = 0.08;
		group.add(headGroup);

		const housing = new THREE.Mesh(lampHousingGeo, steelDarkMat);
		headGroup.add(housing);

		const lens = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.95, 0.42, 0.16)), floodLightMat);
		lens.position.set(0, -0.32, 0.18);
		headGroup.add(lens);

		const halo = new THREE.Sprite(lensHaloMat);
		halo.position.set(0, -0.36, 0.26);
		halo.scale.set(2.6, 2.6, 1);
		headGroup.add(halo);

		const beamMesh = new THREE.Mesh(beamGeo, beamMat);
		beamMesh.position.set(0, -0.32, 0.1);
		headGroup.add(beamMesh);

		if (qualityProfile.enableExtraLights !== false) {
			const spot = new THREE.SpotLight(0xffdfb0, 42, 34, Math.PI / 6, 0.75, 1.4);
			spot.position.set(fx, headY, towerZ + 0.5);
			spot.target.position.set(targetX, targetY, -1.8);
			group.add(spot);
			group.add(spot.target);
		}

		floodPivots.push({ headGroup, baseRotZ, dir });
	}

	// 3. 左端の燃焼ドラム缶ピット（揺らめく有機的炎シェーダー＋熾き炭床）
	updaters.push(buildPitFireStand(group, tracker, -14.8, 0.0, qualityProfile.enableExtraLights !== false));

	// 4. 廃墟上層壁柱から張り出す大型解体クレーン2基
	const cranePivots = [];
	const buildCrane = (x, y, z, scale, phase) => {
		const craneBase = new THREE.Group();
		craneBase.position.set(x, y, z);
		craneBase.scale.setScalar(scale);
		group.add(craneBase);

		const mast = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(1.2, 10.5, 1.2)), craneYellowMat);
		mast.position.y = 0;
		craneBase.add(mast);

		const wallMount = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(2.0, 1.6, 3.6)), steelDarkMat);
		wallMount.position.set(0, -1.8, -1.2);
		craneBase.add(wallMount);

		const jibPivot = new THREE.Group();
		jibPivot.position.y = 4.5;
		craneBase.add(jibPivot);

		const jib = buildTrussBeam(jibPivot, tracker, 19, 1.0, 0.95, craneYellowMat, [5.0, 0, 0]);
		void jib;

		const counterWeight = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(3.4, 1.5, 1.5)), steelDarkMat);
		counterWeight.position.x = -4.2;
		jibPivot.add(counterWeight);

		buildChainLinkString(jibPivot, tracker, 6.2, 0.16, steelDarkMat, [11.0, -0.5, 0]);
		const hookBlock = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.6, 0.45, 0.45)), beaconRedMat);
		hookBlock.position.set(11.0, -6.7, 0);
		jibPivot.add(hookBlock);

		const lamp = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.32, 8, 8)), beaconRedMat);
		lamp.position.set(14.5, 0.85, 0);
		jibPivot.add(lamp);

		cranePivots.push({ jibPivot, phase });
	};

	buildCrane(-19.5, 25.0, -8.2, 0.95, 0);
	buildCrane(20.5, 23.5, -8.8, 0.88, 1.8);

	// 5. 画面上下左右の背景全体を覆い尽くす多層巨大廃墟構造物（最下段の足場下にも階層が続く高層階ロケーション）
	const ruinGroup = new THREE.Group();
	group.add(ruinGroup);

	// 5a. 最奥全面の巨大廃墟躯体壁（左右・上下に空が一切抜けないよう背景全体を遮蔽）
	const backdropWall = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(170, 130, 2.0)), ruinDeepWallMat);
	backdropWall.position.set(0, 4.0, -19.2);
	backdropWall.receiveShadow = true;
	ruinGroup.add(backdropWall);

	// 左右側面の囲い込みウィング（斜めカメラや回転カメラでも横に空が見えないようにする）
	const sideWingGeo = tracker.geo(new THREE.BoxGeometry(14, 120, 28));
	for (const sx of [-52, 52]) {
		const wing = new THREE.Mesh(sideWingGeo, ruinDeepWallMat);
		wing.position.set(sx, 2.0, -6.0);
		ruinGroup.add(wing);
	}

	// 5b. 奥行きのある多層吹き抜け構造（z=-8.2 〜 -18.2 の立体スラブ＆大柱でハリボテ感を排除）
	const bayColumnsX = [-48, -36, -24, -12, 0, 12, 24, 36, 48];
	const columnGeo = tracker.geo(new THREE.BoxGeometry(2.4, 114, 2.8));
	for (const cx of bayColumnsX) {
		const col = new THREE.Mesh(columnGeo, ruinTrimMat);
		col.position.set(cx, 2.0, -8.6);
		col.receiveShadow = true;
		ruinGroup.add(col);
	}

	const slabLevelsY = [-32.0, -23.5, -15.0, -6.5, 1.8, 10.2, 18.6, 27.0, 35.5];
	const slabGeo = tracker.geo(new THREE.BoxGeometry(116, 1.15, 10.6));
	const corniceGeo = tracker.geo(new THREE.BoxGeometry(116, 0.72, 1.2));
	for (const sy of slabLevelsY) {
		const slab = new THREE.Mesh(slabGeo, ruinConcreteMat);
		slab.position.set(0, sy, -13.4);
		slab.receiveShadow = true;
		ruinGroup.add(slab);

		const cornice = new THREE.Mesh(corniceGeo, ruinTrimMat);
		cornice.position.set(0, sy + 0.15, -7.85);
		ruinGroup.add(cornice);
	}

	// 5c. 各階層・各ベイの奥に組み込んだ廃墟内壁・崩落壁・貫通配管・露出鉄骨トラス
	const subWallGeo = tracker.geo(new THREE.BoxGeometry(9.8, 3.6, 1.4));
	const deepRecessWallGeo = tracker.geo(new THREE.BoxGeometry(9.8, 7.6, 1.6));
	const brokenSpandrelGeo = tracker.geo(new THREE.BoxGeometry(1.1, 7.4, 1.1));
	for (let row = 0; row < slabLevelsY.length - 1; row += 1) {
		const floorY = slabLevelsY[row];
		const midY = floorY + 4.2;
		for (let col = 0; col < bayColumnsX.length - 1; col += 1) {
			const midX = (bayColumnsX[col] + bayColumnsX[col + 1]) * 0.5;
			const pattern = (row * 5 + col * 3) % 7;

			// 一部のベイは腰壁＋奥の闇、別のベイは中間壁や傾いた崩落柱を入れて豊かな立体変化を付ける
			if (pattern === 0 || pattern === 3) {
				const kneeWall = new THREE.Mesh(subWallGeo, ruinConcreteMat);
				kneeWall.position.set(midX, floorY + 2.0, -10.8);
				kneeWall.receiveShadow = true;
				ruinGroup.add(kneeWall);

				const recess = new THREE.Mesh(deepRecessWallGeo, voidCavityMat);
				recess.position.set(midX, midY, -16.8);
				ruinGroup.add(recess);
			} else if (pattern === 1 || pattern === 5) {
				const recess = new THREE.Mesh(deepRecessWallGeo, voidCavityMat);
				recess.position.set(midX, midY, -16.2);
				ruinGroup.add(recess);

				const strut = new THREE.Mesh(brokenSpandrelGeo, rustSteelMat);
				strut.position.set(midX + (col % 2 === 0 ? -1.8 : 1.8), midY, -11.8);
				strut.rotation.z = col % 2 === 0 ? 0.14 : -0.18;
				ruinGroup.add(strut);
			} else {
				const partialWall = new THREE.Mesh(subWallGeo, ruinTrimMat);
				partialWall.position.set(midX, floorY + 5.8, -13.2);
				ruinGroup.add(partialWall);
			}
		}
	}

	// 階を貫く廃墟の大型配管・排気ダクト・吹き抜け斜め鉄骨トラス
	for (const [px, pz, rad] of [[-29.5, -10.6, 0.95], [-6.2, -12.4, 1.15], [7.8, -11.0, 1.25], [29.5, -10.8, 0.9]]) {
		const pipe = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(rad, rad * 1.08, 96, 12)), ruinTrimMat);
		pipe.position.set(px, 2.0, pz);
		ruinGroup.add(pipe);
	}
	const ruinedTruss1 = buildTrussBeam(ruinGroup, tracker, 18.0, 0.95, 0.85, rustSteelMat, [-16.0, -10.5, -10.4]);
	ruinedTruss1.rotation.z = 0.08;
	const ruinedTruss2 = buildTrussBeam(ruinGroup, tracker, 20.0, 0.95, 0.85, rustSteelMat, [11.0, 22.8, -10.6]);
	ruinedTruss2.rotation.z = -0.11;
	buildIndustrialPipeRun(
		ruinGroup,
		tracker,
		[[-17.2, -26.0, -7.3], [-17.2, 20.0, -7.3], [-11.8, 20.0, -7.3]],
		0.45,
		rustSteelMat,
		ruinTrimMat,
		valveRedMat,
		false
	);

	// 6. 建設現場背景の動的ギミック（資材昇降リフト2基・揺れる吊り下げH鋼・廃墟大型換気ファン・溶接スパーク灯）
	const hoistCages = [];
	const hoistRailGeo = tracker.geo(new THREE.BoxGeometry(0.18, 56, 0.18));
	const hoistCrossGeo = tracker.geo(new THREE.BoxGeometry(1.7, 0.14, 0.16));
	const hoistCableGeo = tracker.geo(new THREE.CylinderGeometry(0.035, 0.035, 30, 8));
	const hoistSpec = [
		{ x: -19.2, z: -4.2, minY: 1.5, maxY: 17.5, speed: 0.42, phase: 0.0 },
		{ x: 19.2, z: -4.2, minY: 2.5, maxY: 18.0, speed: 0.36, phase: 2.1 }
	];
	for (const spec of hoistSpec) {
		const shaft = new THREE.Group();
		shaft.position.set(spec.x, 0, spec.z);
		group.add(shaft);

		for (const rx of [-0.85, 0.85]) {
			const rail = new THREE.Mesh(hoistRailGeo, steelDarkMat);
			rail.position.set(rx, 4.0, 0);
			shaft.add(rail);
		}
		for (let ry = -16; ry <= 28; ry += 4) {
			const brace = new THREE.Mesh(hoistCrossGeo, steelFrameMat);
			brace.position.set(0, ry, -0.35);
			shaft.add(brace);
		}

		// 上部滑車ホイール
		const pulley = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(0.55, 0.1, 8, 18)), craneYellowMat);
		pulley.position.set(0, 25.5, 0);
		shaft.add(pulley);

		// リフトケージ本体（鉄枠＋積載H鋼バンドル＋警報ランプ）
		const cage = new THREE.Group();
		cage.position.set(0, spec.minY, 0);
		shaft.add(cage);

		const platformFloor = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(1.9, 0.24, 1.45)), steelDarkMat);
		cage.add(platformFloor);

		const cageFrameTop = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(1.85, 0.16, 1.35)), craneYellowMat);
		cageFrameTop.position.y = 2.0;
		cage.add(cageFrameTop);

		for (const px of [-0.82, 0.82]) {
			for (const pz of [-0.58, 0.58]) {
				const post = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.1, 2.0, 0.1)), steelFrameMat);
				post.position.set(px, 1.0, pz);
				cage.add(post);
			}
		}

		const cargoBeam = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(1.35, 0.42, 0.9)), rustSteelMat);
		cargoBeam.position.set(0, 0.34, 0);
		cage.add(cargoBeam);

		const cageBeacon = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.18, 10, 8)), beaconRedMat);
		cageBeacon.position.set(0, 2.22, 0);
		cage.add(cageBeacon);

		const cable = new THREE.Mesh(hoistCableGeo, steelFrameMat);
		cable.position.set(0, 17.0, 0);
		cage.add(cable);

		hoistCages.push({ cage, pulley, spec });
	}

	// 空中で風を受けて僅かに揺れる吊り下げ鉄骨ビームスリング（中層〜上層で視認できるクレーン吊荷）
	const swayingSlings = [];
	for (const [sx, sy, sz, phase] of [[-9.2, 23.0, -5.6, 0.3], [9.8, 22.0, -5.8, 2.0]]) {
		const slingPivot = new THREE.Group();
		slingPivot.position.set(sx, sy, sz);
		group.add(slingPivot);

		buildChainLinkString(slingPivot, tracker, 5.2, 0.15, steelDarkMat, [-1.4, -0.2, 0]);
		buildChainLinkString(slingPivot, tracker, 5.2, 0.15, steelDarkMat, [1.4, -0.2, 0]);

		const suspendedBeam = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(5.6, 0.56, 0.62)), craneYellowMat);
		suspendedBeam.position.set(0, -5.4, 0);
		slingPivot.add(suspendedBeam);

		swayingSlings.push({ slingPivot, phase });
	}

	// 廃墟壁面の大型換気排気ファン（各階層の奥行きに回転シルエットを追加）
	const exhaustFans = [];
	const fanShroudGeo = tracker.geo(new THREE.TorusGeometry(2.1, 0.28, 10, 24));
	const fanHubGeo = tracker.geo(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 14));
	const fanBladeGeo = tracker.geo(new THREE.BoxGeometry(3.7, 0.42, 0.1));
	for (const [fx, fy, fz, speed] of [[0.0, -2.5, -10.8, 1.35], [-6.2, 5.8, -11.0, -1.6], [6.2, 14.2, -11.0, 1.45]]) {
		const fanBase = new THREE.Group();
		fanBase.position.set(fx, fy, fz);
		ruinGroup.add(fanBase);

		const cavity = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(2.05, 2.05, 0.5, 20)), voidCavityMat);
		cavity.rotation.x = Math.PI * 0.5;
		cavity.position.z = -0.2;
		fanBase.add(cavity);

		const shroud = new THREE.Mesh(fanShroudGeo, steelDarkMat);
		fanBase.add(shroud);

		const blades = new THREE.Group();
		fanBase.add(blades);

		const hub = new THREE.Mesh(fanHubGeo, rustSteelMat);
		hub.rotation.x = Math.PI * 0.5;
		blades.add(hub);

		for (let i = 0; i < 3; i += 1) {
			const blade = new THREE.Mesh(fanBladeGeo, steelFrameMat);
			blade.rotation.z = (i * Math.PI) / 3;
			blade.rotation.y = 0.24;
			blades.add(blade);
		}
		exhaustFans.push({ blades, speed });
	}

	// 廃墟壁柱据付の可動式作業スポットライト（単なる光棒ではなくヨーク・鏡筒・光束付きの現場照明）
	const workSpotLensMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf0f9ff,
		emissive: 0xbae6fd,
		emissiveIntensity: 2.6,
		roughness: 0.15
	}));
	const workSpotBeamMat = tracker.mat(textureFactory.createVolumetricBeamMaterial(0x93c5fd, 0.16));
	const workSpotHaloMat = tracker.mat(new THREE.SpriteMaterial({
		map: textureFactory.getGlowSpriteTexture(),
		color: 0xbae6fd,
		transparent: true,
		opacity: 0.52,
		blending: THREE.AdditiveBlending,
		depthWrite: false
	}));
	const wallWorkSpots = [];
	const workSpotSpecs = [
		{ x: -18.2, y: 6.8, z: -7.8, baseYaw: 0.58, basePitch: 0.28, phase: 0.0 },
		{ x: 18.2, y: 14.8, z: -7.8, baseYaw: -0.58, basePitch: 0.34, phase: 1.9 }
	];
	for (const spec of workSpotSpecs) {
		const rig = buildMovingSpotLight(
			ruinGroup,
			tracker,
			steelDarkMat,
			silverTrussMat,
			workSpotLensMat,
			workSpotBeamMat,
			workSpotHaloMat,
			{
				x: spec.x,
				y: spec.y,
				z: spec.z,
				armLen: 1.5,
				baseYaw: spec.baseYaw,
				basePitch: spec.basePitch,
				beamLen: 13.5,
				beamRadius: 2.2,
				scale: 0.95
			}
		);
		wallWorkSpots.push({ rig, spec });
	}

	updaters.push((time, dt) => {
		beaconRedMat.emissiveIntensity = 1.0 + Math.sin(time * 4.5) * 0.85;
		beamMat.uniforms.uTime.value = time;
		workSpotBeamMat.uniforms.uTime.value = time;

		for (const ws of wallWorkSpots) {
			ws.rig.yokePivot.rotation.y = ws.spec.baseYaw + Math.sin(time * 0.72 + ws.spec.phase) * 0.28;
			ws.rig.headPivot.rotation.x = ws.spec.basePitch + Math.cos(time * 0.95 + ws.spec.phase) * 0.12;
		}

		for (const cp of cranePivots) {
			cp.jibPivot.rotation.y = Math.sin(time * 0.18 + cp.phase) * 0.45;
		}
		for (const fp of floodPivots) {
			fp.headGroup.rotation.z = fp.baseRotZ + Math.sin(time * 0.55 + fp.dir) * 0.18;
		}
		for (const hc of hoistCages) {
			const wave = Math.sin(time * hc.spec.speed + hc.spec.phase);
			const norm = 0.5 + 0.5 * wave;
			hc.cage.position.y = hc.spec.minY + (hc.spec.maxY - hc.spec.minY) * norm;
			hc.pulley.rotation.z -= Math.cos(time * hc.spec.speed + hc.spec.phase) * dt * 1.4;
		}
		for (const sw of swayingSlings) {
			sw.slingPivot.rotation.z = Math.sin(time * 0.72 + sw.phase) * 0.055;
		}
		for (const ef of exhaustFans) {
			ef.blades.rotation.z += dt * ef.speed;
		}
	});

	return updaters;
}
