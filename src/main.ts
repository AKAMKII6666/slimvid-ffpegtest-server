/**
 * 模块名称：Probe Worker 进程入口
 * 模块说明：加载配置、探测能力、启动 Fastify HTTP 服务。
 */

import { loadProbeWorkerConfig } from "./config/loadProbeWorkerConfig.js";
import { createProbeWorkerApp } from "./http/createProbeWorkerApp.js";
import {
	createModuleLogger,
	resolveProbeWorkerLogDir,
} from "./logging/createModuleLogger.js";

async function main(): Promise<void> {
	const log = createModuleLogger({ module: "main" });
	const config = await loadProbeWorkerConfig();
	const app = await createProbeWorkerApp({ config });

	const address = await app.listen({
		host: config.server.host,
		port: config.server.port,
	});

	log.info(
		{
			host: config.server.host,
			port: config.server.port,
			address,
			logDir: resolveProbeWorkerLogDir(),
		},
		"probe worker listening",
	);
}

main().catch(function onFatalError(error: unknown): void {
	const log = createModuleLogger({ module: "main" });
	log.fatal({ err: error }, "probe worker failed to start");
	process.exitCode = 1;
});
