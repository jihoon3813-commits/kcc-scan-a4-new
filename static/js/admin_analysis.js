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
let refPoints = null; // [{x,y}, {x,y}, {x,y}, {x,y}]
let dragPointIndex = -1;
let dragMeasureIndex = -1;
let isRefLocked = false;
let measurePoints = null; // [{x,y}, {x,y}, {x,y}, {x,y}]

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
                <div class="flex justify-between items-start group">
                    <div class="flex-1">
                        <p class="font-bold text-gray-800">${name} <span class="text-blue-500 text-xs">[${imgCount}]</span></p>
                        <p class="text-[10px] text-gray-400">ID: ${req._id.substring(0, 8)}</p>
                    </div>
                    <div class="flex flex-col items-end gap-2">
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-black ${getStatusColor(status)}">${status}</span>
                        <button onclick="deleteRequest('${req._id}', event)" class="opacity-0 group-hover:opacity-100 text-xs text-red-300 hover:text-red-500 transition-all font-black p-1">✕</button>
                    </div>
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

async function deleteRequest(id, e) {
    if (e) e.stopPropagation();
    if (!confirm("해당 고객의 모든 자료를 완전히 삭제하시겠습니까?")) return;

    try {
        if (HTTP_MODE) {
            const res = await fetch(`${SITE_URL}/delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requestId: id })
            });
            if (!res.ok) throw new Error("Server returned error during delete");
        } else {
            await convexClient.mutation("requests:remove", { requestId: id });
        }
        alert("성공적으로 삭제되었습니다.");
        if (currentRequestId === id) location.reload();
        else loadRequests();
    } catch (err) {
        console.error(err);
        alert("삭제 중 오류가 발생했습니다.");
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
            // Convert rect to 4 points
            const b = data.box;
            refPoints = [
                { x: b.x, y: b.y },
                { x: b.x + b.w, y: b.y },
                { x: b.x + b.w, y: b.y + b.h },
                { x: b.x, y: b.y + b.h }
            ];
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

        // Reset tool state for new image
        refPoints = null;
        measurePoints = null;
        isRefLocked = false;
        dragPointIndex = -1;
        dragMeasureIndex = -1;
        hideFloatingBtn();
        setTool('select');

        const lockBtn = document.getElementById('lockRefBtn');
        if (lockBtn) {
            lockBtn.innerText = 'UNLOCK';
            lockBtn.classList.remove('text-blue-600', 'font-black');
        }

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

    if (refPoints) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3 / currentScale;
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';

        ctx.beginPath();
        ctx.moveTo(refPoints[0].x, refPoints[0].y);
        refPoints.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        // Draw Handles
        if (mode === 'ref') {
            ctx.fillStyle = '#22c55e';
            refPoints.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 6 / currentScale, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    if (measurePoints) {
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 4 / currentScale;
        ctx.fillStyle = 'rgba(248, 113, 113, 0.1)';

        ctx.beginPath();
        ctx.moveTo(measurePoints[0].x, measurePoints[0].y);
        measurePoints.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        // Draw Handles & Labels
        if (mode === 'measure') {
            ctx.fillStyle = '#ef4444';
            measurePoints.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 6 / currentScale, 0, Math.PI * 2);
                ctx.fill();
            });
        }
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
    dragPointIndex = -1;
    dragMeasureIndex = -1;

    if (mode === 'ref') {
        if (isRefLocked && refPoints) return;

        // If near a point, drag it
        if (refPoints) {
            const hitRadius = 15 / currentScale;
            refPoints.forEach((p, i) => {
                const d = Math.sqrt((p.x - pos.x) ** 2 + (p.y - pos.y) ** 2);
                if (d < hitRadius) dragPointIndex = i;
            });
        }

        if (dragPointIndex === -1) {
            if (currentScale < 1.5) { zoomToPoint(pos.x, pos.y); isDragging = false; return; }
            // Create new box as 4 points
            refPoints = [
                { x: pos.x, y: pos.y },
                { x: pos.x, y: pos.y },
                { x: pos.x, y: pos.y },
                { x: pos.x, y: pos.y }
            ];
            dragPointIndex = 2; // Bottom-right
        }
    } else if (mode === 'measure') {
        hideFloatingBtn();

        if (measurePoints) {
            const hitRadius = 15 / currentScale;
            measurePoints.forEach((p, i) => {
                const d = Math.sqrt((p.x - pos.x) ** 2 + (p.y - pos.y) ** 2);
                if (d < hitRadius) dragMeasureIndex = i;
            });
        }

        if (dragMeasureIndex === -1) {
            measurePoints = [
                { x: pos.x, y: pos.y }, { x: pos.x, y: pos.y },
                { x: pos.x, y: pos.y }, { x: pos.x, y: pos.y }
            ];
            dragMeasureIndex = 2;
        }
    }
}

function onMouseMove(e) {
    if (!isDragging) return;
    const pos = getMousePos(e);
    if (mode === 'select') { offset.x += e.movementX; offset.y += e.movementY; }
    else if (mode === 'ref' && refPoints) {
        if (dragPointIndex === 2 && refPoints[0].x === startPos.x) {
            // Initial drawing of rectangle
            refPoints[1].x = pos.x;
            refPoints[2].x = pos.x;
            refPoints[2].y = pos.y;
            refPoints[3].y = pos.y;
        } else {
            // Drag individual corner
            refPoints[dragPointIndex].x = pos.x;
            refPoints[dragPointIndex].y = pos.y;
        }
    }
    else if (mode === 'measure' && measurePoints) {
        if (dragMeasureIndex === 2 && measurePoints[0].x === startPos.x) {
            measurePoints[1].x = pos.x;
            measurePoints[2].x = pos.x;
            measurePoints[2].y = pos.y;
            measurePoints[3].y = pos.y;
        } else {
            measurePoints[dragMeasureIndex].x = pos.x;
            measurePoints[dragMeasureIndex].y = pos.y;
        }
    }
    draw();
}

function onMouseUp(e) {
    isDragging = false;
    if (mode === 'measure' && measurePoints) showFloatingBtn(e.clientX, e.clientY);
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
    if (!refPoints || !measurePoints) return alert("기준 영역과 측정 영역(사각형)을 모두 그려주세요.");
    let refLongMm = currentRefType === 'CREDIT_CARD' ? 85.6 : 297;

    // Pixel to MM ratio from reference
    const d = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
    const refSides = [d(refPoints[0], refPoints[1]), d(refPoints[1], refPoints[2]), d(refPoints[2], refPoints[3]), d(refPoints[3], refPoints[0])];
    const pixelsPerMm = Math.max(...refSides) / refLongMm;

    // Measurement sides
    const w1 = d(measurePoints[0], measurePoints[1]); // Top
    const w2 = d(measurePoints[3], measurePoints[2]); // Bottom (p3 to p2)
    const h1 = d(measurePoints[0], measurePoints[3]); // Left (p0 to p3)
    const h2 = d(measurePoints[1], measurePoints[2]); // Right (p1 to p2)

    document.getElementById('w1').value = Math.round(w1 / pixelsPerMm);
    document.getElementById('w2').value = Math.round(w2 / pixelsPerMm);
    document.getElementById('h1').value = Math.round(h1 / pixelsPerMm);
    document.getElementById('h2').value = Math.round(h2 / pixelsPerMm);

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

function clearCurrentImage() {
    if (!confirm("현재 선택된 이미지의 모든 측정값을 초기화하시겠습니까?")) return;
    refPoints = null; measurePoints = null;
    ['w1', 'w2', 'w3', 'h1', 'h2', 'h3'].forEach(id => document.getElementById(id).value = '');
    updateAverages();
}

function resetAnalysis() {
    if (!confirm("전체 분석 데이터를 초기화하시겠습니까?")) return;
    currentImages.forEach(img => {
        img.localVals = { w1: '', w2: '', w3: '', h1: '', h2: '', h3: '' };
        img.width = 0; img.height = 0;
    });
    refPoints = null; measurePoints = null;
    ['w1', 'w2', 'w3', 'h1', 'h2', 'h3'].forEach(id => document.getElementById(id).value = '');
    updateAverages();
}

function drawOverlaysToCtx(targetCtx, w, h, isLive = false, data = null) {
    let namePhone, locRef, avgW, avgH;

    if (data) {
        namePhone = data.namePhone;
        locRef = data.locRef;
        avgW = data.avgW;
        avgH = data.avgH;
    } else {
        namePhone = document.getElementById('infoNamePhone').innerText;
        locRef = document.getElementById('infoLocationRef').innerText;
        avgW = document.getElementById('resWidth').value;
        avgH = document.getElementById('resHeight').value;
    }

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

async function downloadAllImages() {
    if (!currentImages || currentImages.length === 0) return alert("다운로드할 이미지가 없습니다.");

    // Save current image's changes first if any
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
        }
    }

    showLoading("전체 이미지 압축 중...");

    try {
        if (typeof JSZip === 'undefined') {
            throw new Error("JSZip library not loaded");
        }

        const zip = new JSZip();
        const mainFolder = zip.folder(`SmartScan_${currentRequestId.substring(0, 8)}`);

        // Helper to load image
        const loadImage = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${src}`));
            img.src = src;
        });

        // Helper to calculate avg
        const calc = (vals) => {
            const valid = vals.filter(v => !isNaN(v) && v > 0);
            return valid.length === 0 ? 0 : Math.round(valid.reduce((a, b) => a + b) / valid.length);
        };

        const getAvg = (v) => {
            if (!v) return { w: 0, h: 0 };
            const w = [v.w1, v.w2, v.w3].map(parseFloat);
            const h = [v.h1, v.h2, v.h3].map(parseFloat);
            return { w: calc(w), h: calc(h) };
        };

        const fullInfo = document.getElementById('infoNamePhone').innerText;

        for (let i = 0; i < currentImages.length; i++) {
            const item = currentImages[i];
            const img = await loadImage(item.image_path);

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            let wVal = item.width, hVal = item.height;
            // Prefer local calculated values
            if (item.localVals) {
                const avgs = getAvg(item.localVals);
                if (avgs.w > 0) wVal = avgs.w;
                if (avgs.h > 0) hVal = avgs.h;
            }

            const data = {
                namePhone: fullInfo,
                locRef: `${item.location_type} / ${item.reference_type}`,
                avgW: wVal,
                avgH: hVal
            };

            drawOverlaysToCtx(ctx, canvas.width, canvas.height, false, data);

            // Add to zip
            const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            mainFolder.file(`${item.location_type}_${i + 1}.png`, blob);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = `SmartScan_All_${currentRequestId.substring(0, 8)}.zip`;
        link.click();

        hideLoading();
        alert("전체 다운로드가 완료되었습니다.");

    } catch (err) {
        console.error(err);
        hideLoading();
        alert("다운로드 중 오류가 발생했습니다: " + err.message);
    }
}

init();
