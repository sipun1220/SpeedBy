import os from "node:os";

const VIRTUAL_IFACE = /virtual|pseudo|warp|vpn|tap|tun|hyper-v|wsl|bluetooth|docker|vethernet/i;

function getLanIp(): string | null {
  const nets = os.networkInterfaces();
  const candidates: { name: string; address: string; score: number }[] = [];
  for (const [name, list] of Object.entries(nets)) {
    for (const nic of list ?? []) {
      // Non-internal IPv4 = potentially reachable from phones / other PCs
      if (nic.family !== "IPv4" || nic.internal) continue;
      let score = 2;
      // 169.254.x.x = link-local (no DHCP/router): not usable from other devices
      if (nic.address.startsWith("169.254.")) score = 0;
      // VPN / virtual adapters are usually not reachable from the LAN
      else if (VIRTUAL_IFACE.test(name)) score = 1;
      candidates.push({ name, address: nic.address, score });
    }
  }
  // Prefer a physical adapter (Wi-Fi / Ethernet) with a real LAN address,
  // since the LAN URL must be reachable from other devices.
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? null;
}

export async function GET(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip =
    forwarded?.split(",")[0]?.trim() || realIp?.trim() || "127.0.0.1";

  return Response.json({
    ip,
    lanIp: getLanIp(),
    city: "Local",
    country: "Local Network",
    asn: "AS0",
    isp: "Local Server",
    serverLocation: "Localhost",
    colo: "LOCAL",
  });
}
