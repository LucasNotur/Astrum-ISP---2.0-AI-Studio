// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * APPSEC-02/LGPD-01: valores persistidos de mídia guardam PATH do bucket privado
 * (`tenants/...`); estes testes travam que só paths são assinados (URLs externas
 * passam direto) e que o resultado é memoizado por Map.
 */
const mockGetSignedUrl = vi.fn(async (path: string) => `https://signed.mock/${path}?token=x`);
vi.mock("@/src/lib/storage", () => ({
  getSignedUrl: (path: string) => mockGetSignedUrl(path),
}));

import { useSignedMediaUrls, resolveMediaUrl } from "../../hooks/useSignedMediaUrls";

describe("useSignedMediaUrls", () => {
  beforeEach(() => {
    mockGetSignedUrl.mockClear();
  });

  it("assina apenas valores que parecem path (tenants/...)", async () => {
    const { result } = renderHook(() =>
      useSignedMediaUrls(["tenants/t1/checkins/a.jpg", "https://external.example.com/b.jpg", null, undefined]),
    );

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockGetSignedUrl).toHaveBeenCalledWith("tenants/t1/checkins/a.jpg");
    expect(result.current.get("tenants/t1/checkins/a.jpg")).toBe("https://signed.mock/tenants/t1/checkins/a.jpg?token=x");
  });

  it("deduplica paths repetidos numa única chamada", async () => {
    const { result } = renderHook(() =>
      useSignedMediaUrls(["tenants/t1/checkins/a.jpg", "tenants/t1/checkins/a.jpg"]),
    );

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("lista vazia/sem paths → Map vazio, não chama getSignedUrl", async () => {
    const { result } = renderHook(() => useSignedMediaUrls([null, undefined, "https://external.example.com/x.jpg"]));
    await waitFor(() => expect(mockGetSignedUrl).not.toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });

  it("falha ao assinar → entra no Map como string vazia (não quebra o render)", async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useSignedMediaUrls(["tenants/t1/checkins/broken.jpg"]));
    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get("tenants/t1/checkins/broken.jpg")).toBe("");
  });
});

describe("resolveMediaUrl", () => {
  it("valor que não parece path → passa direto, ignora o Map", () => {
    const resolved = new Map([["tenants/t1/x.jpg", "https://signed.mock/x"]]);
    expect(resolveMediaUrl("https://external.example.com/y.jpg", resolved)).toBe("https://external.example.com/y.jpg");
  });

  it("path presente no Map → devolve a URL assinada", () => {
    const resolved = new Map([["tenants/t1/x.jpg", "https://signed.mock/x"]]);
    expect(resolveMediaUrl("tenants/t1/x.jpg", resolved)).toBe("https://signed.mock/x");
  });

  it("path ausente do Map (ainda resolvendo) → string vazia, não undefined", () => {
    expect(resolveMediaUrl("tenants/t1/x.jpg", new Map())).toBe("");
  });

  it("valor vazio/nulo → string vazia", () => {
    expect(resolveMediaUrl(null, new Map())).toBe("");
    expect(resolveMediaUrl(undefined, new Map())).toBe("");
  });
});
