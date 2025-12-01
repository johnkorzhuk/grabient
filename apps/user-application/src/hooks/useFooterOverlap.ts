import { useEffect, useState } from "react";

interface FooterOverlapState {
    footerOffset: number;
}

export function useFooterOverlap() {
    const [state, setState] = useState<FooterOverlapState>({
        footerOffset: 0,
    });

    useEffect(() => {
        const checkOverlap = () => {
            const footer = document.querySelector("footer");
            if (!footer) return;

            const footerRect = footer.getBoundingClientRect();
            const windowHeight = window.innerHeight;

            // Export panel sits 32px from bottom
            const panelBottomPosition = windowHeight - 32;
            const bufferForPagination = -40;

            // If footer's top is above where panel bottom would be (including pagination buffer), we have overlap
            if (footerRect.top < panelBottomPosition + bufferForPagination) {
                // Push panel up by the amount of overlap
                const offset =
                    panelBottomPosition + bufferForPagination - footerRect.top;
                setState({ footerOffset: offset });
            } else {
                // No overlap, panel stays at normal position
                setState({ footerOffset: 0 });
            }
        };

        // Check on scroll and resize
        window.addEventListener("scroll", checkOverlap, { passive: true });
        window.addEventListener("resize", checkOverlap, { passive: true });

        // Initial check
        checkOverlap();

        return () => {
            window.removeEventListener("scroll", checkOverlap);
            window.removeEventListener("resize", checkOverlap);
        };
    }, []);

    return state;
}
