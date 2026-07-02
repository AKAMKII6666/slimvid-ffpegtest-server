import { describe, expect, it } from "vitest";

import Fastify from "fastify";

import { createBearerAuthPreHandler } from "@worker/http/auth/createBearerAuthPreHandler.js";

describe("createBearerAuthPreHandler", function () {
	it("returns 401 when token missing", async function () {
		const app = Fastify();
		const preHandler = createBearerAuthPreHandler({ expectedToken: "secret" });

		app.get("/v1/test", { preHandler }, async function handler(): Promise<{ ok: true }> {
			return { ok: true };
		});

		const response = await app.inject({
			method: "GET",
			url: "/v1/test",
			headers: {
				"x-probe-schema-version": "1",
			},
		});

		expect(response.statusCode).toBe(401);
		await app.close();
	});

	it("returns 401 when token wrong", async function () {
		const app = Fastify();
		const preHandler = createBearerAuthPreHandler({ expectedToken: "secret" });

		app.get("/v1/test", { preHandler }, async function handler(): Promise<{ ok: true }> {
			return { ok: true };
		});

		const response = await app.inject({
			method: "GET",
			url: "/v1/test",
			headers: {
				authorization: "Bearer wrong",
				"x-probe-schema-version": "1",
			},
		});

		expect(response.statusCode).toBe(401);
		await app.close();
	});

	it("returns 400 when schema header missing", async function () {
		const app = Fastify();
		const preHandler = createBearerAuthPreHandler({ expectedToken: "secret" });

		app.get("/v1/test", { preHandler }, async function handler(): Promise<{ ok: true }> {
			return { ok: true };
		});

		const response = await app.inject({
			method: "GET",
			url: "/v1/test",
			headers: {
				authorization: "Bearer secret",
			},
		});

		expect(response.statusCode).toBe(400);
		await app.close();
	});

	it("allows valid bearer and schema header", async function () {
		const app = Fastify();
		const preHandler = createBearerAuthPreHandler({ expectedToken: "secret" });

		app.get("/v1/test", { preHandler }, async function handler(): Promise<{ ok: true }> {
			return { ok: true };
		});

		const response = await app.inject({
			method: "GET",
			url: "/v1/test",
			headers: {
				authorization: "Bearer secret",
				"x-probe-schema-version": "1",
			},
		});

		expect(response.statusCode).toBe(200);
		await app.close();
	});
});
