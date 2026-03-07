import api from "@/lib/api-client";
import { IPage } from "@/features/page/types/page.types";

import {
  ICreateShare,
  IReshareShareInput,
  IShare,
  ISharedItem,
  ISharedPage,
  ISharedPageRenderedSegment,
  ISharedPageTree,
  IShareForPage,
  ISharePageSegmentInput,
  IShareInfoInput,
  IUpdateShare,
  IVerifyShareAccessInput,
  IVerifyShareAccessOutput,
} from "@/features/share/types/share.types.ts";
import { IPagination, QueryParams } from "@/lib/types.ts";

function unwrapApiData<T>(response: any): T {
  if (response == null) {
    return response as T;
  }

  if (typeof response === "object" && "data" in response) {
    return response.data as T;
  }

  return response as T;
}

export async function getShares(
  params?: QueryParams,
): Promise<IPagination<ISharedItem>> {
  const req = await api.post("/shares", params);
  return unwrapApiData<IPagination<ISharedItem>>(req);
}

export async function createShare(data: ICreateShare): Promise<any> {
  const req = await api.post<any>("/shares/create", data);
  return unwrapApiData<any>(req);
}

export async function getShareInfo(
  shareId: string,
  accessToken?: string,
  metadataOnly?: boolean,
): Promise<IShare> {
  const req = await api.post<IShare>("/shares/info", {
    shareId,
    accessToken,
    metadataOnly,
  });
  return unwrapApiData<IShare>(req);
}

export async function updateShare(data: IUpdateShare): Promise<any> {
  const req = await api.post<any>("/shares/update", data);
  return unwrapApiData<any>(req);
}

export async function getShareForPage(pageId: string): Promise<IShareForPage> {
  const req = await api.post<any>("/shares/for-page", { pageId });
  return unwrapApiData<IShareForPage>(req);
}

export async function getSharePageInfo(
  shareInput: Partial<IShareInfoInput>,
): Promise<ISharedPage> {
  const req = await api.post<ISharedPage>("/shares/page-info", shareInput);
  return unwrapApiData<ISharedPage>(req);
}

export async function getSharePageSegment(
  shareInput: Partial<ISharePageSegmentInput>,
): Promise<ISharedPageRenderedSegment> {
  const req = await api.post<ISharedPageRenderedSegment>(
    "/shares/page-segment",
    shareInput,
  );
  return unwrapApiData<ISharedPageRenderedSegment>(req);
}

export async function deleteShare(shareId: string): Promise<void> {
  await api.post("/shares/delete", { shareId });
}

export async function getSharedPageTree(
  shareId: string,
  accessToken?: string,
): Promise<ISharedPageTree> {
  const req = await api.post<ISharedPageTree>("/shares/tree", {
    shareId,
    accessToken,
  });
  return unwrapApiData<ISharedPageTree>(req);
}

export async function verifyShareAccess(
  data: IVerifyShareAccessInput,
): Promise<IVerifyShareAccessOutput> {
  const req = await api.post<IVerifyShareAccessOutput>(
    "/shares/verify-access",
    data,
  );
  return unwrapApiData<IVerifyShareAccessOutput>(req);
}

export async function reshareShare(
  data: IReshareShareInput,
): Promise<IShare> {
  try {
    const req = await api.post<IShare>("/shares/reshare", data);
    return unwrapApiData<IShare>(req);
  } catch (error: any) {
    const status = error?.response?.status ?? error?.status;
    if (status !== 404) {
      throw error;
    }

    const fallbackReq = await api.post<IShare>(
      "/shares/regenerate-protected",
      data,
    );
    return unwrapApiData<IShare>(fallbackReq);
  }
}
