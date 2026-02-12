import { httpRouter } from "convex/server";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// 1. 다이렉트 접수 (HTTP POST)
http.route({
    path: "/submit",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        const { name, phone } = await request.json();
        const requestId = await ctx.runMutation(api.requests.submit, { name, phone });
        return new Response(JSON.stringify({ requestId }), {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Content-Type": "application/json",
            },
        });
    }),
});

// 2. 어드민 목록 조회 (HTTP GET)
http.route({
    path: "/list",
    method: "GET",
    handler: httpAction(async (ctx) => {
        const requests = await ctx.runQuery(api.requests.list);
        return new Response(JSON.stringify(requests), {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
        });
    }),
});

// 3. 어드민 상세 조회 (HTTP GET)
http.route({
    path: "/getDetail",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
        const url = new URL(request.url);
        const requestId = url.searchParams.get("requestId");
        const data = await ctx.runQuery(api.requests.getDetail, { requestId: requestId as any });
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
        });
    }),
});

// 4. 업데이트 반영 (HTTP POST)
http.route({
    path: "/update",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        const args = await request.json();
        await ctx.runMutation(api.requests.updateStatus, {
            requestId: args.requestId,
            status: args.status,
            memo: args.memo
        });
        if (args.imageId) {
            await ctx.runMutation(api.images.updateImageResult, {
                imageId: args.imageId,
                width: args.width,
                height: args.height
            });
        }
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
        });
    }),
});

// 5. 업로드 URL 생성 (HTTP POST)
http.route({
    path: "/generateUploadUrl",
    method: "POST",
    handler: httpAction(async (ctx) => {
        const url = await ctx.runMutation(api.images.generateUploadUrl);
        return new Response(JSON.stringify({ url }), {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
        });
    }),
});

// 6. 이미지 정보 저장 (HTTP POST)
http.route({
    path: "/saveImage",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        const args = await request.json();
        await ctx.runMutation(api.images.saveImage, args);
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
        });
    }),
});

// 7. 이미지 다이렉트 프록시 (HTTP GET)
http.route({
    path: "/getImage",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
        const url = new URL(request.url);
        const storageId = url.searchParams.get("storageId");
        if (!storageId) return new Response("Missing storageId", { status: 400 });
        const blob = await ctx.storage.get(storageId);
        if (!blob) return new Response("Image not found", { status: 404 });
        return new Response(blob, {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "image/jpeg",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    }),
});

// 8. 요청 삭제 (HTTP POST)
http.route({
    path: "/delete",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        const { requestId } = await request.json();
        await ctx.runMutation(api.requests.remove, { requestId: requestId as any });
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
        });
    }),
});

// OPTIONS HANDLERS
http.route({ path: "/submit", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } })) });
http.route({ path: "/list", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } })) });
http.route({ path: "/getDetail", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } })) });
http.route({ path: "/update", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } })) });
http.route({ path: "/generateUploadUrl", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" } })) });
http.route({ path: "/saveImage", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } })) });
http.route({ path: "/getImage", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } })) });

http.route({ path: "/delete", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } })) });

export default http;
