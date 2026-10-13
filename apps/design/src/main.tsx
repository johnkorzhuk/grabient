import "@grabient/ui/tokens.css";
import "@grabient/ui/base.css";
import { syncMotion } from "@grabient/ui/motion.ts";
import { syncTheme } from "@grabient/ui/theme.ts";
import { render } from "@solidjs/web";
import { App } from "./App.tsx";

/* The document is drawn in the browser alone. The head stamped the theme and the motion choice before this ran;
   these read them, and follow any change made in another tab. */
syncTheme();
syncMotion();
render(() => <App />, document.body);
