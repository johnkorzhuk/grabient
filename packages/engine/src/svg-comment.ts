/** A credit in an SVG's comment, which can hold no `--` (a seed may): each is written `-%2D`. A module of its own, so
    a writer that needs only this carries no other SVG writer's code. */
export const svgComment = (credit: string): string => `<!-- ${credit.replace(/--/g, "-%2D")} -->`;
