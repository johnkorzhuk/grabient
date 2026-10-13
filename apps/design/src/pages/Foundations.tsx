import { Color } from "./foundations/Color.tsx";
import { Elevation } from "./foundations/Elevation.tsx";
import { Icons } from "./foundations/Icons.tsx";
import { Keys } from "./foundations/Keys.tsx";
import { Layout } from "./foundations/Layout.tsx";
import { Logo } from "./foundations/Logo.tsx";
import { Mobile } from "./foundations/Mobile.tsx";
import { Motion } from "./foundations/Motion.tsx";
import { Never } from "./foundations/Never.tsx";
import { Radius } from "./foundations/Radius.tsx";
import { Spacing } from "./foundations/Spacing.tsx";
import { States } from "./foundations/States.tsx";
import { Tiers } from "./foundations/Tiers.tsx";
import { Type } from "./foundations/Type.tsx";
import { Voice } from "./foundations/Voice.tsx";

/* Foundations, in the order a designer reads them: the variables, the brand, how things behave, and what to write and
   never draw. Each shows its specimens, then the tokens they do not draw, then a few rules. */
export function Foundations() {
  return (
    <>
      <Color />
      <Type />
      <Spacing />
      <Radius />
      <Elevation />
      <Layout />
      <Motion />
      <Logo />
      <Icons />
      <States />
      <Keys />
      <Mobile />
      <Tiers />
      <Voice />
      <Never />
    </>
  );
}
