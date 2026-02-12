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

const CONVEX_URL = "https://adventurous-barracuda-87.convex.cloud";
let convexClient;

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

    try {
        const { ConvexClient } = await import("https://esm.sh/convex@1.11.0?bundle");
        convexClient = new ConvexClient(CONVEX_URL);
        console.log("Admin: Convex Client Initialized");

        if (statusTxt) statusTxt.innerText = "ONLINE";
        if (statusDot) {
            statusDot.className = "w-2 h-2 rounded-full bg-green-500";
            statusDot.classList.remove('pulse');
        }

        loadRequests();
    } catch (err) {
        console.error("Failed to load Convex:", err);
        if (statusTxt) statusTxt.innerText = "OFFLINE";
        if (statusDot) statusDot.className = "w-2 h-2 rounded-full bg-red-500";
    }
}

async function loadRequests() {
    if (!convexClient) return;
    const list = document.getElementById('requestList');

    try {
        const requests = await convexClient.query("requests:list");
        list.innerHTML = '';

        if (requests.length === 0) {
            list.innerHTML = '<li class="p-4 text-center text-gray-400">접수된 내역이 없습니다.</li>';
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
                        <p class="text-[10px] text-gray-400">번호: ${req._id.substring(0, 8)}</p>
                    </div>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${getStatusColor(status)}">${status}</span>
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
        console.error("Convex Load Error:", err);
        list.innerHTML = '<li class="p-4 text-center text-red-400">로딩 실패</li>';
    }
}

async function loadRequestDetail(requestId) {
    if (!convexClient) return;
    currentRequestId = requestId;
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('workspace').classList.remove('hidden');

    const data = await convexClient.query("requests:getDetail", { requestId });
    if (!data) return;

    document.getElementById('infoNamePhone').innerText = `${data.customer_name} / ${data.phone}`;
    document.getElementById('statusSelect').value = data.status || "자료업로드";
    document.getElementById('memoText').value = data.memo || "";

    currentImages = data.images.map(img => ({
        id: img._id,
        image_path: img.url,
        location_type: img.location,
        reference_type: img.refType,
        width: img.width || 0,
        height: img.height || 0
    }));

    renderGallery();
    if (currentImages.length > 0) {
        selectImage(currentImages[0].id);
    }

    // Refresh list to show active selection
    document.querySelectorAll('#requestList li').forEach(li => {
        li.classList.toggle('bg-blue-50', li.innerHTML.includes(requestId.substring(0, 8)));
    });
}

async function saveResult() {
    if (!currentRequestId || !selectedImageId || !convexClient) return;

    showLoading("데이터 저장 중...");

    try {
        const status = document.getElementById('statusSelect').value;
        const memo = document.getElementById('memoText').value;
        const width = parseFloat(document.getElementById('resWidth').value) || 0;
        const height = parseFloat(document.getElementById('resHeight').value) || 0;

        // 1. Update Request
        await convexClient.mutation("requests:updateStatus", {
            requestId: currentRequestId,
            status,
            memo
        });

        // 2. Update Image Result
        await convexClient.mutation("images:updateImageResult", {
            imageId: selectedImageId,
            width,
            height
        });

        hideLoading();
        alert("데이터가 Convex에 안전하게 저장되었습니다.");
        loadRequests(); // Refresh list to update status colors
    } catch (err) {
        console.error(err);
        hideLoading();
        alert("저장 중 오류가 발생했습니다.");
    }
}

async function autoDetect() {
    if (!selectedImageId || !convexClient) return;
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
    if (status === '자료업로드') return 'bg-gray-200 text-gray-700';
    if (status === '분석완료') return 'bg-blue-100 text-blue-700';
    if (status === '견적완료') return 'bg-green-100 text-green-700';
    return 'bg-gray-100';
}

function toggleRefLock() {
    isRefLocked = !isRefLocked;
    const btn = document.getElementById('lockRefBtn');
    if (isRefLocked) {
        btn.innerText = '🔒 기준물체 잠금됨';
        btn.classList.replace('bg-gray-200', 'bg-green-600');
        btn.classList.replace('text-gray-700', 'text-white');
    } else {
        btn.innerText = '🔓 잠금해제 상태';
        btn.classList.replace('bg-green-600', 'bg-gray-200');
        btn.classList.replace('text-white', 'text-gray-700');
    }
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
        thumb.className = `flex-shrink-0 w-20 h-20 rounded border-2 cursor-pointer transition-all overflow-hidden bg-gray-200 ${isSelected ? 'border-blue-500 scale-105' : 'border-transparent opacity-70 hover:opacity-100'}`;

        thumb.innerHTML = `<img src="${img.image_path}" class="w-full h-full object-cover" loading="lazy">`;
        thumb.onclick = () => selectImage(img.id);
        gallery.appendChild(thumb);
    });
}

function showLoading(msg = "사진 불러오는 중...") {
    const overlay = document.getElementById('imageLoadingOverlay');
    overlay.querySelector('p').innerText = msg;
    overlay.classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('imageLoadingOverlay').classList.add('hidden');
}

function selectImage(id) {
    selectedImageId = id;
    const imgData = currentImages.find(i => i.id === id);
    if (!imgData) return;

    document.getElementById('infoLocationRef').innerText = `${imgData.location_type} / ${imgData.reference_type}`;
    currentRefType = imgData.reference_type;

    const img = new Image();
    showLoading("이미지 고해상도 로딩 중...");
    img.crossOrigin = "anonymous";
    img.src = imgData.image_path;

    img.onload = () => {
        hideLoading();
        currentImage = img;
        resizeCanvas();
        fitImageToCanvas();

        refBox = null;
        measureLine = null;

        ['w1', 'w2', 'w3', 'h1', 'h2', 'h3'].forEach(id => document.getElementById(id).value = '');
        if (imgData.width && imgData.width > 0) document.getElementById('w1').value = imgData.width;
        if (imgData.height && imgData.height > 0) document.getElementById('h1').value = imgData.height;

        updateAverages();
        draw();
    };

    img.onerror = () => {
        hideLoading();
        alert("이미지를 불러올 수 없습니다. (CORS 또는 권한 이슈)");
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
    currentScale = Math.min(scaleX, scaleY) * 0.9;
    offset.x = (canvas.width - currentImage.width * currentScale) / 2;
    offset.y = (canvas.height - currentImage.height * currentScale) / 2;
}

function draw() {
    if (!currentImage) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1e293b";
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
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3 / currentScale;
        ctx.beginPath();
        ctx.moveTo(measureLine.x1, measureLine.y1);
        ctx.lineTo(measureLine.x2, measureLine.y2);
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(measureLine.x1, measureLine.y1, 5 / currentScale, 0, Math.PI * 2);
        ctx.arc(measureLine.x2, measureLine.y2, 5 / currentScale, 0, Math.PI * 2);
        ctx.fill();
    }

    drawOverlaysToCtx(ctx, canvas.width, canvas.height, true);
    ctx.restore();
}

function setTool(t) {
    mode = t;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50', 'text-blue-700'));
    const btn = document.querySelector(`[data-tool="${t}"]`);
    if (btn) btn.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50', 'text-blue-700');
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
        if (currentScale < 2.0) {
            zoomToPoint(pos.x, pos.y);
            isDragging = false;
            return;
        }
        refBox = { x: pos.x, y: pos.y, w: 0, h: 0 };
    } else if (mode === 'measure') {
        hideFloatingBtn();
        measureLine = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
    }
}

function onMouseMove(e) {
    if (!isDragging) return;
    const pos = getMousePos(e);

    if (mode === 'select') {
        offset.x += e.movementX;
        offset.y += e.movementY;
    } else if (mode === 'ref') {
        refBox.w = pos.x - startPos.x;
        refBox.h = pos.y - startPos.y;
    } else if (mode === 'measure') {
        measureLine.x2 = pos.x;
        measureLine.y2 = pos.y;
    }
    draw();
}

function onMouseUp(e) {
    isDragging = false;
    if (refBox && (refBox.w < 0 || refBox.h < 0)) {
        if (refBox.w < 0) { refBox.x += refBox.w; refBox.w = Math.abs(refBox.w); }
        if (refBox.h < 0) { refBox.y += refBox.h; refBox.h = Math.abs(refBox.h); }
    }
    if (mode === 'measure' && measureLine) {
        showFloatingBtn(e.clientX, e.clientY);
    }
    draw();
}

function showFloatingBtn(x, y) {
    const btn = document.getElementById('floatingCalcBtn');
    if (!btn) return;
    const rect = container.getBoundingClientRect();
    let relX = x - rect.left + 15;
    let relY = y - rect.top + 15;
    if (relX + 100 > rect.width) relX -= 120;
    if (relY + 40 > rect.height) relY -= 60;
    btn.style.left = relX + 'px';
    btn.style.top = relY + 'px';
    btn.classList.remove('hidden');
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
    if (!refBox || !measureLine) {
        alert("기준 박스와 측정 선을 모두 그려주세요.");
        return;
    }

    let refLong = currentRefType === 'CREDIT_CARD' ? 85.6 : 297;
    const isRefHoriz = Math.abs(refBox.w) > Math.abs(refBox.h);
    const calibPx = isRefHoriz ? Math.abs(refBox.w) : Math.abs(refBox.h);
    const pixelsPerMm = calibPx / refLong;

    const dx = measureLine.x2 - measureLine.x1;
    const dy = measureLine.y2 - measureLine.y1;
    const linePx = Math.sqrt(dx * dx + dy * dy);
    const finalVal = Math.round(linePx / pixelsPerMm);

    if (Math.abs(dx) > Math.abs(dy)) {
        if (!document.getElementById('w1').value) document.getElementById('w1').value = finalVal;
        else if (!document.getElementById('w2').value) document.getElementById('w2').value = finalVal;
        else document.getElementById('w3').value = finalVal;
    } else {
        if (!document.getElementById('h1').value) document.getElementById('h1').value = finalVal;
        else if (!document.getElementById('h2').value) document.getElementById('h2').value = finalVal;
        else document.getElementById('h3').value = finalVal;
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
    if (!confirm("분석 데이터를 초기화하시겠습니까?")) return;
    refBox = null;
    measureLine = null;
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
    const fontSize = (isLive ? 16 : 30) * scale;

    const infoX = 20 * scale;
    const infoY = 40 * scale;
    targetCtx.font = `bold ${fontSize}px sans-serif`;
    targetCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    const lines = [namePhone, locRef, `W: ${avgW}mm, H: ${avgH}mm`];
    targetCtx.fillRect(infoX - 8 * scale, infoY - fontSize * 1.1, 400 * scale, fontSize * 4.5);
    targetCtx.fillStyle = 'white';
    lines.forEach((l, i) => targetCtx.fillText(l, infoX, infoY + (i * fontSize * 1.3)));

    if (!isLive && measureLine) {
        targetCtx.strokeStyle = '#ef4444';
        targetCtx.lineWidth = 5 * scale;
        targetCtx.beginPath();
        targetCtx.moveTo(measureLine.x1, measureLine.y1);
        targetCtx.lineTo(measureLine.x2, measureLine.y2);
        targetCtx.stroke();
    }
    targetCtx.restore();
}

function downloadImage() {
    if (!currentImage) return;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = currentImage.width;
    exportCanvas.height = currentImage.height;
    const eCtx = exportCanvas.getContext('2d');
    eCtx.drawImage(currentImage, 0, 0);
    drawOverlaysToCtx(eCtx, exportCanvas.width, exportCanvas.height, false);
    const link = document.createElement('a');
    link.download = `Analysis_${selectedImageId.substring(0, 8)}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
}

async function copyImageToClipboard() {
    if (!currentImage) return;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = currentImage.width;
    exportCanvas.height = currentImage.height;
    const eCtx = exportCanvas.getContext('2d');
    eCtx.drawImage(currentImage, 0, 0);
    drawOverlaysToCtx(eCtx, exportCanvas.width, exportCanvas.height, false);
    const blob = await new Promise(res => exportCanvas.toBlob(res, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    alert("클립보드에 복사되었습니다.");
}

init();
