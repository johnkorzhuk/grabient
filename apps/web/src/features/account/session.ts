/* Stands in for the accounts area's session (U08) until it lands, under its names: no one is signed in here, and the
   stand-in knows it at once. */

export interface Account {
  id: string;
  username: string | null;
  name: string;
  image: string | null;
  role: "admin" | "user";
}

/** The signed-in account; null when signed out or not known yet. */
export const account = (): Account | null => null;

/** Whether the page knows who is signed in. */
export const sessionReady = (): boolean => true;

export const isAdmin = (): boolean => account()?.role === "admin";
