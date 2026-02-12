import { httpRouter } from "convex/server";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// Direct HTTP Submission Fallback
http.route({
    path: "/submit",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        const { name, phone, photos } = await request.json();

        // 1. Create Request
        const requestId = await ctx.runMutation(api.requests.submit, { name, phone });

        return new Response(JSON.stringify({ success: true, requestId }), {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
        });
    }),
});

// Preflight CORS
http.route({
    path: "/submit",
    method: "OPTIONS",
    handler: httpAction(async (ctx, request) => {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }),
});

export default http;
