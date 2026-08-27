import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };

async function loadConfig(environment: Record<string, string | undefined>) {
  process.env = { ...originalEnvironment, ...environment };
  vi.resetModules();
  return (await import("./app.config.js")).default.expo;
}

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.resetModules();
});

describe("OTA app variant", () => {
  it("uses a distinct app identity and signed xprem updates", async () => {
    const config = await loadConfig({
      APP_VARIANT: "ota",
      XPREM_URL: "https://updates.example.com/",
      XPREM_APP_ID: "paseo-ota",
      XPREM_CHANNEL: "preview",
    });

    expect(config.name).toBe("Paseo OTA");
    expect(config.scheme).toBe("paseo-ota");
    expect(config.ios.bundleIdentifier).toBe("net.omerc.paseo.ota");
    expect(config.android.package).toBe("net.omerc.paseo.ota");
    expect(config.runtimeVersion).toEqual({ policy: "fingerprint" });
    expect(config.updates).toMatchObject({
      url: "https://updates.example.com/manifest",
      requestHeaders: {
        "expo-app-id": "paseo-ota",
        "expo-channel-name": "preview",
      },
      codeSigningCertificate: "./certs/xprem-certificate.pem",
    });
    expect(config.owner).toBeUndefined();
    expect(config.extra.eas).toBeUndefined();
  });

  it("requires the xprem endpoint and app id", async () => {
    await expect(
      loadConfig({ APP_VARIANT: "ota", XPREM_URL: undefined, XPREM_APP_ID: undefined }),
    ).rejects.toThrow("APP_VARIANT=ota requires XPREM_URL and XPREM_APP_ID");
  });

  it("leaves the upstream production variant unchanged", async () => {
    const config = await loadConfig({ APP_VARIANT: "production" });

    expect(config.name).toBe("Paseo");
    expect(config.scheme).toBe("paseo");
    expect(config.android.package).toBe("sh.paseo");
    expect(config.updates).toBeUndefined();
    expect(config.owner).toBe("getpaseo");
  });
});
