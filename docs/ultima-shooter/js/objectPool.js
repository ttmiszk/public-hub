/**
 * @fileoverview objectPool.js
 * オブジェクトプール実装。大量に生成・破棄されるオブジェクト（弾やパーティクル等）を
 * 使い回すことで、ガベージコレクション(GC)によるフレームドロップを防ぐ。
 */

/**
 * オブジェクトプールクラス
 * 大量に生成・破棄されるオブジェクト（弾、エフェクト等）を再利用し、
 * GCによるフレームドロップ（処理落ち）を防ぐ。
 */
class ObjectPool {
    /**
     * @param {Function} factory - 新しいオブジェクトを生成するコールバック関数
     * @param {Function} resetFunc - オブジェクト再利用前に初期化・リセットするコールバック関数
     * @param {number} initialSize - 初期状態でプールに用意するオブジェクト数
     */
    constructor(factory, resetFunc, initialSize = 10) {
        /** @type {Function} */
        this.factory = factory;
        /** @type {Function} */
        this.resetFunc = resetFunc;
        
        // 固定長として初期確保
        /** @type {any[]} */
        this.pool = new Array(initialSize);

        // 初期プールの確保
        for (let i = 0; i < initialSize; i++) {
            this.pool[i] = this.factory();
        }
        
        /** @type {number} 利用可能なオブジェクトのスタックトップのインデックス */
        this.currentIndex = initialSize - 1;
    }

    /**
     * プールから利用可能なオブジェクトを取得する。
     * 空の場合はファクトリ関数で新規生成する。
     * @param {...any} args - 初期化関数に渡す任意の引数
     * @returns {any}
     */
    obtain(...args) {
        let obj;
        if (this.currentIndex >= 0) {
            obj = this.pool[this.currentIndex];
            this.currentIndex--;
        } else {
            // 足りない場合は新規生成
            obj = this.factory();
        }
        
        if (this.resetFunc) {
            this.resetFunc(obj, ...args);
        }
        return obj;
    }

    /**
     * オブジェクトをプールに返却し、再利用可能にする。
     * @param {any} obj
     */
    release(obj) {
        this.currentIndex++;
        // プールの容量を超えた場合は配列を拡張する
        if (this.currentIndex >= this.pool.length) {
            this.pool.push(obj);
        } else {
            this.pool[this.currentIndex] = obj;
        }
    }
}
