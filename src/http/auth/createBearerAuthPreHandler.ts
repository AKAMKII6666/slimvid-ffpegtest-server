/**
 * 模块名称：Bearer 鉴权
 * 模块说明：/v1/* 请求须带 Authorization: Bearer 与 X-Probe-Schema-Version: 1。
 */

import type { FastifyReply, FastifyRequest } from "fastify";

import { buildErrorResponse } from "../responses/buildApiResponse.js";

export const PROBE_API_SCHEMA_HEADER = "x-probe-schema-version";

export interface IAssertBearerAuthOptions {
	expectedToken: string;
}

function readBearerToken(authorizationHeader: string | undefined): string | null {
	if (!authorizationHeader) {
		return null;
	}
	const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
	if (!match) {
		return null;
	}
	const token = match[1]?.trim();
	if (!token) {
		return null;
	}
	return token;
}

/**
 * Fastify preHandler：校验 Bearer token 与 schema header。
 */
export function createBearerAuthPreHandler(options: IAssertBearerAuthOptions) {
	return async function assertBearerAuth(
		request: FastifyRequest,
		reply: FastifyReply,
	): Promise<void> {
		const token = readBearerToken(request.headers.authorization);
		if (!token || token !== options.expectedToken) {
			await reply.status(401).send(
				buildErrorResponse("Unauthorized", "unauthorized"),
			);
			return;
		}

		const schemaHeader = request.headers[PROBE_API_SCHEMA_HEADER];
		if (schemaHeader !== "1") {
			await reply.status(400).send(
				buildErrorResponse("Unsupported API schema version", "unsupported_schema"),
			);
			return;
		}
	};
}
