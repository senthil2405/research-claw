// One-time pdf.js worker configuration. Import this module (for its side
// effect) from any client component that renders PDFs, BEFORE rendering.
//
// The worker file is copied into /public at the exact pdfjs-dist version
// (see package.json + the copy step in the build). Serving it from a stable
// /public URL avoids Vite/Next content-hash + version-mismatch issues.
import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export { pdfjs };
