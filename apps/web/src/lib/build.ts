/** The build this code came from. Every Worker answer names it in `Server-Timing: build`, so a tab opened on an older
    build can tell, and the edge cache keys pages by it, so a deploy never serves pages that link an old build's scripts. */
export const BUILD: string = __BUILD_ID__;
