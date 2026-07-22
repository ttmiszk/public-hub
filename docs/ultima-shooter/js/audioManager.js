/**
 * AudioManager (汎用オーディオエンジン)
 * Web Audio API を利用した、外部音声ファイル（MP3等）に依存しない完全プログラム生成型の
 * 軽量シンセサイザーおよびシーケンサークラス。
 * 
 * 本ゲーム(Ultima Shooter)用に開発されましたが、外部ファイルに依存しないため、
 * 任意のWebブラウザゲームやインタラクティブコンテンツにおいて、再利用可能な
 * 汎用的なオーディオエンジンとして単独で組み込むことが可能です。
 * 
 * 【主な機能】
 * - SE（効果音）の合成（オシレーター、ホワイトノイズ、エンベロープ制御、フィルター制御）
 * - BGM（音楽）のシーケンス再生（MMLのようなトラックごとの発音タイミング管理）
 * - マスターボリューム制御、ポーズ・レジューム対応
 * 
 * ============================================================================
 * [AIプロンプト用指示書] 効果音・BGMデータの作成・編集を他のAIに依頼する場合
 * ============================================================================
 * チャットベースのAI（ChatGPT, Claude, Gemini等）に新しい効果音やBGMのパラメータ作成を
 * 依頼する際は、以下のテキストをコピー＆ペーストして指示してください。
 * 
 * ---（ここからコピー）---
 * Web Audio API を用いた簡易シンセサイザーおよびシーケンサー用の定義データ（JavaScriptのオブジェクト）を作成してください。
 * 
 * 【効果音（SE）定義フォーマット】
 * 各効果音は、複数の音源ノード（オシレータまたはノイズ）の配列で構成されます。
 * 
 * 1. オシレータノード (type: 'oscillator'):
 *    {
 *      type: 'oscillator',
 *      oscType: 'sine' | 'square' | 'sawtooth' | 'triangle', // 波形
 *      delay: 秒数, // 再生開始の遅延時間（オプション）
 *      frequency: { start: 数値, end: 数値, duration: 秒数, ramp: 'linear' | 'exponential' }, // 周波数変化
 *      gain: { start: 数値, end: 数値, duration: 秒数, ramp: 'linear' | 'exponential' } // 音量エンベロープ
 *    }
 * 
 * 2. ノイズノード (type: 'noise') - 爆発音や射撃の破裂音、風切り音用:
 *    {
 *      type: 'noise',
 *      delay: 秒数, // 再生開始の遅延時間（オプション）
 *      gain: { start: 0.8, end: 0.0, duration: 秒数, ramp: 'exponential' }, // 音量エンベロープ
 *      filter: { // オプション：フィルター
 *        type: 'lowpass' | 'highpass' | 'bandpass',
 *        frequency: { start: 数値, end: 数値, duration: 秒数, ramp: 'linear' | 'exponential' },
 *        Q: 数値 // フィルターの共鳴度（通常 1.0 〜 10.0）
 *      }
 *    }
 * 
 * （SE 実装例）
 * 'enemyExplode': {
 *   nodes: [
 *     { type: 'noise', gain: { start: 1.5, end: 0.001, duration: 0.45, ramp: 'exponential' }, filter: { type: 'lowpass', frequency: { start: 1000, end: 50, duration: 0.45, ramp: 'linear' }, Q: 1.2 } },
 *     { type: 'noise', gain: { start: 1.0, end: 0.001, duration: 0.3, ramp: 'exponential' }, filter: { type: 'bandpass', frequency: { start: 2000, end: 500, duration: 0.3, ramp: 'linear' }, Q: 1.0 } }
 *   ]
 * }
 * 
 * 【BGM定義フォーマット】
 * BGMは再生タイプ (type) によって以下の2つの形式で定義可能です。
 * 
 * 1. 外部音声ファイル再生形式 (type: 'file'):
 *    MP3等の外部音源ファイルを再生します。
 *    {
 *      type: 'file',
 *      url: 'assets/bgm_stage1.mp3' // 音声ファイルのURL/パス（必須）
 *    }
 *    ※ type: 'file' かつ url が設定されている場合、同一オブジェクト内に patterns や tracks 等の
 *       合成音用パラメータが存在していても無視され、音源ファイル再生が最優先されます。
 *       （ただし音声ファイルの読み込みに失敗した場合は、tracks 定義が存在すれば自動的に合成音演奏へフォールバックします）
 * 
 * 2. プログラム合成音シーケンサー形式 (type: 'synth' または未指定):
 *    Web Audio API で発音・シーケンス演奏を行う軽量シンセサイザー方式です。
 *    {
 *      type: 'synth',
 *      bpm: 150, // テンポ
 *      loop: true, // ループ再生するかどうか（デフォルト: true）
 *      patterns: { // テキスト楽譜パターン（音名:拍数）
 *        silent4: "-:4",
 *        kick_main: "x:0.75 -:0.25 -:0.5 x:0.5 x:0.75 -:0.25 -:0.5 x:0.5",
 *        bass_C1: "C2:0.5 C2:0.5 C3:0.5 C2:0.5 G2:0.5 C2:0.5 E2:0.5 G2:0.5",
 *        lead_ch1: "G5:0.5 B5:0.5 D6:1 B5:0.5 D6:0.5 G6:1"
 *      },
 *      tracks: [ // トラック構成
 *        { synthType: 'kick', volume: 0.35, pan: 0, sequence: ['kick_main', 'kick_main'] },
 *        { synthType: 'bass', volume: 0.3, pan: 0, sequence: ['bass_C1', 'bass_C1'] },
 *        { synthType: 'lead', volume: 0.4, pan: 0, sequence: ['silent4', 'lead_ch1'] }
 *      ]
 *    }
 * 
 * 【依頼内容】
 * 次の（効果音/BGM）の定義データを作成してください。
 * - 名前（例: 'playerHit' / 'stage2' など）
 * - どのような曲・音か（例: 「ボス戦用の激しいBGM」など）
 * - 上記フォーマットに沿った JavaScript オブジェクトのみを出力してください。
 * ---（ここまでコピー）---
 */

class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterVolume = 0.5;
        this.seVolume = 0.8;
        this.bgmVolume = 0.5;
        this.initialized = false;
        
        // ゲインノード
        this.masterGain = null;
        this.seGain = null;
        this.bgmGain = null;

        // ホワイトノイズ用キャッシュバッファ
        this.whiteNoiseBuffer = null;

        // アクティブなBGMノードのリスト（停止制御用）
        this.activeBgmNodes = [];


        this.currentBgm = null;
        this.pendingBgmName = null;

        // BGM共通エフェクト
        this.bgmCompressor = null;
        this.bgmDelay = null;
        this.bgmDelayFeedback = null;
        this.bgmDelayMix = null;


        this.seDefinitions = {};
        this.bgmDefinitions = {};
        this.bgmAudioElements = {}; // url -> { audio, sourceNode }
        this.currentBgmAudio = null;

        // ブラウザの自動再生制限（Autoplay Policy）を解除するためのリスナー登録
        this._setupUnlockListeners();
    }


    /**
     * 外部データを読み込む
     */
    loadData(seDefinitions, bgmDefinitions) {
        this.seDefinitions = seDefinitions || {};
        this.bgmDefinitions = bgmDefinitions || {};
    }

    /**
     * MP3等の音声ファイル用 HTMLAudioElement を取得・作成する
     */
    _getAudioElement(url) {
        if (this.bgmAudioElements[url]) {
            return this.bgmAudioElements[url];
        }

        try {
            const audio = new Audio(url);
            audio.loop = true;
            audio.preload = 'auto';

            this.bgmAudioElements[url] = audio;
            return audio;
        } catch (e) {
            console.error(`AudioManager: Failed to create Audio element for "${url}"`, e);
            return null;
        }
    }

    /**
     * Web Audio APIの初期化とゲイン接続
     */
    init() {
        if (this.initialized) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                return;
            }

            this.ctx = new AudioContextClass();

            //--------------------------------------------------
            // Master
            //--------------------------------------------------

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.masterVolume;
            this.masterGain.connect(this.ctx.destination);

            //--------------------------------------------------
            // SE
            //--------------------------------------------------

            this.seGain = this.ctx.createGain();
            this.seGain.gain.value = this.seVolume;
            this.seGain.connect(this.masterGain);

            //--------------------------------------------------
            // BGM
            //--------------------------------------------------

            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.value = this.bgmVolume;

            // 軽いコンプレッサ
            this.bgmCompressor = this.ctx.createDynamicsCompressor();
            this.bgmCompressor.threshold.value = -18;
            this.bgmCompressor.knee.value = 18;
            this.bgmCompressor.ratio.value = 2.5;
            this.bgmCompressor.attack.value = 0.003;
            this.bgmCompressor.release.value = 0.15;

            // 共通Delay
            this.bgmDelay = this.ctx.createDelay(1.0);
            this.bgmDelay.delayTime.value = 0.16;

            this.bgmDelayFeedback = this.ctx.createGain();
            this.bgmDelayFeedback.gain.value = 0.22;

            this.bgmDelayMix = this.ctx.createGain();
            this.bgmDelayMix.gain.value = 0.12;

            this.bgmGain.connect(this.bgmCompressor);

            this.bgmCompressor.connect(this.masterGain);

            this.bgmCompressor.connect(this.bgmDelay);
            this.bgmDelay.connect(this.bgmDelayFeedback);
            this.bgmDelayFeedback.connect(this.bgmDelay);

            this.bgmDelay.connect(this.bgmDelayMix);
            this.bgmDelayMix.connect(this.masterGain);

            this.initialized = true;

        }
        catch (e) {
            console.warn(e);
        }
    }

    /**
     * BGMトラック用ノード生成
     */
    _createBgmTrackChain(track = {}) {

        const gain = this.ctx.createGain();

        const filter = this.ctx.createBiquadFilter();

        filter.type = track.filter?.type || "lowpass";
        filter.frequency.value = track.filter?.frequency ?? 18000;
        filter.Q.value = track.filter?.Q ?? 0.0001;

        const pan = this.ctx.createStereoPanner();

        pan.pan.value = track.pan ?? 0;

        gain.connect(filter);
        filter.connect(pan);
        pan.connect(this.bgmGain);

        return {
            gain,
            filter,
            pan
        };
    }

/**
     * 自動再生制限解除リスナーのセットアップ
     */
    _setupUnlockListeners() {
        const unlock = () => {
            this.init();
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().then(() => {
                    this._removeUnlockListeners(unlock);
                    if (this.pendingBgmName) {
                        this.playBGM(this.pendingBgmName);
                    }
                });
            } else if (this.initialized) {
                this._removeUnlockListeners(unlock);
                if (this.pendingBgmName) {
                    this.playBGM(this.pendingBgmName);
                }
            }
        };

        window.addEventListener('click', unlock, { capture: true, passive: true });
        window.addEventListener('keydown', unlock, { capture: true, passive: true });
        window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    }

    _removeUnlockListeners(handler) {
        window.removeEventListener('click', handler, { capture: true });
        window.removeEventListener('keydown', handler, { capture: true });
        window.removeEventListener('touchstart', handler, { capture: true });
    }

    /**
     * ホワイトノイズバッファの取得（シングルトンキャッシュ）
     */
    _getWhiteNoiseBuffer() {
        if (this.whiteNoiseBuffer) return this.whiteNoiseBuffer;
        if (!this.ctx) return null;

        const bufferSize = this.ctx.sampleRate * 2; // 2秒分のバッファ
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.whiteNoiseBuffer = buffer;
        return this.whiteNoiseBuffer;
    }

    /**
     * 効果音の再生
     * @param {string} name 効果音の登録名 (seDefinitionsのキー)
     */
    play(name) {
        if (!this.initialized) {
            this.init();
        }
        
        if (!this.ctx) return;

        // 音声コンテキストがサスペンド状態の場合は再生をスキップ
        if (this.ctx.state === 'suspended') {
            return;
        }

        const definition = this.seDefinitions[name];
        if (!definition) {
            console.warn(`AudioManager: Sound "${name}" is not defined.`);
            return;
        }

        const now = this.ctx.currentTime;
        // masterVolume と seVolume は seGain で管理するため、ここでは 1.0 とする
        const volume = 1.0;

        // 定義されたすべてのノードを生成・再生
        definition.nodes.forEach(nodeDef => {
            const startTime = now + (nodeDef.delay || 0);
            if (nodeDef.type === 'oscillator') {
                this._playOscillator(nodeDef, startTime, volume);
            } else if (nodeDef.type === 'noise') {
                this._playNoise(nodeDef, startTime, volume);
            }
        });
    }

    /**
     * オシレータ音源の構築と再生
     */
    _playOscillator(def, startTime, globalVolume) {
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = def.oscType || 'sine';

        // 周波数エンベロープの設定
        if (def.frequency) {
            const freqStart = def.frequency.start;
            const freqEnd = def.frequency.end;
            const freqDuration = def.frequency.duration;
            const freqType = def.frequency.ramp || 'linear';

            osc.frequency.setValueAtTime(freqStart, startTime);
            if (freqType === 'exponential') {
                const safeEnd = freqEnd <= 0 ? 0.001 : freqEnd;
                osc.frequency.exponentialRampToValueAtTime(safeEnd, startTime + freqDuration);
            } else {
                osc.frequency.linearRampToValueAtTime(freqEnd, startTime + freqDuration);
            }
        }

        // 音量エンベロープの設定
        if (def.gain) {
            const gainStart = def.gain.start * globalVolume;
            const gainEnd = def.gain.end * globalVolume;
            const gainDuration = def.gain.duration;
            const gainType = def.gain.ramp || 'linear';

            gainNode.gain.setValueAtTime(gainStart, startTime);
            if (gainType === 'exponential') {
                const safeEnd = gainEnd <= 0 ? 0.0001 : gainEnd;
                gainNode.gain.exponentialRampToValueAtTime(safeEnd, startTime + gainDuration);
            } else {
                gainNode.gain.linearRampToValueAtTime(gainEnd, startTime + gainDuration);
            }
        }

        osc.connect(gainNode);
        gainNode.connect(this.seGain || this.ctx.destination);

        const duration = Math.max(
            def.frequency ? def.frequency.duration : 0,
            def.gain ? def.gain.duration : 0
        );

        osc.start(startTime);
        osc.stop(startTime + duration + 0.05); // 確実に再生が終了した後に破棄されるようマージンを持たせる
    }

    /**
     * ノイズ音源の構築と再生
     */
    _playNoise(def, startTime, globalVolume) {
        const noiseBuffer = this._getWhiteNoiseBuffer();
        if (!noiseBuffer) return;

        const source = this.ctx.createBufferSource();
        source.buffer = noiseBuffer;

        const gainNode = this.ctx.createGain();
        let lastNode = source;

        // フィルター設定がある場合はフィルターを挟む
        if (def.filter) {
            const filterNode = this.ctx.createBiquadFilter();
            filterNode.type = def.filter.type || 'lowpass';
            filterNode.Q.setValueAtTime(def.filter.Q || 1.0, startTime);

            if (def.filter.frequency) {
                const fStart = def.filter.frequency.start;
                const fEnd = def.filter.frequency.end;
                const fDuration = def.filter.frequency.duration;
                const fType = def.filter.frequency.ramp || 'linear';

                filterNode.frequency.setValueAtTime(fStart, startTime);
                if (fType === 'exponential') {
                    const safeEnd = fEnd <= 0 ? 0.001 : fEnd;
                    filterNode.frequency.exponentialRampToValueAtTime(safeEnd, startTime + fDuration);
                } else {
                    filterNode.frequency.linearRampToValueAtTime(fEnd, startTime + fDuration);
                }
            }

            lastNode.connect(filterNode);
            lastNode = filterNode;
        }

        // 音量エンベロープの設定
        if (def.gain) {
            const gainStart = def.gain.start * globalVolume;
            const gainEnd = def.gain.end * globalVolume;
            const gainDuration = def.gain.duration;
            const gainType = def.gain.ramp || 'linear';

            gainNode.gain.setValueAtTime(gainStart, startTime);
            if (gainType === 'exponential') {
                const safeEnd = gainEnd <= 0 ? 0.0001 : gainEnd;
                gainNode.gain.exponentialRampToValueAtTime(safeEnd, startTime + gainDuration);
            } else {
                gainNode.gain.linearRampToValueAtTime(gainEnd, startTime + gainDuration);
            }
        }

        lastNode.connect(gainNode);
        gainNode.connect(this.seGain || this.ctx.destination);

        const duration = Math.max(
            def.gain ? def.gain.duration : 0,
            (def.filter && def.filter.frequency) ? def.filter.frequency.duration : 0
        );

        source.start(startTime);
        source.stop(startTime + duration + 0.05);
    }
    /**
     * 音量調節メソッド群
     */
    setMasterVolume(val) {
        this.masterVolume = Math.max(0, Math.min(1, val));
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        }
        if (this.currentBgmAudio) {
            this.currentBgmAudio.volume = this.bgmVolume * this.masterVolume;
        }
    }

    setSeVolume(val) {
        this.seVolume = Math.max(0, Math.min(1, val));
        if (this.seGain && this.ctx) {
            this.seGain.gain.setValueAtTime(this.seVolume, this.ctx.currentTime);
        }
    }

    setBgmVolume(val) {
        this.bgmVolume = Math.max(0, Math.min(1, val));
        if (this.bgmGain && this.ctx) {
            this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
        }
        if (this.currentBgmAudio) {
            this.currentBgmAudio.volume = this.bgmVolume * this.masterVolume;
        }
    }

    /**
     * テキスト楽譜のパース処理
     * 例: "E4:1.5 G4:0.5 -:1.0"
     */
    _parsePattern(patternStr) {
        return patternStr.split(/\s+/).filter(Boolean).map(token => {
            const [note, durStr] = token.split(':');
            const dur = parseFloat(durStr);
            return {
                note: (note === 'R' || note === 'r' || note === '-') ? null : note,
                dur: dur
            };
        });
    }

    /**
     * BGMデータをパースして再生用に準備する
     */
    _prepareBGM(bgmName) {
        const bgm = this.bgmDefinitions[bgmName];
        if (!bgm) return null;

        if (!bgm.tracks) {
            console.warn(`AudioManager: BGM "${bgmName}" has no tracks defined.`);
            return null;
        }

        const beatDuration = 60 / (bgm.bpm || bgm.tempo || 120); // 1拍の秒数（tempo も後方互換でサポート）
        const tracksPlayData = [];

        bgm.tracks.forEach(trackDef => {
            const playNotes = [];
            let currentBeat = 0;

            trackDef.sequence.forEach(patternName => {
                const patternStr = bgm.patterns[patternName];
                if (!patternStr) return;

                const pattern = this._parsePattern(patternStr);
                pattern.forEach(noteDef => {
                    const noteTime = currentBeat * beatDuration;
                    const noteDur = noteDef.dur * beatDuration;
                    
                    if (noteDef.note !== null) {
                        playNotes.push({
                            note: noteDef.note,
                            time: noteTime,
                            duration: noteDur
                        });
                    }
                    currentBeat += noteDef.dur;
                });
            });

            tracksPlayData.push({
                synthType: trackDef.synthType,
                instrument: trackDef.instrument || null,
                volume: trackDef.volume ?? 0.5,
                filter: trackDef.filter || null,
                pan: trackDef.pan ?? 0,
                envelope: trackDef.envelope || null,
                vibrato: trackDef.vibrato || null,
                delay: trackDef.delay || null,
                notes: playNotes,
                totalDuration: currentBeat * beatDuration
            });
        });

        const totalDuration = Math.max(...tracksPlayData.map(t => t.totalDuration));

        return {
            tracks: tracksPlayData,
            totalDuration: totalDuration,
            loop: bgm.loop !== undefined ? bgm.loop : true
        };
    }

    /**
     * BGMの再生
     * @param {string} bgmName BGM名
     */
    playBGM(bgmName) {
        this.stopBGM(); // 既存BGMの停止

        if (!this.initialized) {
            this.init();
        }
        if (!this.ctx) return;
        
        // ユーザー操作前などでsuspended状態の場合、再生を保留する
        if (this.ctx.state === 'suspended') {
            this.pendingBgmName = bgmName;
            return;
        }

        this.pendingBgmName = null;

        const bgmDef = this.bgmDefinitions[bgmName];
        if (!bgmDef) {
            console.warn(`AudioManager: BGM "${bgmName}" is not defined.`);
            return;
        }

        // 音声ファイルURLが定義されている場合（かつ type が 'synth' でない場合）
        if (bgmDef.url && bgmDef.type !== 'synth') {
            const audio = this._getAudioElement(bgmDef.url);
            if (audio) {
                this.currentBgm = {
                    name: bgmName,
                    isAudioFile: true,
                    audio: audio
                };
                this.currentBgmAudio = audio;
                audio.volume = this.bgmVolume * this.masterVolume;
                audio.currentTime = 0;
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        console.warn(`AudioManager: Autoplay prevented for "${bgmDef.url}"`, e);
                    });
                }
                return;
            } else if (bgmDef.tracks) {
                console.warn(`AudioManager: Falling back to synth sequence for BGM "${bgmName}".`);
                this._playSynthBgm(bgmName);
                return;
            }
        }

        this._playSynthBgm(bgmName);
    }

    /**
     * 合成音シーケンサーによるBGM再生
     */
    _playSynthBgm(bgmName) {
        const bgmData = this._prepareBGM(bgmName);
        if (!bgmData) {
            console.warn(`AudioManager: BGM "${bgmName}" has no valid sequence data.`);
            return;
        }

        if (this.bgmGain) {
            this.bgmGain.gain.cancelScheduledValues(this.ctx.currentTime);
            this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
        }

        this.currentBgm = {
            name: bgmName,
            data: bgmData,
            startTime: this.ctx.currentTime,
            loopCount: 0,
            timeoutId: null
        };

        this._scheduleBgmLoop(this.currentBgm.startTime);
    }

    /**
     * シームレスループのための事前スケジュール
     */
    _scheduleBgmLoop(startTime) {
        if (!this.currentBgm) return;

        const bgmData = this.currentBgm.data;

        bgmData.tracks.forEach(track => {
            track.notes.forEach(note => {
                const noteStartTime = startTime + note.time;
                this._playBgmNote(
                    track,
                    note.note,
                    noteStartTime,
                    note.duration
                );
            });
        });

        if (bgmData.loop) {
            const nextStartTime = startTime + bgmData.totalDuration;
            // 終了0.2秒前に次のループをスケジュール
            const delayMs = (bgmData.totalDuration - 0.2) * 1000;
            
            this.currentBgm.timeoutId = setTimeout(() => {
                if (this.currentBgm) {
                    this.currentBgm.loopCount++;
                    this._scheduleBgmLoop(nextStartTime);
                }
            }, Math.max(0, delayMs));
        }
    }

    /**
     * 1音符の再生 (Version2)
     */
    _playBgmNote(track, noteName, startTime, duration) {

        if (!this.ctx) {
            return;
        }

        //-----------------------------------------
        // Instrumentプリセット
        //-----------------------------------------

        let synthType = track.synthType;

        let attack = 0.01;
        let	decay = 0.04;
        let sustain = 0.85;
        let release = 0.06;

        let filter = track.filter;

        let vibrato = track.vibrato;

        switch (track.instrument) {

            case "lead":
                synthType = "sawtooth";
                attack = 0.01;
                release = 0.10;
                filter ??= {
                    type: "lowpass",
                    frequency: 2200,
                    Q: 1.2
                };
                vibrato ??= {
                    rate: 5,
                    depth: 5
                };
                break;

            case "bass":
                synthType = "triangle";
                attack = 0.005;
                release = 0.08;
                filter ??= {
                    type: "lowpass",
                    frequency: 900,
                    Q: 0.8
                };
                break;

            case "pad":
                synthType = "sawtooth";
                attack = 0.15;
                decay = 0.20;
                sustain = 0.7;
                release = 0.30;
                filter ??= {
                    type: "lowpass",
                    frequency: 1500,
                    Q: 0.7
                };
                break;
        }

        if (track.envelope) {

            attack = track.envelope.attack ?? attack;
            decay = track.envelope.decay ?? decay;
            sustain = track.envelope.sustain ?? sustain;
            release = track.envelope.release ?? release;

        }

        // ドラムパーカッション（kick/snare/hat）は専用処理へ委譲
        if (synthType === 'kick' || synthType === 'snare' || synthType === 'hat') {
            this._playBgmDrum(synthType, track, startTime);
            return;
        }

        const freq = this._noteToFreq(noteName);

        if (freq <= 0) {
            return;
        }

        const osc = this.ctx.createOscillator();

        osc.type = synthType || "square";

        const chain = this._createBgmTrackChain(track);

        const gain = chain.gain;

        //-----------------------------------------
        // ADSR
        //-----------------------------------------

        const peak = track.volume ?? 0.5;

        gain.gain.cancelScheduledValues(startTime);

        gain.gain.setValueAtTime(0.0001, startTime);

        gain.gain.linearRampToValueAtTime(
            peak,
            startTime + attack
        );

        gain.gain.linearRampToValueAtTime(
            peak * sustain,
            startTime + attack + decay
        );

        const releaseStart =
            Math.max(
                startTime + attack + decay,
                startTime + duration - release
            );

        gain.gain.setValueAtTime(
            peak * sustain,
            releaseStart
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            startTime + duration
        );

        //-----------------------------------------
        // Vibrato
        //-----------------------------------------

        if (vibrato) {

            const lfo = this.ctx.createOscillator();

            const lfoGain = this.ctx.createGain();

            lfo.type = "sine";

            lfo.frequency.value = vibrato.rate;

            lfoGain.gain.value = vibrato.depth;

            lfo.connect(lfoGain);

            lfoGain.connect(osc.frequency);

            lfo.start(startTime);

            lfo.stop(startTime + duration);

            this.activeBgmNodes.push(lfo);
            this.activeBgmNodes.push(lfoGain);

        }

        //-----------------------------------------

        osc.frequency.setValueAtTime(
            freq,
            startTime
        );

        if (filter) {

            chain.filter.type = filter.type || "lowpass";

            chain.filter.frequency.value =
                filter.frequency ?? 18000;

            chain.filter.Q.value =
                filter.Q ?? 0.001;

        }

        chain.pan.pan.value = track.pan ?? 0;

        osc.connect(gain);

        osc.start(startTime);

        osc.stop(startTime + duration + 0.02);

        this.activeBgmNodes.push(osc);

        this.activeBgmNodes.push(gain);

        this.activeBgmNodes.push(chain.filter);

        this.activeBgmNodes.push(chain.pan);

        // 修正: 発音終了時刻をベースにクリーンアップまでの時間を計算
        const delayMs = Math.max(0, (startTime + duration - this.ctx.currentTime + 1.0) * 1000);
        setTimeout(() => {

            this.activeBgmNodes =
                this.activeBgmNodes.filter(n =>
                    n !== osc &&
                    n !== gain &&
                    n !== chain.filter &&
                    n !== chain.pan
                );

        }, delayMs);

    }

    /**
     * ドラムパーカッション音の再生（BGMトラック用）
     * synthType が kick / snare / hat の場合に _playBgmNote から呼ばれる。
     * ノイズ＋オシレータで疑似的にパーカッション音を合成する。
     */
    _playBgmDrum(drumType, track, startTime) {

        if (!this.ctx) return;

        const chain = this._createBgmTrackChain(track);
        const gain = chain.gain;
        const peak = track.volume ?? 0.3;
        const allNodes = [gain, chain.filter, chain.pan];

        switch (drumType) {

            // ---- キック：サイン波の低音スイープで「ドッ」 ----
            case 'kick': {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(150, startTime);
                osc.frequency.exponentialRampToValueAtTime(30, startTime + 0.12);

                gain.gain.setValueAtTime(0.0001, startTime);
                gain.gain.linearRampToValueAtTime(peak, startTime + 0.005);
                gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.15);

                osc.connect(gain);
                osc.start(startTime);
                osc.stop(startTime + 0.2);
                allNodes.push(osc);
                break;
            }

            // ---- スネア：三角波＋ハイパスノイズで「タッ」 ----
            case 'snare': {
                // 音程成分
                const osc = this.ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(250, startTime);
                osc.frequency.exponentialRampToValueAtTime(120, startTime + 0.05);

                const oscGain = this.ctx.createGain();
                oscGain.gain.setValueAtTime(peak * 0.6, startTime);
                oscGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08);

                osc.connect(oscGain);
                oscGain.connect(gain);
                osc.start(startTime);
                osc.stop(startTime + 0.12);
                allNodes.push(osc, oscGain);

                // ノイズ成分
                const noiseBuffer = this._getWhiteNoiseBuffer();
                if (noiseBuffer) {
                    const noise = this.ctx.createBufferSource();
                    noise.buffer = noiseBuffer;

                    const noiseFilter = this.ctx.createBiquadFilter();
                    noiseFilter.type = 'highpass';
                    noiseFilter.frequency.value = 2500;

                    const noiseGain = this.ctx.createGain();
                    noiseGain.gain.setValueAtTime(peak * 0.8, startTime);
                    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12);

                    noise.connect(noiseFilter);
                    noiseFilter.connect(noiseGain);
                    noiseGain.connect(gain);
                    noise.start(startTime);
                    noise.stop(startTime + 0.15);
                    allNodes.push(noise, noiseFilter, noiseGain);
                }

                // ゲインはミキサーとしてパススルー
                gain.gain.setValueAtTime(1.0, startTime);
                break;
            }

            // ---- ハイハット：ハイパスノイズで「チッ」 ----
            case 'hat': {
                const noiseBuffer = this._getWhiteNoiseBuffer();
                if (!noiseBuffer) break;

                const noise = this.ctx.createBufferSource();
                noise.buffer = noiseBuffer;

                const noiseFilter = this.ctx.createBiquadFilter();
                noiseFilter.type = 'highpass';
                noiseFilter.frequency.value = 8000;
                noiseFilter.Q.value = 1.5;

                gain.gain.setValueAtTime(0.0001, startTime);
                gain.gain.linearRampToValueAtTime(peak, startTime + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.04);

                noise.connect(noiseFilter);
                noiseFilter.connect(gain);
                noise.start(startTime);
                noise.stop(startTime + 0.06);
                allNodes.push(noise, noiseFilter);
                break;
            }
        }

        // activeBgmNodes に登録（停止制御用）
        allNodes.forEach(n => this.activeBgmNodes.push(n));

        // 修正: 発音終了時刻(ドラムは約0.2秒)をベースにクリーンアップ
        const delayMs = Math.max(0, (startTime + 0.2 - this.ctx.currentTime + 1.0) * 1000);
        setTimeout(() => {
            this.activeBgmNodes =
                this.activeBgmNodes.filter(n => !allNodes.includes(n));
        }, delayMs);
    }

    /**
     * BGMの停止
     */
    stopBGM() {
        if (this.currentBgmAudio) {
            try {
                this.currentBgmAudio.pause();
                this.currentBgmAudio.currentTime = 0;
            } catch (e) {
                // 無視
            }
            this.currentBgmAudio = null;
        }

        if (this.currentBgm) {
            if (this.currentBgm.timeoutId) {
                clearTimeout(this.currentBgm.timeoutId);
            }
            this.currentBgm = null;
        }

        this.activeBgmNodes.forEach(node => {
            try {
                if (node.stop) {
                    node.stop();
                }
                node.disconnect();
            } catch (e) {
                // すでに停止している場合のエラーは無視
            }
        });
        this.activeBgmNodes = [];

        // 全てのBGMノードの接続を強制的に断つため、メインのゲインノードを再生成する
        if (this.bgmGain && this.ctx) {
            this.bgmGain.disconnect();
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.value = this.bgmVolume;
            if (this.bgmCompressor) {
                this.bgmGain.connect(this.bgmCompressor);
            }
        }

        // ディレイの残響を強制クリアして完全に音を消す
        if (this.ctx) {
            if (this.bgmDelayMix) {
                this.bgmDelayMix.gain.cancelScheduledValues(this.ctx.currentTime);
                this.bgmDelayMix.gain.setValueAtTime(0, this.ctx.currentTime);
                this.bgmDelayMix.gain.setValueAtTime(0, this.ctx.currentTime + 0.2);
                this.bgmDelayMix.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.25);
            }
            if (this.bgmDelayFeedback) {
                this.bgmDelayFeedback.gain.cancelScheduledValues(this.ctx.currentTime);
                this.bgmDelayFeedback.gain.setValueAtTime(0, this.ctx.currentTime);
                this.bgmDelayFeedback.gain.setValueAtTime(0, this.ctx.currentTime + 0.2);
                this.bgmDelayFeedback.gain.linearRampToValueAtTime(0.22, this.ctx.currentTime + 0.25);
            }
        }
    }

    /**
     * BGMの一時停止
     */
    pauseBGM() {
        if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend();
        }
        if (this.currentBgmAudio) {
            this.currentBgmAudio.pause();
        }
    }

    /**
     * BGMの再開
     */
    resumeBGM() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (this.currentBgmAudio) {
            this.currentBgmAudio.play().catch(() => {});
        }
    }

    /**
     * BGMのフェードアウト
     * @param {number} durationSeconds フェードアウトにかける時間（秒）
     */
    fadeOutBGM(durationSeconds) {
        if (!this.currentBgm) return;
        
        const now = this.ctx ? this.ctx.currentTime : 0;
        const currentBgmName = this.currentBgm.name;

        if (this.bgmGain && this.ctx) {
            this.bgmGain.gain.cancelScheduledValues(now);
            this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
            this.bgmGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
        }

        if (this.currentBgmAudio) {
            const startVol = this.currentBgmAudio.volume;
            const startTime = Date.now();
            const durationMs = durationSeconds * 1000;
            const fadeInterval = setInterval(() => {
                if (!this.currentBgmAudio || this.currentBgm?.name !== currentBgmName) {
                    clearInterval(fadeInterval);
                    return;
                }
                const elapsed = Date.now() - startTime;
                const progress = Math.min(1, elapsed / durationMs);
                this.currentBgmAudio.volume = Math.max(0, startVol * (1 - progress));
                if (progress >= 1) {
                    clearInterval(fadeInterval);
                }
            }, 50);
        }

        // 指定秒数後に完全に停止
        setTimeout(() => {
            // 現在も同じBGMが再生中である場合のみ停止を行う（途中で曲が切り替ていないかチェック）
            if (this.currentBgm && this.currentBgm.name === currentBgmName) {
                this.stopBGM();
            }
        }, durationSeconds * 1000 + 50);
    }

    /**
     * 音階名から周波数への変換
     */
    _noteToFreq(noteStr) {
        if (!noteStr) return 0;
        const match = noteStr.match(/^([A-G]#?)(\d+)$/);
        if (!match) return 0;
        const name = match[1];
        const octave = parseInt(match[2], 10);
        
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const semitone = noteNames.indexOf(name);
        if (semitone === -1) return 0;

        const noteNum = semitone + octave * 12;
        const a4Num = 9 + 4 * 12; // A4 は 57
        return 440 * Math.pow(2, (noteNum - a4Num) / 12);
    }
}

// グローバルに単一のインスタンスを公開
