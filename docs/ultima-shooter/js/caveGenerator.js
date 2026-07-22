/**
 * @fileoverview caveGenerator.js
 * 洞窟生成クラス。ゲームの進行に合わせて、ランダムなノイズ（シード値）に基づく
 * 左右の壁（TubeGeometry）をプロシージャルに生成・更新する。
 */

/**
 * 決定論的なハッシュ値を返す (0.0 〜 1.0)
 * @param {number} p - 入力座標値 (整数)
 * @param {number} seed - ランダムシード
 * @returns {number} 0〜1の疑似乱数値
 */
function hash1d(p, seed = 12345) {
    const x = Math.sin(p * 12.9898 + seed) * 43758.5453123;
    return x - Math.floor(x);
}

/**
 * 1次元の値ノイズ (Smoothstep補間)
 * @param {number} z - 入力座標
 * @param {number} seed - ランダムシード
 * @param {number} frequency - 周波数 (ノイズの細かさ)
 * @returns {number} 0.0 〜 1.0 の滑らかな連続値
 */
function noise1d(z, seed, frequency = 0.01) {
    const p = z * frequency;
    const i = Math.floor(p);
    const f = p - i;
    
    // Smoothstep補間関数 (3t^2 - 2t^3)
    const u = f * f * (3.0 - 2.0 * f);
    
    const v0 = hash1d(i, seed);
    const v1 = hash1d(i + 1, seed);
    
    return v0 * (1.0 - u) + v1 * u;
}

/**
 * 任意のZ座標における洞窟の形状境界を計算する
 * @param {number} z - Z座標 (プレイヤーが前進するにつれて減少する値)
 * @param {Object} stageConfig - ステージ設定 (GameConfig.stages[index])
 * @returns {Object} 洞窟の境界と中心座標 {left, right, bottom, top, centerX, centerY, width, height}
 */
function getCaveBoundsAt(z, stageConfig, bossActiveRatio = 0.0) {
    if (!stageConfig || !stageConfig.cave) {
        // フォールバック（設定値がない場合）
        return {
            left: -24.0,
            right: 24.0,
            bottom: -4.0,
            top: 16.0,
            centerX: 0.0,
            centerY: 6.0,
            width: 48.0,
            height: 20.0
        };
    }
    
    const cave = stageConfig.cave;
    // 進行距離を正の値として使用 (Zマイナス方向へ進むため、絶対値を取る)
    const dist = Math.abs(z);
    
    // スタート地点での急激な縮小・うねりを防ぐためのフェードイン (150ユニットかけて適用)
    const startFadeDist = 150.0;
    const t = Math.min(1.0, dist / startFadeDist);
    const fade = t * t * (3.0 - 2.0 * t); // Smoothstep
    
    // 決定論的な位相オフセットをシード値から生成 (同じシード値で同じ形状にするため)
    const seedOffset = (cave.seed % 1000) * 0.137;

    // 1. 中心位置の変動 (X, Y)
    // 複数の異なる周期のサイン波を合成し、-1.0 〜 1.0 の範囲で極値に達しやすく引き伸ばす
    const xFreq1 = cave.centerChangeSpeed;
    const xFreq2 = cave.centerChangeSpeed * 2.3;
    const waveX1 = Math.sin(dist * xFreq1 + seedOffset);
    const waveX2 = Math.cos(dist * xFreq2 + seedOffset * 1.5);
    let centerFactorX = (waveX1 * 0.70 + waveX2 * 0.30) * 1.25; // 1.25倍して極値付近を平坦化
    centerFactorX = Math.max(-1.0, Math.min(1.0, centerFactorX)); // クランプ

    const yFreq1 = cave.centerChangeSpeed * 1.15;
    const yFreq2 = cave.centerChangeSpeed * 2.7;
    const waveY1 = Math.cos(dist * yFreq1 + seedOffset * 2.0);
    const waveY2 = Math.sin(dist * yFreq2 + seedOffset * 2.5);
    let centerFactorY = (waveY1 * 0.70 + waveY2 * 0.30) * 1.25;
    centerFactorY = Math.max(-1.0, Math.min(1.0, centerFactorY));

    const centerX = cave.baseCenterX + centerFactorX * cave.centerChangeAmpX * fade;
    const centerY = cave.baseCenterY + centerFactorY * cave.centerChangeAmpY * fade;
    
    // 基本境界（うねり中心から最大幅・最大高さの半分ずつ広がった状態）
    const maxLeft = centerX - cave.maxWidth / 2;
    const maxRight = centerX + cave.maxWidth / 2;
    const maxBottom = centerY - cave.maxHeight / 2;
    const maxTop = centerY + cave.maxHeight / 2;

    // 2. 独立した壁の迫り出し量の計算
    
    // 左右・上下の縮小用周波数・閾値の取得
    const wFreq1 = cave.sizeChangeSpeed;
    const wFreq2 = cave.sizeChangeSpeed * 2.2;
    const thresholdW = cave.sizeNarrowThreshold !== undefined ? cave.sizeNarrowThreshold : 0.25;

    const hFreq1 = cave.sizeChangeSpeed * 1.1;
    const hFreq2 = cave.sizeChangeSpeed * 2.5;
    const thresholdH = thresholdW;

    // A. 共通の縮小因子の計算 (しきい値を超えた分だけパルス状に狭くする)
    // 左右方向の共通縮小因子
    const waveW1 = Math.sin(dist * wFreq1 + seedOffset * 3.0);
    const waveW2 = Math.cos(dist * wFreq2 + seedOffset * 3.5);
    const rawFactorW = (waveW1 * 0.65 + waveW2 * 0.35); 
    let sizeFactorW = 0.0;
    if (rawFactorW > thresholdW) {
        sizeFactorW = Math.pow((rawFactorW - thresholdW) / (1.0 - thresholdW), 2.0);
    }

    // 上下方向の共通縮小因子
    const waveH1 = Math.sin(dist * hFreq1 + seedOffset * 4.0 + 1.5);
    const waveH2 = Math.cos(dist * hFreq2 + seedOffset * 4.5 + 0.5);
    const rawFactorH = (waveH1 * 0.65 + waveH2 * 0.35);
    let sizeFactorH = 0.0;
    if (rawFactorH > thresholdH) {
        sizeFactorH = Math.pow((rawFactorH - thresholdH) / (1.0 - thresholdH), 2.0);
    }

    // B. 左右・上下の分配率を決定する分配ノイズの計算
    // 左右の分配率ノイズ (0.0 〜 1.0)
    const distFreqX = wFreq1 * 0.7; // ゆっくり変化させる
    const waveDistL = Math.sin(dist * distFreqX + seedOffset * 8.0);
    const waveDistR = Math.cos(dist * (distFreqX * 1.3) + seedOffset * 9.5);
    const rawDistX = (waveDistL * 0.5 + waveDistR * 0.5); // -1.0 〜 1.0
    const ratioL = (rawDistX + 1.0) / 2.0;
    const ratioR = 1.0 - ratioL;

    // 上下の分配率ノイズ (0.0 〜 1.0)
    const distFreqY = hFreq1 * 0.7;
    const waveDistB = Math.sin(dist * distFreqY + seedOffset * 10.0);
    const waveDistT = Math.cos(dist * (distFreqY * 1.3) + seedOffset * 11.5);
    const rawDistY = (waveDistB * 0.5 + waveDistT * 0.5); // -1.0 〜 1.0
    const ratioB = (rawDistY + 1.0) / 2.0;
    const ratioT = 1.0 - ratioB;

    // C. 最小幅・最小高さに基づく最大迫り出し量の計算
    const minW = cave.minWidth !== undefined ? cave.minWidth : cave.maxWidth * (1.0 - (cave.sizeChangeAmp !== undefined ? cave.sizeChangeAmp : 0.7));
    const minH = cave.minHeight !== undefined ? cave.minHeight : cave.maxHeight * (1.0 - (cave.sizeChangeAmp !== undefined ? cave.sizeChangeAmp : 0.7));

    const maxPushX = Math.max(0.0, (cave.maxWidth - minW) * fade);
    const maxPushY = Math.max(0.0, (cave.maxHeight - minH) * fade);

    // D. 各壁の実際の迫り出し量を分配計算 (合計は常に maxPushX / maxPushY 以下に収まる)
    const leftPush = sizeFactorW * ratioL * maxPushX;
    const rightPush = sizeFactorW * ratioR * maxPushX;
    const bottomPush = sizeFactorH * ratioB * maxPushY;
    const topPush = sizeFactorH * ratioT * maxPushY;

    // 迫り出しを適用した境界
    const left = maxLeft + leftPush;
    const right = maxRight - rightPush;
    const bottom = maxBottom + bottomPush;
    const top = maxTop - topPush;
    
    // bossActiveRatio に応じて最大値＆基本中心に滑らかに補間
    const targetLeft = cave.baseCenterX - cave.maxWidth / 2;
    const targetRight = cave.baseCenterX + cave.maxWidth / 2;
    const targetBottom = cave.baseCenterY - cave.maxHeight / 2;
    const targetTop = cave.baseCenterY + cave.maxHeight / 2;
    
    const lerp = (start, end, amt) => (1.0 - amt) * start + amt * end;
    
    const finalLeft = lerp(left, targetLeft, bossActiveRatio);
    const finalRight = lerp(right, targetRight, bossActiveRatio);
    const finalBottom = lerp(bottom, targetBottom, bossActiveRatio);
    const finalTop = lerp(top, targetTop, bossActiveRatio);
    
    const finalWidth = finalRight - finalLeft;
    const finalHeight = finalTop - finalBottom;
    const finalCenterX = (finalLeft + finalRight) / 2;
    const finalCenterY = (finalBottom + finalTop) / 2;
    
    return {
        left: finalLeft,
        right: finalRight,
        bottom: finalBottom,
        top: finalTop,
        centerX: finalCenterX,
        centerY: finalCenterY,
        width: finalWidth,
        height: finalHeight
    };
}

// 描画と衝突判定で共有する洞窟断面。flat配列 [x,y,...] を返す。
function getCaveCrossSectionVertices(bounds, z, radialDivs = 12) {
    const vertices = [];
    const a = bounds.width / 2;
    const h = bounds.height / 2;
    for (let i = 0; i < radialDivs; i++) {
        const theta = (i / radialDivs) * Math.PI * 2;
        const n = Math.sin(theta * 2.0 + z * 0.08) * 1.25
            + Math.cos(theta * 5.0 - z * 0.18) * 0.48
            + Math.sin(theta * 11.0 + z * 0.42) * 0.16;
        vertices.push(bounds.centerX + (a + n) * Math.cos(theta));
        vertices.push(bounds.centerY + (h + n) * Math.sin(theta));
    }
    return vertices;
}

/**
 * 洞窟のセグメントクラス
 * Z座標の短い区間（長さ15.0）ごとに、壁メッシュとサイバー格子ラインを構築する。
 */
class CaveSegment {
    /**
     * @param {THREE.Scene} scene - シーンオブジェクト
     * @param {number} index - セグメントのインデックス (Z座標 = index * -15.0)
     * @param {Object} stageConfig - ステージ設定
     * @param {THREE.Material} material - 壁用マテリアル
     * @param {THREE.Material} gridMaterial - 格子ライン用マテリアル
     * @param {number} bossActiveRatio - ボスアクティブ度
     */
    constructor(scene, index, stageConfig, material, gridMaterial, bossActiveRatio = 0.0) {
        this.scene = scene;
        this.index = index;
        
        // セグメント長は 15.0
        this.segmentLength = 15.0;
        this.z1 = index * -this.segmentLength;
        this.z2 = (index + 1) * -this.segmentLength;
        
        this.mesh = null;
        this.lines = null;
        
        this.create(stageConfig, material, gridMaterial, bossActiveRatio);
    }
    
    /**
     * Z座標と角度に応じたノイズ（凹凸）を計算
     */
    _getDisplacement(theta, z) {
        // 大・中・小の凹凸を重ね、規則的な8角形感を弱める。
        return Math.sin(theta * 2.0 + z * 0.08) * 1.25
            + Math.cos(theta * 5.0 - z * 0.18) * 0.48
            + Math.sin(theta * 11.0 + z * 0.42) * 0.16;
    }

    /**
     * 境界ボックスから8角形（楕円）の頂点を計算し、ノイズで凹凸をつける
     */
    _getOctagonVertices(b, z, radialDivs = 12) {
        const section = getCaveCrossSectionVertices(b, z, radialDivs);
        const verts = [];
        for (let i = 0; i < section.length; i += 2) {
            let vx = section[i];
            let vy = section[i + 1];
            let vz = z;

            // 座標ベースの決定論的ノイズで岩肌のようなデコボコ感を表現
            const hash1 = Math.abs(Math.sin(vx * 12.9898 + vy * 78.233 + vz * 37.719)) * 43758.5453;
            const r1 = (hash1 - Math.floor(hash1)) * 2 - 1;
            
            const hash2 = Math.abs(Math.sin(vx * 45.123 + vy * 12.989 + vz * 89.233)) * 43758.5453;
            const r2 = (hash2 - Math.floor(hash2)) * 2 - 1;
            
            // 当たり判定に影響しない範囲（±1.2程度）でXYを変位
            verts.push(vx + r1 * 1.2, vy + r2 * 1.2, vz);
        }
        return verts;
    }

    /**
     * 3Dメッシュとラインの構築
     */
    create(stageConfig, material, gridMaterial, bossActiveRatio = 0.0) {
        let geometry = new THREE.BufferGeometry();
        const subDivs = 8;
        const radialDivs = 12;
        
        const ringVerts = [];
        for (let j = 0; j <= subDivs; j++) {
            const t = j / subDivs;
            const z = this.z1 + (this.z2 - this.z1) * t;
            const b = getCaveBoundsAt(z, stageConfig, bossActiveRatio);
            ringVerts.push(this._getOctagonVertices(b, z, radialDivs));
        }
        
        // 1. 3D壁面メッシュの作成 (UVの回り込みを考慮して radialDivs + 1 にする)
        const vertices = new Float32Array((subDivs + 1) * (radialDivs + 1) * 3);
        const uvs = new Float32Array((subDivs + 1) * (radialDivs + 1) * 2);
        const colors = [];
        let vIdx = 0, uvIdx = 0;
        for (let j = 0; j <= subDivs; j++) {
            const ring = ringVerts[j];
            for (let i = 0; i <= radialDivs; i++) {
                const src_i = i % radialDivs;
                vertices[vIdx++] = ring[src_i*3];
                vertices[vIdx++] = ring[src_i*3+1];
                vertices[vIdx++] = ring[src_i*3+2];
                uvs[uvIdx++] = i / radialDivs;
                // Z軸方向にテクスチャが流れるように
                uvs[uvIdx++] = j / subDivs;
                colors.push(1.0, 1.0, 1.0);
            }
        }
        
        const indices = [];
        for (let j = 0; j < subDivs; j++) {
            for (let i = 0; i < radialDivs; i++) {
                const v0 = j * (radialDivs + 1) + i;
                const v1 = j * (radialDivs + 1) + (i + 1);
                const v2 = (j + 1) * (radialDivs + 1) + i;
                const v3 = (j + 1) * (radialDivs + 1) + (i + 1);
                
                indices.push(v0, v1, v3);
                indices.push(v0, v3, v2);
            }
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
        
        // 2. サイバーグリッドラインの作成 (ワイヤーフレーム)
        const lineGeometry = new THREE.BufferGeometry();
        const lineVertsArray = [];
        
        const pushLine = (x1, y1, z1, x2, y2, z2) => {
            lineVertsArray.push(x1, y1, z1, x2, y2, z2);
        };

        // 各リングの横枠線
        for (let j = 0; j <= subDivs; j++) {
            const ring = ringVerts[j];
            for (let i = 0; i < radialDivs; i++) {
                const next_i = (i + 1) % radialDivs;
                pushLine(ring[i*3], ring[i*3+1], ring[i*3+2], ring[next_i*3], ring[next_i*3+1], ring[next_i*3+2]);
            }
        }
        
        // 縦方向の結線
        for (let j = 0; j < subDivs; j++) {
            const ring1 = ringVerts[j];
            const ring2 = ringVerts[j+1];
            for (let i = 0; i < radialDivs; i++) {
                pushLine(ring1[i*3], ring1[i*3+1], ring1[i*3+2], ring2[i*3], ring2[i*3+1], ring2[i*3+2]);
            }
        }
        
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lineVertsArray), 3));
        
        this.lines = new THREE.LineSegments(lineGeometry, gridMaterial);
        this.scene.add(this.lines);
    }

    /**
     * 頂点・グリッドラインの動的位置更新（ボス出現時などの動的変形）
     * @param {Object} stageConfig
     * @param {number} bossActiveRatio
     */
    updatePositions(stageConfig, bossActiveRatio) {
        if (!this.mesh || !this.lines) return;

        const subDivs = 8;
        const radialDivs = 12;
        const ringVerts = [];
        for (let j = 0; j <= subDivs; j++) {
            const t = j / subDivs;
            const z = this.z1 + (this.z2 - this.z1) * t;
            const b = getCaveBoundsAt(z, stageConfig, bossActiveRatio);
            ringVerts.push(this._getOctagonVertices(b, z, radialDivs));
        }

        // 1. 壁面メッシュの頂点更新
        const posAttr = this.mesh.geometry.attributes.position;
        const verts = posAttr.array;

        let vIdx = 0;
        for (let j = 0; j <= subDivs; j++) {
            const ring = ringVerts[j];
            for (let i = 0; i <= radialDivs; i++) {
                const src_i = i % radialDivs;
                verts[vIdx++] = ring[src_i*3];
                verts[vIdx++] = ring[src_i*3+1];
                verts[vIdx++] = ring[src_i*3+2];
            }
        }

        posAttr.needsUpdate = true;
        this.mesh.geometry.computeVertexNormals();

        // 2. グリッドラインの頂点更新
        const linePosAttr = this.lines.geometry.attributes.position;
        const lineVerts = linePosAttr.array;
        let idx = 0;

        const pushLine = (x1, y1, z1, x2, y2, z2) => {
            lineVerts[idx++] = x1; lineVerts[idx++] = y1; lineVerts[idx++] = z1;
            lineVerts[idx++] = x2; lineVerts[idx++] = y2; lineVerts[idx++] = z2;
        };

        // 各リングの横枠線
        for (let j = 0; j <= subDivs; j++) {
            const ring = ringVerts[j];
            for (let i = 0; i < radialDivs; i++) {
                const next_i = (i + 1) % radialDivs;
                pushLine(ring[i*3], ring[i*3+1], ring[i*3+2], ring[next_i*3], ring[next_i*3+1], ring[next_i*3+2]);
            }
        }

        // 縦方向の結線
        for (let j = 0; j < subDivs; j++) {
            const ring1 = ringVerts[j];
            const ring2 = ringVerts[j+1];
            for (let i = 0; i < radialDivs; i++) {
                pushLine(ring1[i*3], ring1[i*3+1], ring1[i*3+2], ring2[i*3], ring2[i*3+1], ring2[i*3+2]);
            }
        }

        linePosAttr.needsUpdate = true;
    }
    
    /**
     * リソース破棄
     */
    destroy() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
        }
        if (this.lines) {
            this.scene.remove(this.lines);
            if (this.lines.geometry) this.lines.geometry.dispose();
        }
        this.mesh = null;
        this.lines = null;
    }
}
