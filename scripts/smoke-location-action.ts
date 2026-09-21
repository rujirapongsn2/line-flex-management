import { __testIsBlockedIp, safeLocationFetch } from "../lib/locationHttp";
import {
  parseLocationActionJson,
  runLocationAction,
} from "../lib/locationAction";

async function main() {
  const cases: Array<[string, boolean]> = [
    ["127.0.0.1", true],
    ["10.0.0.1", true],
    ["192.168.1.1", true],
    ["169.254.169.254", true],
    ["8.8.8.8", false],
    ["::1", true],
    ["fc00::1", true],
  ];
  for (const [ip, exp] of cases) {
    const got = __testIsBlockedIp(ip);
    if (got !== exp) throw new Error(`IP ${ip} expected ${exp} got ${got}`);
  }
  console.log("SSRF IP checks OK");

  const cfg = parseLocationActionJson("");
  if (cfg.mode !== "longdo_poi") throw new Error("default mode");
  console.log("default mode OK:", cfg.mode);

  const r = await safeLocationFetch(
    { method: "GET", urlTemplate: "http://127.0.0.1:9/x", timeoutMs: 2000 },
    { lat: 13.7, lon: 100.5 }
  );
  if (r.ok) throw new Error("should reject 127.0.0.1");
  console.log("SSRF 127.0.0.1 rejected:", r.error);

  const none = await runLocationAction({
    config: { mode: "none", reply: { useLlm: true } },
    input: { lat: 13.7563, lon: 100.5018 },
  });
  if (!none.ok || none.mode !== "none") throw new Error("none mode failed");
  console.log("mode=none OK");

  // localhost hostname
  const r2 = await safeLocationFetch(
    {
      method: "GET",
      urlTemplate: "http://localhost/secret",
      timeoutMs: 2000,
    },
    { lat: 1, lon: 2 }
  );
  if (r2.ok) throw new Error("should reject localhost");
  console.log("SSRF localhost rejected:", r2.error);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
