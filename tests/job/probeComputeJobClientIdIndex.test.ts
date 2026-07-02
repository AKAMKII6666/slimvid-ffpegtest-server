import { afterEach, describe, expect, it } from "vitest";

import {
	findJobIdByClientJobId,
	registerClientJobIdMapping,
	resetClientJobIdIndexForTests,
} from "@worker/job/probeComputeJobClientIdIndex.memory.js";

afterEach(function cleanup(): void {
	resetClientJobIdIndexForTests();
});

describe("probeComputeJobClientIdIndex", function () {
	it("returns jobId within TTL", function () {
		registerClientJobIdMapping("client-1", "job-abc", 10_000, 1_000);
		expect(findJobIdByClientJobId("client-1", 5_000)).toBe("job-abc");
	});

	it("expires mapping after TTL", function () {
		registerClientJobIdMapping("client-2", "job-def", 1_000, 1_000);
		expect(findJobIdByClientJobId("client-2", 2_500)).toBeNull();
	});
});
