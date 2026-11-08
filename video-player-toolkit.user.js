// ==UserScript==
// @name         Video Player Toolkit · 通用视频工具
// @namespace    canceled9369.video-player-toolkit
// @version      2.0.0
// @description  自动发现网页 HTML5 视频：浮窗、A/B 循环、区间标记、记忆与命名片段。不限制网站域名。
// @match        https://*/*
// @match        http://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    'use strict';
    // Discover videos first; pages without video get no UI or storage writes.
    if (window.__videoPlayerToolkit) return;
    window.__videoPlayerToolkit = true;
    const sourceDoc = document;
    let pip = null, moving = false, container = null, marker = null;
    let video = null, bar = null, info = null, popButton = null;
    let a = null, b = null, looping = false, guard = true;
    let activeFrame = null, frameVideo = null;
    let lastMessage = '', messageUntil = 0;
    let rangeLayer = null, rangeFill = null, markA = null, markB = null;
    let rangeSeek = null, rangeObserver = null;
    let clipName = null, clipSelect = null, deleteButton = null, pendingDelete = null;
    let storageError = '', recordKey = '', clips = [];
    let videoSelect = null, seekControl = null, controlsBeforePopout = false;
    let candidates = [], rangeInputActive = false;
    const STORAGE_PREFIX = 'video-player-toolkit:v1:';
    function videoKey() {
        // Preserve query/hash identifiers (e.g. /watch?v=...) to avoid cross-video collisions.
        const url = new URL(window.location.href);
        url.searchParams.sort();
        const slot = video?.id ? `id:${video.id}` : `slot:${Math.max(0,candidates.indexOf(video))}`;
        return STORAGE_PREFIX + url.href + '|' + slot;
    }
    const validPoint = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    const validRange = r => r && validPoint(r.a) && validPoint(r.b) && r.b > r.a + 0.1;
    function readRecord() {
        let raw = window.localStorage.getItem(recordKey);
        // Reuse earlier local records on the same site when a single video is present.
        if (!raw && candidates.length <= 1) {
            const slug = window.location.pathname.split('/').filter(Boolean).pop() || 'index';
            raw = window.localStorage.getItem('max-player-tools:v1:' + slug.toLowerCase());
        }
        if (!raw) return {schema:1,last:null,clips:[]};
        const data = JSON.parse(raw);
        if (data?.schema !== 1 || !Array.isArray(data.clips)) throw new Error('记录格式不受支持');
        return {
            schema:1,
            last: data.last && validPoint(data.last.a) && (data.last.b === null || validRange(data.last)) ? data.last : null,
            clips:data.clips.filter(c => validRange(c) && typeof c.id === 'string' && typeof c.name === 'string')
                .map(c => ({id:c.id,name:c.name.slice(0,80),a:c.a,b:c.b}))
        };
    }
    function writeRecord(change) {
        try {
            // Read afresh so unrelated clips saved in another tab are retained.
            const data = readRecord();
            change(data);
            window.localStorage.setItem(recordKey, JSON.stringify(data));
            clips = data.clips;
            storageError = '';
            return true;
        } catch {
            storageError = '本地保存失败：请检查网站存储权限或空间（原记录未主动清空）';
            render();
            return false;
        }
    }
    function rememberRange() {
        return writeRecord(data => {data.last = a === null ? null : {a,b};});
    }
    function loadRecord() {
        recordKey = videoKey();
        a = b = null; looping = false;
        try {
            const data = readRecord();
            clips = data.clips;
            a = data.last?.a ?? null; b = data.last?.b ?? null;
            storageError = '';
        } catch {
            clips = [];
            storageError = '无法读取本地记录；未覆盖原数据';
        }
        refreshClips();
        render(a !== null ? '已恢复上次区间；按 L 开启循环' : undefined);
    }
    function refreshClips(selected = clipSelect?.value || '') {
        if (!clipSelect) return;
        clipSelect.replaceChildren();
        const d = clipSelect.ownerDocument;
        const empty = d.createElement('option');
        empty.value = ''; empty.textContent = clips.length ? `选择片段（${clips.length}）` : '尚无保存的片段';
        clipSelect.append(empty);
        for (const c of clips) {
            const option = d.createElement('option');
            option.value = c.id; option.textContent = `${c.name} · ${format(c.a)}–${format(c.b)}`;
            clipSelect.append(option);
        }
        clipSelect.value = clips.some(c => c.id === selected) ? selected : '';
        pendingDelete = null;
        if (deleteButton) deleteButton.textContent = '删除片段';
    }
    function saveClip() {
        if (!validRange({a,b})) return render('请先设置有效的 A、B 区间');
        const name = (clipName?.value || '').trim().slice(0,80) || `片段 ${format(a)}–${format(b)}`;
        const id = window.crypto.randomUUID();
        if (!writeRecord(data => {data.last = {a,b}; data.clips.push({id,name,a,b});})) return;
        refreshClips(id);
        if (clipName) clipName.value = '';
        render(`已保存：${name}`);
    }
    function selectedClip() {
        try { clips = readRecord().clips; }
        catch { render('无法读取片段'); return null; }
        return clips.find(c => c.id === clipSelect?.value) || null;
    }
    function playClip() {
        const c = selectedClip();
        if (!c) return render('请先选择一个片段');
        if (!video || video.readyState < 1) return render('请先开始播放，等待视频加载');
        if (!Number.isFinite(video.duration) || c.b > video.duration + 0.1) return render('片段超出当前视频时长，未开始播放');
        a = c.a; b = c.b; looping = true;
        video.currentTime = a;
        rememberRange();
        render(`循环播放：${c.name}`);
        video.play().catch(() => render('区间已载入，请点击播放'));
    }
    function renameClip() {
        const c = selectedClip();
        if (!c) return render('请先选择一个片段');
        const name = (clipName?.value || '').trim().slice(0,80);
        if (!name) return render('请在名称框中输入新名称');
        if (!writeRecord(data => {const item = data.clips.find(x => x.id === c.id); if (item) item.name = name;})) return;
        refreshClips(c.id); clipName.value = ''; render('片段已重命名');
    }
    function deleteClip() {
        const c = selectedClip();
        if (!c) return render('请先选择一个片段');
        if (pendingDelete !== c.id) {
            pendingDelete = c.id;
            deleteButton.textContent = '确认删除';
            return render(`再次点击确认删除「${c.name}」`);
        }
        if (!writeRecord(data => {data.clips = data.clips.filter(x => x.id !== c.id);} )) return;
        refreshClips(); render('已删除片段；当前 A/B 区间保留');
    }

    // Capture before the site's document/window bubble listeners.
    function preventSitePause(e) {
        if (!guard || !video?.isConnected || video.paused) return;
        if (e.type === 'blur' && e.target !== window && e.target !== sourceDoc) return;
        e.stopImmediatePropagation();
    }
    window.addEventListener('blur', preventSitePause, true);
    window.addEventListener('visibilitychange', preventSitePause, true);

    const css = `
      .max-player-tools{position:fixed!important;bottom:12px!important;right:12px!important;width:min(780px,calc(100vw - 24px))!important;max-height:45vh;overflow:auto;display:flex!important;flex-wrap:wrap;align-items:center;gap:7px;padding:10px!important;background:#142033!important;color:#fff!important;font:13px/1.5 system-ui,sans-serif!important;z-index:2147483646;box-sizing:border-box;border-radius:8px}
      .max-player-tools[hidden]{display:none!important}
      .max-player-tools.max-collapsed>:not(.max-collapse){display:none!important}
      .max-player-tools.max-collapsed{width:auto!important}
      .max-progress{position:relative;width:100%;height:28px;flex-basis:100%}
      .max-progress input{display:block!important;width:100%!important;margin:0!important;height:28px!important;padding:0!important;accent-color:#5bafff;cursor:pointer}
      .max-video-select{max-width:240px;background:#20324c;color:#fff;padding:5px;border:1px solid #5a7090}
      .max-player-tools button{background:#294262!important;color:#fff!important;border:1px solid #5a7090!important;border-radius:5px!important;padding:5px 9px!important;font:inherit!important;cursor:pointer}
      .max-player-tools button:hover{background:#3a5b84!important}
      .max-player-tools button:focus-visible{outline:2px solid #ffd34e!important}
      .max-player-tools output{flex:1 1 240px;white-space:normal}
      .max-player-tools small{flex-basis:100%;color:#c6d4e8}
      .max-player-clips{display:flex;flex-wrap:wrap;align-items:center;gap:7px;flex-basis:100%}
      .max-player-clips input,.max-player-clips select{min-width:120px;max-width:100%;background:#20324c!important;color:white!important;border:1px solid #5a7090!important;border-radius:5px;padding:5px!important;font:inherit!important}
      .max-player-clips select{flex:1 1 230px}
      .max-player-clips input{width:170px}
      .max-ab-layer,.max-ab-layer *{pointer-events:none!important;box-sizing:border-box}
      .max-ab-layer{position:absolute!important;height:6px!important;z-index:3;overflow:visible!important}
      .max-ab-layer[hidden],.max-ab-layer [hidden]{display:none!important}
      .max-ab-fill{position:absolute;top:0;height:6px;background:rgba(255,211,78,.55);border-top:1px solid #ffd34e;border-bottom:1px solid #ffd34e}
      .max-ab-layer[data-active="false"] .max-ab-fill{background:rgba(200,210,225,.25);border-color:#b3bfd0}
      .max-ab-marker{position:absolute;top:-4px;width:2px;height:14px;background:#ffd34e;transform:translateX(-50%)}
      .max-ab-marker span{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);padding:0 3px;border-radius:3px;background:#ffd34e;color:#182034;font:bold 10px/14px system-ui,sans-serif}
      body.max-pip{margin:0!important;background:#000!important;color:#fff!important;height:100vh!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}
      body.max-pip>.max-pip-media{flex:1 1 0!important;min-height:0!important;width:100%!important;height:auto!important;max-height:100%!important;border-radius:0!important}
      body.max-pip .plyr__video-wrapper{height:100%!important;min-height:0!important}
      body.max-pip video{width:100%!important;height:100%!important;object-fit:contain!important}
      body.max-pip>.max-player-tools{position:relative!important;inset:auto!important;width:100%!important;flex:0 0 auto!important;max-height:45vh;overflow:auto}
      body.max-pip [data-plyr="pip"],body.max-pip [data-plyr="fullscreen"]{display:none!important}
      body.max-pip .plyr__controls{opacity:1!important;transform:none!important;pointer-events:auto!important}
    `;
    function addStyle(doc) {
        const el = doc.createElement('style');
        el.textContent = css;
        doc.head.append(el);
    }
    function format(t) {
        if (t === null || !Number.isFinite(t)) return '未设置';
        const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60);
        const s = (t % 60).toFixed(1).padStart(4, '0');
        return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${s}`;
    }
    function render(message) {
        if (message) { lastMessage = message; messageUntil = Date.now() + 5000; }
        updateRange();
        if (!info) return;
        info.textContent = `A ${format(a)} · B ${format(b)} · ${looping ? '循环中' : '循环关闭'} · 防暂停${guard ? '开' : '关'}` +
            (Date.now() < messageUntil ? ` | ${lastMessage}` : '') + (storageError ? ` | ${storageError}` : '');
        popButton.textContent = pip ? '返回网页' : '弹出完整播放器';
    }
    function updateRange() {
        const seek = seekControl;
        if (!seek) {
            rangeLayer?.remove(); rangeObserver?.disconnect();
            rangeLayer = rangeSeek = null;
            return;
        }
        if (rangeSeek !== seek || !rangeLayer?.isConnected) {
            rangeLayer?.remove(); rangeObserver?.disconnect();
            rangeSeek = seek;
            const d = seek.ownerDocument;
            rangeLayer = d.createElement('div');
            rangeLayer.className = 'max-ab-layer';
            rangeLayer.setAttribute('aria-hidden', 'true');
            rangeFill = d.createElement('div'); rangeFill.className = 'max-ab-fill';
            function createMarker(label) {
                const el = d.createElement('div'); el.className = 'max-ab-marker';
                const text = d.createElement('span'); text.textContent = label;
                el.append(text); return el;
            }
            markA = createMarker('A'); markB = createMarker('B');
            rangeLayer.append(rangeFill, markA, markB);
            seek.parentElement.append(rangeLayer);
            if (typeof ResizeObserver !== 'undefined') {
                rangeObserver = new ResizeObserver(updateRange);
                rangeObserver.observe(seek);
            }
        }
        const duration = video.duration;
        rangeLayer.hidden = !Number.isFinite(duration) || duration <= 0 || a === null;
        if (rangeLayer.hidden) return;
        // Match the range thumb's center travel, including its endpoint inset.
        const thumb = 16;
        rangeLayer.style.left = `${seek.offsetLeft + thumb / 2}px`;
        rangeLayer.style.top = `${seek.offsetTop + seek.offsetHeight / 2 - 3}px`;
        rangeLayer.style.width = `${Math.max(0, seek.offsetWidth - thumb)}px`;
        const percent = t => Math.max(0, Math.min(100, t / duration * 100));
        markA.style.left = `${percent(a)}%`;
        markB.hidden = b === null;
        rangeFill.hidden = b === null;
        if (b !== null) {
            markB.style.left = `${percent(b)}%`;
            rangeFill.style.left = `${percent(a)}%`;
            rangeFill.style.width = `${Math.max(0, percent(b) - percent(a))}%`;
        }
        rangeLayer.dataset.active = String(looping);
    }
    function setA() {
        if (!video || !Number.isFinite(video.currentTime)) return;
        a = video.currentTime;
        if (b !== null && b <= a + 0.1) b = null;
        looping = false;
        rememberRange();
        render('已设 A；到结束位置按 ] 设置 B');
    }
    function setB() {
        if (!video || a === null) return render('请先设置 A 点');
        if (video.currentTime <= a + 0.1) return render('B 必须比 A 至少晚 0.1 秒');
        b = video.currentTime;
        looping = true;
        video.currentTime = a;
        rememberRange();
        render('已设置 B 并启用循环');
    }
    function clearLoop() { a = b = null; looping = false; rememberRange(); render('当前区间已清除，已保存片段不受影响'); }
    function toggleLoop() {
        if (a === null || b === null) return render('请先设置 A 和 B');
        if (!video || video.readyState < 1) return render('请先播放并等待视频加载');
        if (!Number.isFinite(video.duration) || b > video.duration + 0.1) return render('区间超出当前视频时长');
        looping = !looping;
        if (looping && (video.currentTime < a || video.currentTime >= b)) video.currentTime = a;
        render();
    }
    function enforceLoop() {
        if (!looping || !video || video.paused || video.seeking || video.readyState < 2) return;
        if (video.currentTime >= b || video.currentTime < a - 0.15) video.currentTime = a;
    }
    function onEnded() {
        if (!looping || !video) return;
        video.currentTime = a;
        video.play().catch(() => render('请点击播放继续循环'));
    }
    function stopFrames() {
        if (activeFrame !== null && frameVideo?.cancelVideoFrameCallback) frameVideo.cancelVideoFrameCallback(activeFrame);
        activeFrame = null;
    }
    function startFrames() {
        stopFrames();
        frameVideo = video;
        if (!video?.requestVideoFrameCallback || video.paused) return;
        const tick = () => {
            enforceLoop();
            if (frameVideo === video && !video.paused) activeFrame = video.requestVideoFrameCallback(tick);
        };
        activeFrame = video.requestVideoFrameCallback(tick);
    }
    function bindVideo(v) {
        if (v === video) return;
        if (video) {
            stopFrames();
            video.removeEventListener('timeupdate', enforceLoop);
            video.removeEventListener('ended', onEnded);
            video.removeEventListener('play', startFrames);
            video.removeEventListener('pause', stopFrames);
            video.removeEventListener('durationchange', updateRange);
            video.removeEventListener('loadedmetadata', updateRange);
            video.removeEventListener('timeupdate', syncSeek);
        }
        video = v;
        // Quality switches can replace or empty the media element: retain saved ranges.
        if (recordKey !== videoKey()) loadRecord();
        video.addEventListener('timeupdate', enforceLoop);
        video.addEventListener('ended', onEnded);
        video.addEventListener('play', startFrames);
        video.addEventListener('pause', stopFrames);
        video.addEventListener('durationchange', updateRange);
        video.addEventListener('loadedmetadata', updateRange);
        video.addEventListener('timeupdate', syncSeek);
        startFrames();
    }
    function syncSeek() {
        if (!seekControl || !video) return;
        const ready = Number.isFinite(video.duration) && video.duration > 0;
        seekControl.disabled = !ready;
        if (!rangeInputActive && ready) seekControl.value = String(video.currentTime / video.duration * 100);
    }
    function onKey(e) {
        const t = e.target;
        if (e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey ||
            t?.isContentEditable || t?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
        const actions = {BracketLeft:setA, BracketRight:setB, Backslash:clearLoop, KeyL:toggleLoop, KeyP:togglePopout};
        const action = actions[e.code];
        if (!action || !video) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        action();
    }
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('storage', e => {
        if (e.key !== recordKey) return;
        try { clips = readRecord().clips; refreshClips(); }
        catch { render('其他标签页的片段更新未能读取'); }
    });

    function placeBar(wrapper) {
        if (bar.parentElement !== sourceDoc.body) sourceDoc.body.append(bar);
    }

    function restore() {
        if (!pip) return;
        const wasPlaying = video && !video.paused;
        if (marker?.parentNode) {
            marker.replaceWith(container);
            placeBar(container);
        } else if (container) {
            sourceDoc.body.append(container, bar);
        }
        marker = null;
        container?.classList.remove('max-pip-media');
        if (video) video.controls = controlsBeforePopout;
        pip = null;
        if (wasPlaying) video.play().catch(() => render('请点击播放'));
        render('播放器已放回网页');
    }
    async function togglePopout() {
        if (pip && !pip.closed) { pip.close(); return; }
        if (moving) return;
        if (!window.documentPictureInPicture || window.top !== window) {
            if (video?.requestPictureInPicture) {
                try { await video.requestPictureInPicture(); render('当前环境使用基础画中画；片段控制留在网页'); }
                catch (error) {render(`画中画不可用：${error.message}`);}
            } else render('当前浏览器/嵌入视频不支持画中画');
            return;
        }
        if (sourceDoc.pictureInPictureElement) return render('请先退出普通画中画，再点击此按钮');
        container = video?.closest('.plyr, .video-js, .jwplayer') || video;
        if (!container) return render('未找到视频，请开始播放后重试');
        controlsBeforePopout = video.controls;
        moving = true;
        const wasPlaying = !video.paused;
        try {
            // Must be called directly during the user's click/key event.
            pip = await window.documentPictureInPicture.requestWindow({width:960,height:650});
            pip.addEventListener('pagehide', restore, {once:true});
            const d = pip.document;
            d.title = '播放器 · A–B 循环';
            const base = d.createElement('base');
            base.href = sourceDoc.baseURI;
            d.head.append(base);
            for (const sheet of sourceDoc.styleSheets) {
                try {
                    const style = d.createElement('style');
                    style.textContent = Array.from(sheet.cssRules, r => r.cssText).join('\n');
                    d.head.append(style);
                } catch {
                    if (!sheet.href) continue;
                    const link = d.createElement('link');
                    link.rel = 'stylesheet'; link.href = sheet.href;
                    d.head.append(link);
                }
            }
            addStyle(d);
            // Plyr can reference an SVG symbol sprite outside its own container.
            const spriteIds = new Set();
            for (const use of container.querySelectorAll('use')) {
                const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
                if (!href.startsWith('#')) continue;
                const symbol = sourceDoc.getElementById(href.slice(1));
                const sprite = symbol?.closest('svg');
                if (sprite && !container.contains(sprite) && !spriteIds.has(sprite)) {
                    spriteIds.add(sprite);
                    const clone = sprite.cloneNode(true);
                    clone.style.display = 'none';
                    d.body.append(clone);
                }
            }
            d.body.className = 'max-pip';
            marker = sourceDoc.createElement('div');
            marker.textContent = '播放器已在独立浮窗中打开；关闭浮窗可返回。';
            marker.style.cssText = 'padding:24px;background:#142033;color:white;';
            container.before(marker);
            container.classList.add('max-pip-media');
            if (container === video) video.controls = true;
            d.body.append(container, bar);
            pip.addEventListener('keydown', onKey, true);
            if (wasPlaying) video.play().catch(() => render('请点击播放'));
            render('浮窗已开启；本站原有缩略图是否保留取决于播放器兼容性');
        } catch (error) {
            const w = pip;
            restore();
            if (w && !w.closed) w.close();
            render(`打开失败：${error.message}`);
        } finally { moving = false; }
    }
    function findVideos(root = sourceDoc) {
        const found = Array.from(root.querySelectorAll('video'));
        for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) found.push(...findVideos(el.shadowRoot));
        }
        return found;
    }
    function mount() {
        if (pip || moving) return;
        candidates = findVideos();
        if (!candidates.length) {if (bar) bar.hidden = true; return;}
        const v = candidates.includes(video) ? video : candidates.slice().sort((x,y) => {
            const area = e => {const r=e.getBoundingClientRect();return r.width*r.height + (!e.paused?1e9:0);};
            return area(y)-area(x);
        })[0];
        if (!sourceDoc.body) return;
        if (!bar) {
            addStyle(sourceDoc);
            bar = sourceDoc.createElement('section');
            bar.className = 'max-player-tools';
            function button(label, action, parent = bar) {
                const el = sourceDoc.createElement('button');
                el.type = 'button'; el.textContent = label;
                el.addEventListener('click', action); parent.append(el); return el;
            }
            const collapse = button('收起工具', () => {
                const closed = bar.classList.toggle('max-collapsed');
                collapse.textContent = closed ? '视频工具' : '收起工具';
            });
            collapse.className = 'max-collapse';
            videoSelect = sourceDoc.createElement('select');
            videoSelect.className = 'max-video-select';
            videoSelect.setAttribute('aria-label','选择视频播放器');
            videoSelect.addEventListener('change', () => {
                const next = candidates[Number(videoSelect.value)];
                if (!next || pip) return;
                bindVideo(next); loadRecord(); syncSeek();
            });
            bar.append(videoSelect);
            button('播放 / 暂停', () => {
                if (!video) return;
                if (video.paused) video.play().catch(() => render('浏览器未允许播放，请操作原播放器'));
                else video.pause();
            });
            popButton = button('弹出完整播放器', togglePopout);
            button('设置 A [', setA);
            button('设置 B ]', setB);
            button('开/关循环 L', toggleLoop);
            button('清除循环 \\', clearLoop);
            button('切换防暂停', () => {guard = !guard; render();});
            const progress = sourceDoc.createElement('div');progress.className = 'max-progress';
            seekControl = sourceDoc.createElement('input');
            seekControl.type = 'range';seekControl.min = '0';seekControl.max = '100';seekControl.step = '0.01';
            seekControl.setAttribute('aria-label','视频进度（含 A/B 标记）');
            seekControl.addEventListener('pointerdown',()=>{rangeInputActive=true;});
            seekControl.addEventListener('input',()=>{
                if (video && Number.isFinite(video.duration)) video.currentTime = Number(seekControl.value)/100*video.duration;
            });
            seekControl.addEventListener('change',()=>{rangeInputActive=false;});
            seekControl.addEventListener('blur',()=>{rangeInputActive=false;});
            progress.append(seekControl);bar.append(progress);
            const clipRow = sourceDoc.createElement('div');
            clipRow.className = 'max-player-clips';
            clipName = sourceDoc.createElement('input');
            clipName.type = 'text'; clipName.maxLength = 80;
            clipName.placeholder = '片段名称（可选）';
            clipName.setAttribute('aria-label', '片段名称');
            clipRow.append(clipName);
            button('保存为新片段', saveClip, clipRow);
            clipSelect = sourceDoc.createElement('select');
            clipSelect.setAttribute('aria-label', '当前视频的已保存片段');
            clipSelect.addEventListener('change', () => {
                pendingDelete = null; deleteButton.textContent = '删除片段';
            });
            clipRow.append(clipSelect);
            button('播放所选片段', playClip, clipRow);
            button('重命名', renameClip, clipRow);
            deleteButton = button('删除片段', deleteClip, clipRow);
            bar.append(clipRow);
            refreshClips();
            info = sourceDoc.createElement('output'); bar.append(info);
            const help = sourceDoc.createElement('small');
            help.textContent = 'P 浮窗 / 返回 · [ 起点 · ] 终点并启用 · L 开关循环 · \\ 清除。快捷键在网页或浮窗获得焦点时生效。';
            bar.append(help);
        }
        bar.hidden = false;
        if (!videoSelect.matches(':focus')) {
            videoSelect.replaceChildren();
            candidates.forEach((item,index)=>{
                const option = sourceDoc.createElement('option');option.value=String(index);
                option.textContent = `视频 ${index+1}${item.id ? ' · '+item.id : ''}`;
                videoSelect.append(option);
            });
            videoSelect.value=String(candidates.indexOf(v));
        }
        placeBar();
        bindVideo(v);
        if (recordKey !== videoKey()) loadRecord();
        syncSeek();
        render();
    }
    if (sourceDoc.readyState === 'loading') sourceDoc.addEventListener('DOMContentLoaded', mount, {once:true});
    else mount();
    // Plyr may be created only after the first play click.
    setInterval(mount, 2000);
    console.info('[VideoPlayerToolkit] 已启用自动视频检测');
})();
