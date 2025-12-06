import { createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => {
  return {
    defaultSsr: true,
  };
});

startInstance.createMiddleware().server(({ next }) => {
  return next({
    context: {
      fromStartInstanceMw: true,
    },
  });
});
