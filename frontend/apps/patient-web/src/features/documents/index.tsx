import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { paths } from "../../app/paths";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./DocumentsPages");
const verify = () => import("./VerifyPages");

/** S7b `documents` (contract sprint-07 §3.3, S7-F7): my documents, verification, share links. */
export const documentsFeature: FeatureRoutes = {
  public: [
    { path: "/verify", lazy: lazy(verify, "VerifyPage") },
    { path: "/verify/:code", lazy: lazy(verify, "VerifyPage") },
    { path: "/shared/:token", lazy: lazy(verify, "SharedDocumentPage") },
  ],
  patient: [
    { path: paths.documents, lazy: lazy(pages, "DocumentsPage") },
    { path: `${paths.documents}/:documentId`, lazy: lazy(pages, "DocumentDetailPage") },
  ],
};
