import { beforeEach, describe, expect, it, vi } from "vitest";

const { openURLMock } = vi.hoisted(() => ({
  openURLMock: vi.fn(),
}));

vi.mock("expo-linking", () => ({
  openURL: openURLMock,
}));

import {
  buildProjectExternalActions,
  deriveProjectExternalLinks,
  normalizeWhatsAppUrl,
  normalizeWazeUrl,
  openProjectExternalAction,
} from "@/modules/projects/external-actions";

describe("project external actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives missing whatsapp and call links from contact details", () => {
    expect(
      deriveProjectExternalLinks({
        waze_url: null,
        whatsapp_url: null,
        call_url: null,
        address_details: {
          waze_deep_link: "https://www.waze.com/ul?ll=31.801,34.643&navigate=yes",
        },
        developer: {
          whatsapp_deep_link: null,
          call_deep_link: null,
          phone: "+972 50-111-0003",
          whatsapp: "+972 50-111-0004",
        },
        contact_phone: null,
        developer_whatsapp: null,
      })
    ).toEqual({
      waze_url: "https://www.waze.com/ul?ll=31.801,34.643&navigate=yes",
      whatsapp_url: "https://wa.me/972501110004",
      call_url: "tel:+972 50-111-0003",
    });
  });

  it("builds project external actions in Waze -> WhatsApp -> Call order", () => {
    expect(
      buildProjectExternalActions({
        waze_url: "https://www.waze.com/ul?ll=31.801,34.643&navigate=yes",
        whatsapp_url: "https://wa.me/972501110001",
        call_url: "tel:+972501110001",
      }).map((action) => action.kind)
    ).toEqual(["waze", "whatsapp", "call"]);
  });

  it("normalizes web waze urls to the native scheme", () => {
    expect(normalizeWazeUrl("https://www.waze.com/ul?ll=31.801,34.643&navigate=yes")).toBe(
      "waze://?ll=31.801%2C34.643&navigate=yes"
    );
  });

  it("normalizes wa.me links to the native WhatsApp send scheme", () => {
    expect(
      normalizeWhatsAppUrl("https://wa.me/972501110001?text=Hello%2C+regarding+project+Mobile+Test+Alpha")
    ).toBe("whatsapp://send?phone=972501110001&text=Hello%2C+regarding+project+Mobile+Test+Alpha");
  });

  it("opens Waze using the native scheme first", async () => {
    openURLMock.mockResolvedValue(undefined);

    await openProjectExternalAction({
      kind: "waze",
      url: "https://www.waze.com/ul?ll=31.801,34.643&navigate=yes",
    });

    expect(openURLMock).toHaveBeenCalledWith("waze://?ll=31.801%2C34.643&navigate=yes");
  });

  it("falls back to the original waze url when native open fails", async () => {
    openURLMock.mockRejectedValueOnce(new Error("no native handler")).mockResolvedValueOnce(undefined);

    await openProjectExternalAction({
      kind: "waze",
      url: "https://www.waze.com/ul?ll=31.801,34.643&navigate=yes",
    });

    expect(openURLMock).toHaveBeenNthCalledWith(1, "waze://?ll=31.801%2C34.643&navigate=yes");
    expect(openURLMock).toHaveBeenNthCalledWith(2, "https://www.waze.com/ul?ll=31.801,34.643&navigate=yes");
  });

  it("opens WhatsApp using the native send scheme first", async () => {
    openURLMock.mockResolvedValue(undefined);

    await openProjectExternalAction({
      kind: "whatsapp",
      url: "https://wa.me/972501110001?text=Hello%2C+regarding+project+Mobile+Test+Alpha",
    });

    expect(openURLMock).toHaveBeenCalledWith(
      "whatsapp://send?phone=972501110001&text=Hello%2C+regarding+project+Mobile+Test+Alpha"
    );
  });

  it("falls back to the original WhatsApp url when native open fails", async () => {
    openURLMock.mockRejectedValueOnce(new Error("no native handler")).mockResolvedValueOnce(undefined);

    await openProjectExternalAction({
      kind: "whatsapp",
      url: "https://wa.me/972501110001?text=Hello%2C+regarding+project+Mobile+Test+Alpha",
    });

    expect(openURLMock).toHaveBeenNthCalledWith(
      1,
      "whatsapp://send?phone=972501110001&text=Hello%2C+regarding+project+Mobile+Test+Alpha"
    );
    expect(openURLMock).toHaveBeenNthCalledWith(
      2,
      "https://wa.me/972501110001?text=Hello%2C+regarding+project+Mobile+Test+Alpha"
    );
  });
});
