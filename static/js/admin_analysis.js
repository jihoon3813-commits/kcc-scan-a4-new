const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvasContainer');

let currentImage = null;
let currentRequestId = null;
let currentScale = 1;
let offset = { x: 0, y: 0 };
let isDragging = false;
let startPos = { x: 0, y: 0 };

let mode = 'select'; // select, ref, measure
let previousMode = 'select';
let refBox = null;
let isRefLocked = false;
let measureLine = null;

let currentRefType = 'A4';
let currentImages = [];
let selectedImageId = null;

const CONVEX_URL = "https://benevolent-kudu-521.convex.cloud";
const SITE_URL = "https://benevolent-kudu-521.convex.site";
let convexClient;
let HTTP_MODE = false;

async function init() {
    // Event Listeners
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', resizeCanvas);

    // Zoom & Spacebar
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && mode !== 'select') {
            previousMode = mode;
            setTool('select');
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && mode === 'select' && previousMode !== 'select') {
            setTool(previousMode);
        }
    });

    resizeCanvas();
    await initConvex();
}

async function initConvex() {
    const statusTxt = document.getElementById('statusTxt');
    const statusDot = document.getElementById('statusDot');

    if (statusTxt) statusTxt.innerText = "CONNECTING";

    const sources = [
        "https://esm.sh/convex@1.11.0?bundle",
        "https://cdn.jsdelivr.net/npm/convex@1.11.0/dist/browser/index.js",
        "https://unpkg.com/convex@1.11.0/dist/browser/index.js"
    ];

    for (let src of sources) {
        try {
            const { ConvexClient } = await import(src);
            convexClient = new ConvexClient(CONVEX_URL);
            console.log("Admin: Connected via " + src);

            if (statusTxt) statusTxt.innerText = "ONLINE";
            if (statusDot) {
                statusDot.className = "w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]";
                statusDot.classList.remove('pulse');
            }
            HTTP_MODE = false;
            loadRequests();
            return;
        } catch (e) {
            console.warn(`Source ${src} failed for admin...`);
        }
    }

    // --- Fallback to Direct HTTP Mode ---
    console.warn("Convex Library blocked. Entering Direct HTTP Mode.");
    HTTP_MODE = true;
    if (statusTxt) statusTxt.innerText = "FALLBACK";
    if (statusDot) {
        statusDot.className = "w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]";
        statusDot.classList.remove('pulse');
    }
    loadRequests();
}

async function loadRequests() {
    const list = document.getElementById('requestList');
    try {
        let requests;
        if (HTTP_MODE) {
            const res = await fetch(`${SITE_URL}/list`);
            requests = await res.json();
        } else {
            requests = await convexClient.query("requests:list");
        }

        list.innerHTML = '';
        if (!requests || requests.length === 0) {
            list.innerHTML = '<li class="p-4 text-center text-gray-400 font-bold">접수 내역이 없습니다.</li>';
            return;
        }

        requests.forEach((req, index) => {
            const name = req.customer_name || "이름없음";
            const status = req.status || "자료업로드";
            const dateStr = req.createdAt;
            const imgCount = req.imageCount || 0;

            const li = document.createElement('li');
            li.className = `p-4 hover:bg-blue-50 cursor-pointer border-b transition-colors ${currentRequestId === req._id ? 'bg-blue-50' : ''}`;
            li.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-gray-800">${name} <span class="text-blue-500 text-xs">[${imgCount}]</span></p>
                        <p class="text-[10px] text-gray-400">ID: ${req._id.substring(0, 8)}</p>
                    </div>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-black ${getStatusColor(status)}">${status}</span>
                </div>
                <p class="text-[10px] text-gray-400 mt-1">${new Date(dateStr).toLocaleString()}</p>
            `;
            li.onclick = () => loadRequestDetail(req._id);
            list.appendChild(li);

            if (index === 0 && !currentRequestId) {
                loadRequestDetail(req._id);
            }
        });
    } catch (err) {
        console.error("Load Error:", err);
        list.innerHTML = '<li class="p-4 text-center text-red-400 font-bold">연결 실패</li>';
    }
}

async function loadRequestDetail(requestId) {
    currentRequestId = requestId;

    try {
        let data;
        if (HTTP_MODE) {
            const res = await fetch(`${SITE_URL}/getDetail?requestId=${requestId}`);
            data = await res.json();
        } else {
            data = await convexClient.query("requests:getDetail", { requestId });
        }

        if (!data) return;

        // Show workspace only when data is ready
        document.getElementById('emptyState').classList.add('hidden');
        const ws = document.getElementById('workspace');
        ws.classList.remove('hidden');
        setTimeout(() => ws.classList.remove('opacity-0'), 10);

        document.getElementById('infoNamePhone').innerText = `${data.customer_name} / ${data.phone}`;
        document.getElementById('statusSelect').value = data.status || "자료업로드";
        document.getElementById('memoText').value = data.memo || "";

        currentImages = data.images.map(img => ({
            id: img._id,
            // SECURITY: Use SITE_URL proxy if library is blocked, as site domain is verified allowed
            image_path: HTTP_MODE ? `${SITE_URL}/getImage?storageId=${img.storageId}` : img.url,
            location_type: img.location,
            reference_type: img.refType,
            width: img.width || 0,
            height: img.height || 0,
            // Local state to hold unsaved measurements
            localVals: {
                w1: img.width || '', w2: '', w3: '',
                h1: img.height || '', h2: '', h3: ''
            }
        }));

        renderGallery();
        if (currentImages.length > 0) {
            selectImage(currentImages[0].id);
        }

        // Highlight active item in sidebar
        document.querySelectorAll('#requestList li').forEach(li => {
            const isMatch = li.innerHTML.includes(requestId.substring(0, 8));
            li.classList.toggle('bg-blue-50', isMatch);
            li.classList.toggle('sidebar-item-active', isMatch);
        });
    } catch (err) {
        console.error(err);
        alert("상세 데이터를 가져오는데 실패했습니다.");
    }
}

async function saveResult() {
    if (!currentRequestId || !selectedImageId) return;
    showLoading("데이터 저장 중...");

    try {
        const status = document.getElementById('statusSelect').value;
        const memo = document.getElementById('memoText').value;
        const width = parseFloat(document.getElementById('resWidth').value) || 0;
        const height = parseFloat(document.getElementById('resHeight').value) || 0;

        if (HTTP_MODE) {
            await fetch(`${SITE_URL}/update`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requestId: currentRequestId,
                    imageId: selectedImageId,
                    status, memo, width, height
                })
            });
        } else {
            await convexClient.mutation("requests:updateStatus", { requestId: currentRequestId, status, memo });
            await convexClient.mutation("images:updateImageResult", { imageId: selectedImageId, width, height });
        }

        // Sync local state to persistent state
        const imgData = currentImages.find(i => i.id === selectedImageId);
        if (imgData) {
            imgData.width = width;
            imgData.height = height;
        }

        hideLoading();
        alert("데이터가 Convex에 안전하게 저장되었습니다.");
        // loadRequests(); // Removed auto-reload to prevent losing current view
    } catch (err) {
        console.error(err);
        hideLoading();
        alert("저장 중 오류가 발생했습니다.");
    }
}

async function autoDetect() {
    if (!selectedImageId || HTTP_MODE) return alert("자동 분석은 'ONLINE' 모드에서만 지원됩니다.");
    showLoading("AI 자동분석 중...");
    try {
        const data = await convexClient.action("images:analyzeImage", { imageId: selectedImageId });
        if (data.success && data.box) {
            refBox = data.box;
            draw();
            hideLoading();
            alert("기준 물체가 감지되었습니다.");
        }
    } catch (err) {
        console.error(err);
        hideLoading();
        alert("분석 실패.");
    }
}

function getStatusColor(status) {
    if (status === '자료업로드') return 'bg-slate-200 text-slate-700';
    if (status === '분석완료') return 'bg-blue-100 text-blue-700';
    if (status === '견적완료') return 'bg-green-100 text-green-700';
    return 'bg-slate-100';
}

function toggleRefLock() {
    isRefLocked = !isRefLocked;
    const btn = document.getElementById('lockRefBtn');
    btn.innerText = isRefLocked ? 'LOCKED' : 'UNLOCK';
    btn.classList.toggle('text-blue-600', isRefLocked);
    btn.classList.toggle('font-black', isRefLocked);
}

function resetZoom() {
    if (!currentImage) return;
    fitImageToCanvas();
    draw();
}

function zoomToPoint(targetX, targetY) {
    const targetScale = 4.0;
    offset.x = (canvas.width / 2) - (targetX * targetScale);
    offset.y = (canvas.height / 2) - (targetY * targetScale);
    currentScale = targetScale;
    draw();
}

function renderGallery() {
    const gallery = document.getElementById('imageGallery');
    gallery.innerHTML = '';
    currentImages.forEach(img => {
        const thumb = document.createElement('div');
        const isSelected = img.id === selectedImageId;
        thumb.className = `flex-shrink-0 w-20 h-20 rounded-xl border-2 cursor-pointer transition-all overflow-hidden bg-slate-200 ${isSelected ? 'border-blue-500 ring-4 ring-blue-50' : 'border-transparent opacity-70 hover:opacity-100'}`;
        thumb.innerHTML = `<img src="${img.image_path}" class="w-full h-full object-cover" loading="lazy">`;
        thumb.onclick = () => selectImage(img.id);
        gallery.appendChild(thumb);
    });
}

function showLoading(msg = "로딩 중...") {
    const overlay = document.getElementById('imageLoadingOverlay');
    overlay.querySelector('p').innerText = msg;
    overlay.classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('imageLoadingOverlay').classList.add('hidden');
}

function selectImage(id) {
    // Before switching, save current image's UI values to memory
    if (selectedImageId) {
        const prevImg = currentImages.find(i => i.id === selectedImageId);
        if (prevImg) {
            prevImg.localVals = {
                w1: document.getElementById('w1').value,
                w2: document.getElementById('w2').value,
                w3: document.getElementById('w3').value,
                h1: document.getElementById('h1').value,
                h2: document.getElementById('h2').value,
                h3: document.getElementById('h3').value
            };
            prevImg.localWidth = document.getElementById('resWidth').value;
            prevImg.localHeight = document.getElementById('resHeight').value;
        }
    }

    selectedImageId = id;
    const imgData = currentImages.find(i => i.id === id);
    if (!imgData) return;

    document.getElementById('infoLocationRef').innerText = `${imgData.location_type} / ${imgData.reference_type}`;
    currentRefType = imgData.reference_type;

    const img = new Image();
    showLoading("고해상도 원본 로딩 중...");
    img.crossOrigin = "anonymous";
    img.src = imgData.image_path;

    img.onload = () => {
        hideLoading();
        currentImage = img;
        resizeCanvas();
        fitImageToCanvas();
        refBox = null; measureLine = null;

        // Restore values from memory
        const v = imgData.localVals;
        document.getElementById('w1').value = v.w1;
        document.getElementById('w2').value = v.w2;
        document.getElementById('w3').value = v.w3;
        document.getElementById('h1').value = v.h1;
        document.getElementById('h2').value = v.h2;
        document.getElementById('h3').value = v.h3;

        updateAverages();
        draw();
    };

    img.onerror = () => {
        hideLoading();
        alert("이미지 불러오기 실패 (네트워크 또는 보안 이슈)");
    };
    renderGallery();
}

function resizeCanvas() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    draw();
}

function fitImageToCanvas() {
    if (!currentImage) return;
    const scaleX = canvas.width / currentImage.width;
    const scaleY = canvas.height / currentImage.height;
    currentScale = Math.min(scaleX, scaleY) * 0.95;
    offset.x = (canvas.width - currentImage.width * currentScale) / 2;
    offset.y = (canvas.height - currentImage.height * currentScale) / 2;
}

function draw() {
    if (!currentImage) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(currentScale, currentScale);
    ctx.drawImage(currentImage, 0, 0);

    if (refBox) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3 / currentScale;
        ctx.strokeRect(refBox.x, refBox.y, refBox.w, refBox.h);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.fillRect(refBox.x, refBox.y, refBox.w, refBox.h);
    }

    if (measureLine) {
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 4 / currentScale;
        ctx.beginPath();
        ctx.moveTo(measureLine.x1, measureLine.y1);
        ctx.lineTo(measureLine.x2, measureLine.y2);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        [measureLine.x1, measureLine.y1, measureLine.x2, measureLine.y2].forEach((_, i, a) => {
            if (i % 2 === 0) {
                ctx.beginPath();
                ctx.arc(a[i], a[i + 1], 6 / currentScale, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    drawOverlaysToCtx(ctx, canvas.width, canvas.height, true);
    ctx.restore();
}

function setTool(t) {
    mode = t;
    document.querySelectorAll('.tool-btn').forEach(b => {
        const isActive = b.dataset.tool === t;
        b.className = `tool-btn px-4 py-2 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${isActive ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`;
    });
    hideFloatingBtn();
}

function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left - offset.x) / currentScale,
        y: (e.clientY - rect.top - offset.y) / currentScale
    };
}

function onMouseDown(e) {
    const pos = getMousePos(e);
    isDragging = true;
    startPos = pos;
    if (mode === 'ref') {
        if (isRefLocked && refBox) return;
        if (currentScale < 1.5) { zoomToPoint(pos.x, pos.y); isDragging = false; return; }
        refBox = { x: pos.x, y: pos.y, w: 0, h: 0 };
    } else if (mode === 'measure') {
        hideFloatingBtn();
        measureLine = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
    }
}

function onMouseMove(e) {
    if (!isDragging) return;
    const pos = getMousePos(e);
    if (mode === 'select') { offset.x += e.movementX; offset.y += e.movementY; }
    else if (mode === 'ref') { refBox.w = pos.x - startPos.x; refBox.h = pos.y - startPos.y; }
    else if (mode === 'measure') { measureLine.x2 = pos.x; measureLine.y2 = pos.y; }
    draw();
}

function onMouseUp(e) {
    isDragging = false;
    if (refBox && (refBox.w < 0 || refBox.h < 0)) {
        if (refBox.w < 0) { refBox.x += refBox.w; refBox.w = Math.abs(refBox.w); }
        if (refBox.h < 0) { refBox.y += refBox.h; refBox.h = Math.abs(refBox.h); }
    }
    if (mode === 'measure' && measureLine) showFloatingBtn(e.clientX, e.clientY);
    draw();
}

function showFloatingBtn(x, y) {
    const btn = document.getElementById('floatingCalcBtn');
    if (!btn) return;
    const rect = container.getBoundingClientRect();
    let relX = x - rect.left + 15;
    let relY = y - rect.top + 15;
    btn.style.left = relX + 'px'; btn.style.top = relY + 'px'; btn.classList.remove('hidden');
}

function hideFloatingBtn() {
    const btn = document.getElementById('floatingCalcBtn');
    if (btn) btn.classList.add('hidden');
}

function onWheel(e) {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;
    currentScale *= (1 + delta);
    draw();
}

function calculateRealSize() {
    if (!refBox || !measureLine) return alert("기준 박스와 측정 선을 모두 그려주세요.");
    let refLong = currentRefType === 'CREDIT_CARD' ? 85.6 : 297;
    const calibPx = Math.abs(refBox.w) > Math.abs(refBox.h) ? Math.abs(refBox.w) : Math.abs(refBox.h);
    const pixelsPerMm = calibPx / refLong;
    const dx = measureLine.x2 - measureLine.x1;
    const dy = measureLine.y2 - measureLine.y1;
    const linePx = Math.sqrt(dx * dx + dy * dy);
    const finalVal = Math.round(linePx / pixelsPerMm);

    if (Math.abs(dx) > Math.abs(dy)) {
        if (!document.getElementById('w1').value) document.getElementById('w1').value = finalVal;
        else if (!document.getElementById('w2').value) document.getElementById('w2').value = finalVal;
        else if (!document.getElementById('w3').value) document.getElementById('w3').value = finalVal;
        else {
            // Already 3 width meas done, fill heights if empty
            if (!document.getElementById('h1').value) document.getElementById('h1').value = finalVal;
            else if (!document.getElementById('h2').value) document.getElementById('h2').value = finalVal;
            else document.getElementById('h3').value = finalVal;
        }
    } else {
        if (!document.getElementById('h1').value) document.getElementById('h1').value = finalVal;
        else if (!document.getElementById('h2').value) document.getElementById('h2').value = finalVal;
        else if (!document.getElementById('h3').value) document.getElementById('h3').value = finalVal;
        else {
            // Already 3 height meas done, fill widths if empty
            if (!document.getElementById('w1').value) document.getElementById('w1').value = finalVal;
            else if (!document.getElementById('w2').value) document.getElementById('w2').value = finalVal;
            else document.getElementById('w3').value = finalVal;
        }
    }
    updateAverages();
}

function updateAverages() {
    function calc(ids) {
        const vals = ids.map(id => parseFloat(document.getElementById(id).value)).filter(v => !isNaN(v) && v > 0);
        return vals.length === 0 ? 0 : Math.round(vals.reduce((a, b) => a + b) / vals.length);
    }
    const avgW = calc(['w1', 'w2', 'w3']);
    const avgH = calc(['h1', 'h2', 'h3']);
    document.getElementById('avgWidth').innerText = avgW;
    document.getElementById('avgHeight').innerText = avgH;
    document.getElementById('resWidth').value = avgW;
    document.getElementById('resHeight').value = avgH;
    draw();
}

function resetAnalysis() {
    if (!confirm("모든 분석 데이터를 초기화하시겠습니까?")) return;
    refBox = null; measureLine = null;
    ['w1', 'w2', 'w3', 'h1', 'h2', 'h3'].forEach(id => document.getElementById(id).value = '');
    updateAverages();
}

function drawOverlaysToCtx(targetCtx, w, h, isLive = false) {
    const namePhone = document.getElementById('infoNamePhone').innerText;
    const locRef = document.getElementById('infoLocationRef').innerText;
    const avgW = document.getElementById('resWidth').value;
    const avgH = document.getElementById('resHeight').value;
    if (!namePhone || namePhone === "-") return;
    targetCtx.save();
    const scale = isLive ? (1 / currentScale) : (w / 1200);
    // Increased font size 3x as requested: 24 -> 72 (Live), 45 -> 135 (Export)
    const fontSize = (isLive ? 72 : 135) * scale;
    targetCtx.font = `bold ${fontSize}px sans-serif`;
    targetCtx.fillStyle = 'white';
    targetCtx.shadowColor = 'black';
    targetCtx.shadowBlur = 4 * scale;
    targetCtx.fillText(`${namePhone} | ${locRef}`, 20 * scale, 80 * scale);
    targetCtx.fillStyle = '#60a5fa';
    targetCtx.fillText(`W: ${avgW}mm / H: ${avgH}mm`, 20 * scale, 80 * scale + fontSize * 1.2);
    targetCtx.restore();
}

function downloadImage() {
    if (!currentImage) return;
    const ec = document.createElement('canvas');
    ec.width = currentImage.width; ec.height = currentImage.height;
    const ectx = ec.getContext('2d');
    ectx.drawImage(currentImage, 0, 0);
    drawOverlaysToCtx(ectx, ec.width, ec.height, false);
    const link = document.createElement('a');
    link.download = `Analysis_${currentRequestId.substring(0, 8)}.png`;
    link.href = ec.toDataURL('image/png'); link.click();
}

async function copyImageToClipboard() {
    if (!currentImage) return;
    const ec = document.createElement('canvas'); ec.width = currentImage.width; ec.height = currentImage.height;
    const ectx = ec.getContext('2d'); ectx.drawImage(currentImage, 0, 0);
    drawOverlaysToCtx(ectx, ec.width, ec.height, false);
    const blob = await new Promise(res => ec.toBlob(res, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    alert("분석 이미지가 복사되었습니다.");
}

init();
