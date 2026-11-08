/* The sandstone behind any page: `<script src="https://grabient.com/{seed}.js?style=strata" async></script>` (kit.ts).
   Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=strata. */
import strata from "@grabient/engine/kit/fields/strata.ts";
import { KERNEL_GLSL } from "@grabient/engine/kit/gen/strata.ts";
import { mountKit } from "./kit.ts";

mountKit(strata, KERNEL_GLSL);
