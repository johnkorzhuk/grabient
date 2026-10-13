import link from "@grabient/ui/link.module.css";
import { Rule } from "@grabient/ui/Rule.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import styles from "./Footer.module.css";

/** The foot of every page: what the document is, and the ways to the site and its code. */
export function Footer() {
  return (
    <footer class={styles.foot}>
      <Rule />
      <div class={styles.row}>
        <Text variant="small">Grabient Design, by the Grabient Authors.</Text>
        <nav class={styles.links} aria-label="Grabient">
          <a class={link.quiet} href="https://grabient.com">
            grabient.com
          </a>
          <a class={link.quiet} href="https://github.com/johnkorzhuk/grabient">
            Code on GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
