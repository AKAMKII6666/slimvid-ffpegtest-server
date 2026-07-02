/**
 * 模块名称：Job API 测试夹具
 * 模块说明：合法 POST /v1/jobs body 样本。
 */

export const VALID_COMPARE_JOB_BODY = {
	schemaVersion: 1,
	jobKind: "compare",
	caller: {
		shopDomain: "shop.myshopify.com",
		productId: "gid://shopify/Product/1",
		videoId: "gid://shopify/Video/1",
	},
	compare: {
		productName: "Demo Product",
		renditions: [
			{
				group: "shopify",
				label: "Original source",
				url: "https://cdn.example.com/original.mp4",
			},
		],
	},
} as const;

export const VALID_VMAF_JOB_BODY = {
	schemaVersion: 1,
	jobKind: "vmaf",
	clientJobId: "shop.myshopify.com:gid://shopify/Video/1",
	caller: {
		shopDomain: "shop.myshopify.com",
		productId: "gid://shopify/Product/1",
		videoId: "gid://shopify/Video/1",
	},
	vmaf: {
		reference: {
			label: "Original source",
			url: "https://cdn.example.com/original.mp4",
		},
		candidates: [
			{
				label: "720p",
				group: "shopify",
				url: "https://cdn.example.com/720p.mp4",
				width: 1280,
				height: 720,
				formatHint: "mp4",
				mimeType: "video/mp4",
			},
		],
	},
} as const;

export const VALID_UNIFIED_JOB_BODY = {
	...VALID_COMPARE_JOB_BODY,
	jobKind: "unified",
	vmaf: VALID_VMAF_JOB_BODY.vmaf,
} as const;

export const AUTH_HEADERS = {
	authorization: "Bearer test-token",
	"x-probe-schema-version": "1",
} as const;
