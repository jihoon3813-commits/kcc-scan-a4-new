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

// 2. 업로드 URL 생성 (HTTP POST)
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

// 3. 이미지 정보 저장 (HTTP POST)
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

// OPTIONS (CORS 전용)
http.route({
    path: "/submit", method: "OPTIONS",
    handler: httpAction(async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } }))
});
http.route({
    path: "/generateUploadUrl", method: "OPTIONS",
    handler: httpAction(async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } }))
});
http.route({
    path: "/saveImage", method: "OPTIONS",
    handler: httpAction(async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } }))
});

export default http;
