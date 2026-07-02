/**
 * 模块名称：HTTP API 响应包络
 * 模块说明：统一 { ok, data } / { ok, error, code } 形状。
 */

export interface IApiOkResponse<TData> {
	ok: true;
	data: TData;
}

export interface IApiErrorResponse {
	ok: false;
	error: string;
	code?: string;
}

export type TApiResponse<TData> = IApiOkResponse<TData> | IApiErrorResponse;

export function buildOkResponse<TData>(data: TData): IApiOkResponse<TData> {
	return {
		ok: true,
		data,
	};
}

export function buildErrorResponse(
	error: string,
	code?: string,
): IApiErrorResponse {
	return {
		ok: false,
		error,
		code,
	};
}
