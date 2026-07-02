import { describe, expect, it } from "vitest";

import { parseAllowedVmafModelOption } from "@worker/http/guards/parseAllowedVmafModelOption.js";

describe("parseAllowedVmafModelOption", function () {
	it("accepts vmaf_v0.6.1", function () {
		expect(parseAllowedVmafModelOption("vmaf_v0.6.1")).toBe("vmaf_v0.6.1");
	});

	it("returns undefined when omitted", function () {
		expect(parseAllowedVmafModelOption(undefined)).toBeUndefined();
	});

	it("rejects injection-like model strings", function () {
		expect(parseAllowedVmafModelOption("vmaf_v0.6.1:log_path=/tmp/evil")).toBeNull();
		expect(parseAllowedVmafModelOption("../etc/passwd")).toBeNull();
	});
});
