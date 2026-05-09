import worker from "../src/index";

type PagesContext = {
  request: Request;
  env: Record<string, unknown>;
  next(): Promise<Response>;
};

export const onRequest = async (context: PagesContext) => {
  const env = {
    ...context.env,
    ASSETS: {
      fetch: () => context.next(),
    },
  } as Parameters<typeof worker.fetch>[1];

  return worker.fetch(context.request, env);
};
