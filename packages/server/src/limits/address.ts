/** The address a limit counts by: an IPv4 address, or an IPv6 address's /64. One household or one server holds a whole
    /64, and counting each IPv6 address apart would let one machine rotate through billions of keys. Null outside
    Cloudflare. */
export function clientAddress(request: Request): string | null {
  const ip = request.headers.get("CF-Connecting-IP")?.trim().toLowerCase();
  if (!ip) return null;
  const v4 = /\d{1,3}(?:\.\d{1,3}){3}$/.exec(ip);
  if (v4) return v4[0];
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const zeros = tail === undefined ? 0 : Math.max(0, 8 - left.length - right.length);
  const groups = [...left, ...Array<string>(zeros).fill("0"), ...right].slice(0, 4);
  return `${groups.map(group => group.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
