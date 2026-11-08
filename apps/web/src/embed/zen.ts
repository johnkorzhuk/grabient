/* The zen garden behind any page: `<script src="https://grabient.com/{seed}.js?style=zen" async></script>` (kit.ts).
   Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=zen. */
import zen from "@grabient/engine/kit/fields/zen.ts";
import { KERNEL_GLSL } from "@grabient/engine/kit/gen/zen.ts";
import { mountKit } from "./kit.ts";

mountKit(zen, KERNEL_GLSL);
