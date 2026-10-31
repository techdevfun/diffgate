export interface Route {
  path: string;
  handler: string;
}

export const routes: Route[] = [
  { path: "/health", handler: "health" },
];
